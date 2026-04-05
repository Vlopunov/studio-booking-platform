import {
  prisma,
  type Addon,
  type PricingRule,
  type LoyaltyTier,
  AddonPriceType,
  PricingRuleType,
  PromoType,
} from "@studio/database";

// ─── Types ───────────────────────────────────────────────

interface AppliedRule {
  ruleId: string;
  name: string;
  type: PricingRuleType;
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

interface AddonSelection {
  addonId: string;
  quantity: number;
}

// ─── Loyalty tier order for comparison ───────────────────

const TIER_ORDER: Record<LoyaltyTier, number> = {
  BRONZE: 0,
  SILVER: 1,
  GOLD: 2,
  PLATINUM: 3,
};

// ─── Helpers ─────────────────────────────────────────────

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function matchesPricingRule(
  rule: PricingRule,
  date: Date,
  startTime: string,
  durationHours: number,
): boolean {
  switch (rule.type) {
    case PricingRuleType.WEEKEND: {
      const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon ... 6=Sun
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

// ─── Main pricing function ───────────────────────────────

export async function calculatePrice(
  venueId: string,
  date: Date,
  startTime: string,
  durationHours: number,
  clientId: string,
  addonSelections?: AddonSelection[],
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

  // 4. Loyalty tier discount
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
  });

  const loyaltyDiscountSetting = await prisma.loyaltySettings.findUnique({
    where: { key: `discount_${client.loyaltyTier.toLowerCase()}` },
  });
  const loyaltyDiscountPercent = loyaltyDiscountSetting
    ? Number(loyaltyDiscountSetting.value)
    : 0;
  const loyaltyDiscount = Math.round(subtotal * (loyaltyDiscountPercent / 100) * 100) / 100;
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
      const underMaxUses = promo.maxUses === null || promo.usedCount < promo.maxUses;
      const venueOk = promo.venueId === null || promo.venueId === venueId;

      // Check tier restriction
      const tierOk =
        promo.tierRestriction === null ||
        TIER_ORDER[client.loyaltyTier] >= TIER_ORDER[promo.tierRestriction];

      // Check if client already used this promo
      const alreadyUsed = await prisma.usedPromocode.findUnique({
        where: {
          clientId_promocodeId: { clientId, promocodeId: promo.id },
        },
      });

      // Check firstBookingOnly
      let firstBookingOk = true;
      if (promo.firstBookingOnly) {
        firstBookingOk = client.totalBookings === 0;
      }

      // Check minOrderAmount against subtotal before promo discount
      const minOrderOk =
        promo.minOrderAmount === null || subtotal >= Number(promo.minOrderAmount);

      if (
        isActive &&
        withinDates &&
        underMaxUses &&
        venueOk &&
        tierOk &&
        !alreadyUsed &&
        firstBookingOk &&
        minOrderOk
      ) {
        switch (promo.type) {
          case PromoType.PERCENT: {
            promocodeDiscount = Math.round(subtotal * (Number(promo.value) / 100) * 100) / 100;
            if (promo.maxDiscount !== null) {
              promocodeDiscount = Math.min(promocodeDiscount, Number(promo.maxDiscount));
            }
            break;
          }
          case PromoType.FIXED: {
            promocodeDiscount = Math.min(Number(promo.value), subtotal);
            break;
          }
          case PromoType.BONUS_POINTS: {
            // Bonus points promos don't reduce price; they add bonus instead
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

  // 7. Calculate bonus earned
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
