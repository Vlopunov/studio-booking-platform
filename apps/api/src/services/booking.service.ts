import {
  prisma,
  BookingStatus,
  BonusType,
} from "@studio/database";
import { calculatePrice, type PriceBreakdown } from "./pricing.service";
import {
  recalculateTier,
  awardBookingBonuses,
  processReferralBonus,
  checkMilestone,
} from "./loyalty.service";
import {
  notifyAdminNewBooking,
  notifyClientBookingConfirmed,
  notifyClientBookingCancelled,
} from "./notification.service";

// ─── Types ───────────────────────────────────────────────

interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
}

interface CreateBookingInput {
  venueId: string;
  date: Date;
  startTime: string;
  durationHours: number;
  addonSelections?: Array<{ addonId: string; quantity: number }>;
  promocodeCode?: string;
  bonusToSpend?: number;
  comment?: string;
  utmSource?: string;
  campaignId?: string;
  giftCertId?: string;
}

// ─── Helpers ─────────────────────────────────────────────

const BUFFER_MINUTES = 30;

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

// ─── Generate human-readable booking ID ──────────────────

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

// ─── Find available slots ────────────────────────────────

export async function findAvailableSlots(
  venueId: string,
  date: Date,
): Promise<TimeSlot[]> {
  const dayOfWeek = (date.getDay() + 6) % 7; // 0=Mon ... 6=Sun

  // 1. Get schedule for this day
  const schedule = await prisma.schedule.findUnique({
    where: { venueId_dayOfWeek: { venueId, dayOfWeek } },
  });

  if (!schedule || !schedule.isActive) {
    return [];
  }

  const openMinutes = timeToMinutes(schedule.openTime);
  const closeMinutes = timeToMinutes(schedule.closeTime);

  // 2. Get blocked slots overlapping this date
  const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dateEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

  const blockedSlots = await prisma.blockedSlot.findMany({
    where: {
      venueId,
      dateFrom: { lt: dateEnd },
      dateTo: { gt: dateStart },
    },
  });

  // 3. Get existing bookings for this date
  const existingBookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: dateStart,
      status: { in: [BookingStatus.PENDING, BookingStatus.CONFIRMED] },
    },
    select: { startTime: true, endTime: true },
  });

  // 4. Build occupied intervals (including buffer)
  const occupiedIntervals: Array<{ start: number; end: number }> = [];

  for (const booking of existingBookings) {
    occupiedIntervals.push({
      start: timeToMinutes(booking.startTime) - BUFFER_MINUTES,
      end: timeToMinutes(booking.endTime) + BUFFER_MINUTES,
    });
  }

  for (const blocked of blockedSlots) {
    // Convert blocked slot times to minutes relative to the date
    const blockedStartMinutes = Math.max(
      openMinutes,
      blocked.dateFrom <= dateStart
        ? openMinutes
        : blocked.dateFrom.getHours() * 60 + blocked.dateFrom.getMinutes(),
    );
    const blockedEndMinutes = Math.min(
      closeMinutes,
      blocked.dateTo >= dateEnd
        ? closeMinutes
        : blocked.dateTo.getHours() * 60 + blocked.dateTo.getMinutes(),
    );

    occupiedIntervals.push({
      start: blockedStartMinutes,
      end: blockedEndMinutes,
    });
  }

  // 5. Generate hourly slots and check availability
  const slots: TimeSlot[] = [];

  for (let mins = openMinutes; mins < closeMinutes; mins += 60) {
    const slotStart = mins;
    const slotEnd = mins + 60;

    if (slotEnd > closeMinutes) break;

    const startTime = minutesToTime(slotStart);
    const endTime = minutesToTime(slotEnd);

    const isOccupied = occupiedIntervals.some(
      (interval) => slotStart < interval.end && slotEnd > interval.start,
    );

    slots.push({
      startTime,
      endTime,
      available: !isOccupied,
    });
  }

  return slots;
}

// ─── Create booking ──────────────────────────────────────

