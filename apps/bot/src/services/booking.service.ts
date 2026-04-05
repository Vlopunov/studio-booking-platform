import {
  prisma,
  BookingStatus,
  BonusType,
  AddonPriceType,
  type PricingRule,
  PricingRuleType,
  PromoType,
  type LoyaltyTier,
  type Addon,
} from "@studio/database";

// ─── Types ───────────────────────────────────────────────

interface AppliedRule {
  ruleId: string;
  name: string;
  type: string;
  multiplier: number;
}

interface AddonLineItem {
  addonId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface PriceBreakdown {
  baseRate: number;
  hours: number;
  baseTotal: number;
  appliedRules: AppliedRule[];
  addons: AddonLineItem[];
  subtotal: number;
  loyaltyDiscount: number;
  promocodeDiscount: number;
  bonusDiscount: number;
  finalPrice: number;
  bonusEarned: number;
}

export interface CreateBookingInput {
  venueId: string;
  date: Date;
  startTime: string;
  durationHours: number;
  addonSelections?: Array<{ addonId: string; quantity: number }>;
  promocodeCode?: string;
  bonusToSpend?: number;
  comment?: string;
  giftCertId?: string;
}

// ─── Constants ──────────────────────────────────────────

const BUFFER_MINUTES = 30;

const TIER_ORDER: Record<string, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

// ─── Helpers ────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`;
}

function addHoursToTime(time: string, hours: number): string {
  return minutesToTime(timeToMinutes(time) + hours * 60);
}

// ─── Generate human-readable booking ID (B-YYMMDD-NNN) ──

