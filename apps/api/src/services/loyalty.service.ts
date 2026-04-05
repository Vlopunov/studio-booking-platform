import {
  prisma,
  LoyaltyTier,
  BonusType,
} from "@studio/database";

// ─── Types ───────────────────────────────────────────────

interface TierRecalcResult {
  newTier: LoyaltyTier;
  upgraded: boolean;
  bonusForUpgrade: number;
}

interface LoyaltySettingsMap {
  [key: string]: string;
}

// ─── Tier hierarchy ──────────────────────────────────────

const TIER_LEVELS: LoyaltyTier[] = [
  LoyaltyTier.BRONZE,
  LoyaltyTier.SILVER,
  LoyaltyTier.GOLD,
  LoyaltyTier.PLATINUM,
];

const TIER_INDEX: Record<LoyaltyTier, number> = {
  [LoyaltyTier.BRONZE]: 0,
  [LoyaltyTier.SILVER]: 1,
  [LoyaltyTier.GOLD]: 2,
  [LoyaltyTier.PLATINUM]: 3,
};

// ─── Helpers ─────────────────────────────────────────────

export async function getLoyaltySettings(): Promise<LoyaltySettingsMap> {
  const rows = await prisma.loyaltySettings.findMany();
  const map: LoyaltySettingsMap = {};
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

function settingNum(settings: LoyaltySettingsMap, key: string, fallback: number): number {
  const val = settings[key];
  if (val === undefined) return fallback;
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

// ─── Recalculate tier ────────────────────────────────────

export async function recalculateTier(clientId: string): Promise<TierRecalcResult> {
  const settings = await getLoyaltySettings();

  const client = await prisma.client.findUniqueOrThrow({
    where: { id: clientId },
  });

  const currentIndex = TIER_INDEX[client.loyaltyTier];
  let determinedTier = LoyaltyTier.BRONZE;

  // Walk through tiers from highest to lowest, pick the first one the client qualifies for
  for (let i = TIER_LEVELS.length - 1; i >= 1; i--) {
    const tierName = TIER_LEVELS[i].toLowerCase();
    const minBookings = settingNum(settings, `tier_${tierName}_min_bookings`, Infinity);
    const minSpent = settingNum(settings, `tier_${tierName}_min_spent`, Infinity);

    if (client.totalBookings >= minBookings && Number(client.totalSpent) >= minSpent) {
      determinedTier = TIER_LEVELS[i];
      break;
    }
  }

  const newIndex = TIER_INDEX[determinedTier];
  const upgraded = newIndex > currentIndex;

  let bonusForUpgrade = 0;

  if (upgraded) {
    const tierName = determinedTier.toLowerCase();
    bonusForUpgrade = settingNum(settings, `tier_${tierName}_upgrade_bonus`, 0);

    await prisma.$transaction(async (tx) => {
      await tx.client.update({
        where: { id: clientId },
        data: { loyaltyTier: determinedTier },
      });

      if (bonusForUpgrade > 0) {
        await tx.client.update({
          where: { id: clientId },
          data: { bonusBalance: { increment: bonusForUpgrade } },
        });

        await tx.bonusTransaction.create({
          data: {
            clientId,
            amount: bonusForUpgrade,
            type: BonusType.TIER_UPGRADE,
            description: `Upgrade to ${determinedTier}: +${bonusForUpgrade} bonus`,
          },
        });
      }
    });
  }

  return {
    newTier: determinedTier,
    upgraded,
    bonusForUpgrade,
  };
}

// ─── Award booking bonuses ───────────────────────────────

export async function awardBookingBonuses(
  clientId: string,
  bookingId: string,
  finalPrice: number,
): Promise<number> {
  const settings = await getLoyaltySettings();
  const earnRate = settingNum(settings, "earn_rate", 0);
  const bonusEarned = Math.floor(finalPrice * (earnRate / 100));

  if (bonusEarned <= 0) return 0;

  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: { bonusBalance: { increment: bonusEarned } },
    });

    await tx.bonusTransaction.create({
      data: {
        clientId,
        amount: bonusEarned,
        type: BonusType.EARNED,
        description: `Booking ${bookingId}: earned ${bonusEarned} bonus`,
        bookingId,
      },
    });
  });

  return bonusEarned;
}

// ─── Referral bonus ──────────────────────────────────────

export async function processReferralBonus(
  referrerId: string,
  referredId: string,
  bookingId: string,
): Promise<void> {
  const settings = await getLoyaltySettings();
  const referrerBonus = settingNum(settings, "referral_referrer_bonus", 0);
  const referredBonus = settingNum(settings, "referral_referred_bonus", 0);

  // Only award once per referred client (check if any referral bonus already exists)
  const existingReferralBonus = await prisma.bonusTransaction.findFirst({
    where: {
      clientId: referrerId,
      type: BonusType.REFERRAL,
      description: { contains: referredId },
    },
  });

  if (existingReferralBonus) return;

  await prisma.$transaction(async (tx) => {
    // Award referrer
    if (referrerBonus > 0) {
      await tx.client.update({
        where: { id: referrerId },
        data: { bonusBalance: { increment: referrerBonus } },
      });

      await tx.bonusTransaction.create({
        data: {
          clientId: referrerId,
          amount: referrerBonus,
          type: BonusType.REFERRAL,
          description: `Referral bonus for client ${referredId}, booking ${bookingId}`,
          bookingId,
        },
      });
    }

    // Award referred client
    if (referredBonus > 0) {
      await tx.client.update({
        where: { id: referredId },
        data: { bonusBalance: { increment: referredBonus } },
      });

      await tx.bonusTransaction.create({
        data: {
          clientId: referredId,
          amount: referredBonus,
          type: BonusType.REFERRAL,
          description: `Welcome bonus from referral by ${referrerId}, booking ${bookingId}`,
          bookingId,
        },
      });
    }
  });
}

// ─── Milestone check ─────────────────────────────────────

export async function checkMilestone(
  clientId: string,
  totalBookings: number,
): Promise<{ milestoneHit: boolean; bonus: number }> {
  const settings = await getLoyaltySettings();

  // Milestones stored as "milestone_5", "milestone_10", "milestone_25", etc.
  const milestoneKey = `milestone_${totalBookings}`;
  const milestoneBonus = settingNum(settings, milestoneKey, 0);

  if (milestoneBonus <= 0) {
    return { milestoneHit: false, bonus: 0 };
  }

  // Check if milestone already awarded
  const existingMilestone = await prisma.bonusTransaction.findFirst({
    where: {
      clientId,
      type: BonusType.MILESTONE_BONUS,
      description: { contains: `milestone ${totalBookings}` },
    },
  });

  if (existingMilestone) {
    return { milestoneHit: false, bonus: 0 };
  }

  await prisma.$transaction(async (tx) => {
    await tx.client.update({
      where: { id: clientId },
      data: { bonusBalance: { increment: milestoneBonus } },
    });

    await tx.bonusTransaction.create({
      data: {
        clientId,
        amount: milestoneBonus,
        type: BonusType.MILESTONE_BONUS,
        description: `Reached milestone ${totalBookings} bookings: +${milestoneBonus} bonus`,
      },
    });
  });

  return { milestoneHit: true, bonus: milestoneBonus };
}