export async function createBooking(
  clientId: string,
  input: CreateBookingInput,
): Promise<{ booking: ReturnType<typeof prisma.booking.findUniqueOrThrow> extends Promise<infer T> ? T : never; priceBreakdown: PriceBreakdown }> {
  const {
    venueId,
    date,
    startTime,
    durationHours,
    addonSelections,
    promocodeCode,
    bonusToSpend,
    comment,
    utmSource,
    campaignId,
    giftCertId,
  } = input;

  const endTime = addHoursToTime(startTime, durationHours);

  // Calculate price before transaction (reads only)
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

  const humanId = await generateHumanId(new Date());

  const booking = await prisma.$transaction(async (tx) => {
    // Check for slot conflicts using SELECT ... FOR UPDATE pattern
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
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
          `Time slot conflict with booking ${existing.humanId} ` +
          `(${existing.startTime}-${existing.endTime})`,
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
          description: `Spent ${priceBreakdown.bonusDiscount} bonus on booking ${humanId}`,
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

    // Create the booking
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
          ? (await tx.promocode.findUnique({ where: { code: promocodeCode } }))?.id
          : undefined,
        comment,
        utmSource,
        campaignId,
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

  // Notify admin (non-blocking)
  notifyAdminNewBooking(booking).catch((err: unknown) => {
    console.error("Failed to notify admin of new booking:", err);
  });

  return { booking, priceBreakdown };
}

// ─── Confirm booking ─────────────────────────────────────

export async function confirmBooking(
  bookingId: string,
  adminId: string,
): Promise<ReturnType<typeof prisma.booking.update>> {
  const booking = await prisma.booking.update({
    where: { id: bookingId },
    data: {
      status: BookingStatus.CONFIRMED,
      confirmedAt: new Date(),
      adminNote: `Confirmed by admin ${adminId}`,
    },
    include: { venue: true, client: true },
  });

  // Notify client (non-blocking)
  notifyClientBookingConfirmed(booking).catch((err: unknown) => {
    console.error("Failed to notify client of confirmation:", err);
  });

  return booking;
}

// ─── Cancel booking ──────────────────────────────────────

export async function cancelBooking(
  bookingId: string,
  cancelledBy: string,
  reason?: string,
): Promise<ReturnType<typeof prisma.booking.update>> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { client: true, venue: true },
  });

  if (booking.status === BookingStatus.CANCELLED || booking.status === BookingStatus.COMPLETED) {
    throw new Error(`Cannot cancel booking in status ${booking.status}`);
  }

  const updatedBooking = await prisma.$transaction(async (tx) => {
    // Reverse bonus spent
    if (booking.bonusUsed > 0) {
      await tx.client.update({
        where: { id: booking.clientId },
        data: { bonusBalance: { increment: booking.bonusUsed } },
      });

      await tx.bonusTransaction.create({
        data: {
          clientId: booking.clientId,
          amount: booking.bonusUsed,
          type: BonusType.ADMIN_ADJUST,
          description: `Refund ${booking.bonusUsed} bonus for cancelled booking ${booking.humanId}`,
          bookingId: booking.id,
        },
      });
    }

    // Update booking status
    const updated = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.CANCELLED,
        cancelledAt: new Date(),
        cancelledBy,
        cancelReason: reason,
      },
      include: { venue: true, client: true },
    });

    return updated;
  });

  // Notify client (non-blocking)
  notifyClientBookingCancelled(updatedBooking, reason).catch((err: unknown) => {
    console.error("Failed to notify client of cancellation:", err);
  });

  return updatedBooking;
}

// ─── Complete booking ────────────────────────────────────

export async function completeBooking(
  bookingId: string,
): Promise<ReturnType<typeof prisma.booking.update>> {
  const booking = await prisma.booking.findUniqueOrThrow({
    where: { id: bookingId },
    include: { client: true },
  });

  if (booking.status !== BookingStatus.CONFIRMED) {
    throw new Error(`Cannot complete booking in status ${booking.status}`);
  }

  const finalPrice = Number(booking.finalPrice);

  const updatedBooking = await prisma.$transaction(async (tx) => {
    // Update booking
    const completed = await tx.booking.update({
      where: { id: bookingId },
      data: {
        status: BookingStatus.COMPLETED,
        completedAt: new Date(),
      },
      include: { venue: true, client: true },
    });

    // Update client stats
    await tx.client.update({
      where: { id: booking.clientId },
      data: {
        totalBookings: { increment: 1 },
        totalSpent: { increment: finalPrice },
        lastActivityAt: new Date(),
      },
    });

    return completed;
  });

  // Award bonuses (after transaction commits)
  const bonusEarned = await awardBookingBonuses(booking.clientId, bookingId, finalPrice);

  // Update bonusEarned on booking if differs from estimate
  if (bonusEarned !== booking.bonusEarned) {
    await prisma.booking.update({
      where: { id: bookingId },
      data: { bonusEarned },
    });
  }

  // Process referral bonus if applicable
  if (booking.client.referredById) {
    const isFirstCompleted = await prisma.booking.count({
      where: {
        clientId: booking.clientId,
        status: BookingStatus.COMPLETED,
      },
    });

    // isFirstCompleted === 1 means this was their first completed booking
    if (isFirstCompleted === 1) {
      await processReferralBonus(booking.client.referredById, booking.clientId, bookingId);
    }
  }

  // Check milestones
  const client = await prisma.client.findUniqueOrThrow({
    where: { id: booking.clientId },
  });
  await checkMilestone(booking.clientId, client.totalBookings);

  // Recalculate tier
  await recalculateTier(booking.clientId);

  return updatedBooking;
}