export async function generateHumanId(date: Date): Promise<string> {
  const yy = String(date.getFullYear()).slice(2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const prefix = `B-${yy}${mm}${dd}`;

  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const endOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const todayCount = await prisma.booking.count({
    where: {
      humanId: { startsWith: prefix },
      createdAt: { gte: startOfDay, lt: endOfDay },
    },
  });

  const seq = String(todayCount + 1).padStart(3, "0");
  return `${prefix}-${seq}`;
}

// ─── Validate working hours ─────────────────────────────

export async function validateWorkingHours(
  venueId: string,
  date: Date,
  startTime: string,
  durationHours: number,
): Promise<{ valid: boolean; error?: string }> {
  const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon ... 6=Sun

  const schedule = await prisma.schedule.findFirst({
    where: { venueId, dayOfWeek, isActive: true },
  });

  if (!schedule) {
    return { valid: false, error: "Площадка не работает в этот день." };
  }

  const openMinutes = timeToMinutes(schedule.openTime);
  const closeMinutes = timeToMinutes(schedule.closeTime);
  const bookingStart = timeToMinutes(startTime);
  const bookingEnd = bookingStart + durationHours * 60;

  if (bookingStart < openMinutes) {
    return {
      valid: false,
      error: `Площадка открывается в ${schedule.openTime}. Выбранное время раньше.`,
    };
  }

  if (bookingEnd > closeMinutes) {
    return {
      valid: false,
      error: `Площадка закрывается в ${schedule.closeTime}. Бронирование выходит за рабочие часы.`,
    };
  }

  return { valid: true };
}

// ─── Check slot conflicts with 30-min buffer ────────────

export async function checkSlotConflict(
  venueId: string,
  date: Date,
  startTime: string,
  endTime: string,
  tx?: any,
): Promise<{ conflict: boolean; error?: string }> {
  const db = tx || prisma;
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const existingBookings = await db.booking.findMany({
    where: {
      venueId,
      date: dateStart,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    },
    select: { humanId: true, startTime: true, endTime: true },
  });

  const requestedStart = timeToMinutes(startTime);
  const requestedEnd = timeToMinutes(endTime);

  for (const existing of existingBookings) {
    const existStart = timeToMinutes(existing.startTime) - BUFFER_MINUTES;
    const existEnd = timeToMinutes(existing.endTime) + BUFFER_MINUTES;

    if (requestedStart < existEnd && requestedEnd > existStart) {
      return {
        conflict: true,
        error:
          `Конфликт с бронированием ${existing.humanId} ` +
          `(${existing.startTime}–${existing.endTime}). ` +
          `Между бронированиями должен быть перерыв в 30 минут.`,
      };
    }
  }

  return { conflict: false };
}

// ─── Calculate price (mirrors API pricing.service) ──────

function matchesPricingRule(
  rule: PricingRule,
  date: Date,
  startTime: string,
  durationHours: number,
): boolean {
  switch (rule.type) {
    case PricingRuleType.WEEKEND: {
      const dayOfWeek = (date.getDay() + 6) % 7;
      return rule.dayOfWeek === dayOfWeek;
    }
    case PricingRuleType.TIME_RANGE: {
      if (!rule.startTime || !rule.endTime) return false;
      const bookingStart = timeToMinutes(startTime);
      const ruleStart = timeToMinutes(rule.startTime);
      const ruleEnd = timeToMinutes(rule.endTime);
      return bookingStart >= ruleStart && bookingStart < ruleEnd;
    }
    case PricingRuleType.SPECIFIC_DATE: {
      if (!rule.specificDate) return false;
      const ruleDate = new Date(rule.specificDate);
      return (
        ruleDate.getFullYear() === date.getFullYear() &&
        ruleDate.getMonth() === date.getMonth() &&
        ruleDate.getDate() === date.getDate()
      );
    }
    case PricingRuleType.LONG_BOOKING: {
      return rule.minHours !== null && durationHours >= (rule.minHours ?? 0);
    }
    default:
      return false;
  }
}

export async function calculatePrice(
  venueId: string,
  date: Date,
  startTime: string,
  durationHours: number,
  clientId: string,
  addonSelections?: Array<{ addonId: string; quantity: number }>,
  promocodeCode?: string,
  bonusToSpend?: number,
): Promise<PriceBreakdown> {
  // 1. Load venue
  const venue = await prisma.venue.findUniqueOrThrow({
    where: { id: venueId },
  });
  const baseRate = Number(venue.pricePerHour);
  const baseTotal = baseRate * durationHours;

  // 2. Load and apply pricing rules (multiplicatively, ordered by priority)
  const rules = await prisma.pricingRule.findMany({
    where: { venueId, isActive: true },
    orderBy: { priority: "asc" },
  });

  const appliedRules: AppliedRule[] = [];
  let adjustedTotal = baseTotal;

  for (const rule of rules) {
    if (matchesPricingRule(rule, date, startTime, durationHours)) {
      const multiplier = Number(rule.multiplier);
      adjustedTotal = adjustedTotal * multiplier;
      appliedRules.push({
        ruleId: rule.id,
        name: rule.name,
        type: rule.type,
        multiplier,
      });
    }
  }

  // 3. Calculate addons
  const addonLineItems: AddonLineItem[] = [];
  let addonsTotal = 0;

  if (addonSelections && addonSelections.length > 0) {
    const addonIds = addonSelections.map((s) => s.addonId);
    const addons = await prisma.addon.findMany({
      where: { id: { in: addonIds }, isActive: true },
    });

    const addonMap = new Map<string, Addon>();
    for (const addon of addons) {
      addonMap.set(addon.id, addon);
    }

    for (const selection of addonSelections) {
      const addon = addonMap.get(selection.addonId);
      if (!addon) continue;

      const unitPrice = Number(addon.price);
      const quantity = Math.min(selection.quantity, addon.maxQuantity);
      const total =
        addon.priceType === AddonPriceType.PER_HOUR
          ? unitPrice * quantity * durationHours
          : unitPrice * quantity;

      addonLineItems.push({
        addonId: addon.id,
        name: addon.name,
        quantity,
        unitPrice,
        total,
      });

      addonsTotal += total;
    }
  }

  let subtotal = adjustedTotal + addonsTotal;

  // 4. Loyalty tier discount (from LoyaltySettings)
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
  });

  const loyaltyDiscountSetting = await prisma.loyaltySettings.findUnique({
    where: { key: `discount_${client.loyaltyTier.toLowerCase()}` },
  });
  const loyaltyDiscountPercent = loyaltyDiscountSetting
    ? Number(loyaltyDiscountSetting.value)
    : 0;
  const loyaltyDiscount =
    Math.round(subtotal * (loyaltyDiscountPercent / 100) * 100) / 100;
  subtotal -= loyaltyDiscount;

  // 5. Promocode discount
  let promocodeDiscount = 0;

  if (promocodeCode) {
    const promo = await prisma.promocode.findUnique({
      where: { code: promocodeCode },
    });

    if (promo) {
      const now = new Date();
      const isActive = promo.isActive;
      const withinDates = now >= promo.validFrom && now <= promo.validUntil;
      const underMaxUses =
        promo.maxUses === null || promo.usedCount < promo.maxUses;
      const venueOk = promo.venueId === null || promo.venueId === venueId;
      const tierOk =
        promo.tierRestriction === null ||
        TIER_ORDER[client.loyaltyTier] >=
          TIER_ORDER[promo.tierRestriction as string];

      const alreadyUsed = await prisma.usedPromocode.findUnique({
        where: {
          clientId_promocodeId: { clientId, promocodeId: promo.id },
        },
      });

      let firstBookingOk = true;
      if (promo.firstBookingOnly) {
        firstBookingOk = client.totalBookings === 0;
      }

      if (
        isActive &&
        withinDates &&
        underMaxUses &&
        venueOk &&
        tierOk &&
        !alreadyUsed &&
        firstBookingOk
      ) {
        switch (promo.type) {
          case PromoType.PERCENT: {
            promocodeDiscount =
              Math.round(subtotal * (Number(promo.value) / 100) * 100) / 100;
            if (promo.maxDiscount !== null) {
              promocodeDiscount = Math.min(
                promocodeDiscount,
                Number(promo.maxDiscount),
              );
            }
            break;
          }
          case PromoType.FIXED: {
            promocodeDiscount = Math.min(Number(promo.value), subtotal);
            break;
          }
          case PromoType.BONUS_POINTS: {
            promocodeDiscount = 0;
            break;
          }
        }
      }
    }
  }

  subtotal -= promocodeDiscount;

  // 6. Bonus spend (max 50% of post-discount price)
  let bonusDiscount = 0;
  if (bonusToSpend && bonusToSpend > 0) {
    const maxBonusSpend = Math.floor(subtotal * 0.5);
    const availableBonus = client.bonusBalance;
    bonusDiscount = Math.min(bonusToSpend, maxBonusSpend, availableBonus);
  }

  const finalPrice = Math.round((subtotal - bonusDiscount) * 100) / 100;

  // 7. Calculate bonus earned (estimate — actual crediting happens on COMPLETED)
  const earnRateSetting = await prisma.loyaltySettings.findUnique({
    where: { key: "earn_rate" },
  });
  const earnRate = earnRateSetting ? Number(earnRateSetting.value) : 0;
  const bonusEarned = Math.floor(finalPrice * (earnRate / 100));

  return {
    baseRate,
    hours: durationHours,
    baseTotal,
    appliedRules,
    addons: addonLineItems,
    subtotal: adjustedTotal + addonsTotal,
    loyaltyDiscount,
    promocodeDiscount,
    bonusDiscount,
    finalPrice,
    bonusEarned,
  };
}

