// ---------------------------------------------------------------------------
// Loyalty tiers
// ---------------------------------------------------------------------------

export interface LoyaltyTier {
  name: string;
  /** Minimum total spend (in base currency units) to reach this tier */
  minSpend: number;
  /** Discount percentage applied to bookings */
  discountPercent: number;
}

export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  { name: "Bronze", minSpend: 0, discountPercent: 0 },
  { name: "Silver", minSpend: 10_000, discountPercent: 3 },
  { name: "Gold", minSpend: 30_000, discountPercent: 5 },
  { name: "Platinum", minSpend: 70_000, discountPercent: 8 },
  { name: "Diamond", minSpend: 150_000, discountPercent: 12 },
] as const;

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

/** Buffer time (minutes) between consecutive bookings for cleanup */
export const BOOKING_BUFFER_MINUTES = 30;

// ---------------------------------------------------------------------------
// Bonus / cashback
// ---------------------------------------------------------------------------

/** Maximum percentage of the booking total that can be paid with bonus points */
export const MAX_BONUS_SPEND_PERCENT = 50;

/** Cashback rate: clients earn this % of the booking total as bonus points */
export const BONUS_EARN_RATE = 5;

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

/** Booking count milestones that trigger special rewards */
export const MILESTONES: readonly number[] = [5, 10, 20, 50, 100] as const;

// ---------------------------------------------------------------------------
// Messaging
// ---------------------------------------------------------------------------

/** Hours during which automated messages should NOT be sent */
export const QUIET_HOURS = {
  start: 22, // 22:00
  end: 9, // 09:00
} as const;

/** Minimum interval (in minutes) between automated campaign messages to the same client */
export const CAMPAIGN_THROTTLE_MINUTES = 1440; // 24 hours

// ---------------------------------------------------------------------------
// Error codes (string enum re-exported from errors for convenience)
// ---------------------------------------------------------------------------

export { ErrorCode } from "./errors";