// ─── Create booking (transactional, with all validations) ─

export async function createBooking(
  clientId: string,
  input: CreateBookingInput,
): Promise<{
  booking: Awaited<ReturnType<typeof prisma.booking.findUniqueOrThrow>>;
  priceBreakdown: PriceBreakdown;
}> {
  const {
    venueId,
    date,
    startTime,
    durationHours,
    addonSelections,
    promocodeCode,
    bonusToSpend,
    comment,
    giftCertId,
  } = input;

  const endTime = addHoursToTime(startTime, durationHours);

  // 1. Validate working hours
  const workingHoursCheck = await validateWorkingHours(
    venueId,
    date,
    startTime,
    durationHours,
  );
  if (!workingHoursCheck.valid) {
    throw new Error(workingHoursCheck.error);
  }

  // 2. Calculate price before transaction (reads only)
  const priceBreakdown = await calculatePrice(
    venueId,
    date,
    startTime,
    durationHours,
    clientId,
    addonSelections,
    promocodeCode,
    bonusToSpend,
  );

  // 3. Generate humanId
  const humanId = await generateHumanId(new Date());

  // 4. Create booking in a transaction with conflict check
  const booking = await prisma.$transaction(async (tx) => {
    // Check for slot conflicts (with 30-min buffer)
    const dateStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
    );
    const requestedStart = timeToMinutes(startTime);
    const requestedEnd = timeToMinutes(endTime);

    const conflicting = await tx.booking.findMany({
      where: {
        venueId,
        date: dateStart,
        status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
      },
    });

    for (const existing of conflicting) {
      const existStart = timeToMinutes(existing.startTime) - BUFFER_MINUTES;
      const existEnd = timeToMinutes(existing.endTime) + BUFFER_MINUTES;

      if (requestedStart < existEnd && requestedEnd > existStart) {
        throw new Error(
          `Конфликт с бронированием ${existing.humanId} ` +
            `(${existing.startTime}–${existing.endTime}). ` +
            `Между бронированиями должен быть перерыв в 30 минут.`,
        );
      }
    }

    // Deduct bonus if spending
    if (priceBreakdown.bonusDiscount > 0) {
      await tx.client.update({
        where: { id: clientId },
        data: { bonusBalance: { decrement: priceBreakdown.bonusDiscount } },
      });

      await tx.bonusTransaction.create({
        data: {
          clientId,
          amount: -priceBreakdown.bonusDiscount,
          type: BonusType.SPENT,
          description: `Списание ${priceBreakdown.bonusDiscount} бонусов за бронирование ${humanId}`,
        },
      });
    }

    // Record promocode usage
    if (promocodeCode && priceBreakdown.promocodeDiscount > 0) {
      const promo = await tx.promocode.findUnique({
        where: { code: promocodeCode },
      });

      if (promo) {
        await tx.usedPromocode.create({
          data: {
            clientId,
            promocodeId: promo.id,
          },
        });

        await tx.promocode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
      }
    }

    // Create the booking — bonusEarned is stored as estimate,
    // actual bonus crediting happens only on COMPLETED status
    const newBooking = await tx.booking.create({
      data: {
        humanId,
        clientId,
        venueId,
        date: dateStart,
        startTime,
        endTime,
        durationHours,
        basePrice: priceBreakdown.baseTotal,
        pricingDetails: {
          baseRate: priceBreakdown.baseRate,
          appliedRules: priceBreakdown.appliedRules,
        },
        addonsTotal: priceBreakdown.addons.reduce((sum, a) => sum + a.total, 0),
        discountAmount:
          priceBreakdown.loyaltyDiscount + priceBreakdown.promocodeDiscount,
        discountDetails: {
          loyaltyDiscount: priceBreakdown.loyaltyDiscount,
          promocodeDiscount: priceBreakdown.promocodeDiscount,
        },
        bonusUsed: priceBreakdown.bonusDiscount,
        bonusEarned: priceBreakdown.bonusEarned,
        finalPrice: priceBreakdown.finalPrice,
        promocodeId: promocodeCode
          ? (
              await tx.promocode.findUnique({
                where: { code: promocodeCode },
              })
            )?.id
          : undefined,
        comment,
        giftCertId,
        status: BookingStatus.PENDING,
      },
      include: {
        venue: true,
        client: true,
      },
    });

    // Create booking addons
    if (addonSelections && addonSelections.length > 0) {
      for (const addonLine of priceBreakdown.addons) {
        await tx.bookingAddon.create({
          data: {
            bookingId: newBooking.id,
            addonId: addonLine.addonId,
            quantity: addonLine.quantity,
            price: addonLine.total,
          },
        });
      }
    }

    return newBooking;
  });

  // 5. Record analytics event
  await prisma.analyticsEvent.create({
    data: {
      type: "booking.created",
      clientId,
      venueId,
      metadata: {
        bookingId: booking.id,
        humanId,
        date: date.toISOString(),
        startTime,
        durationHours,
        finalPrice: priceBreakdown.finalPrice,
      },
    },
  });

  return { booking, priceBreakdown };
}
