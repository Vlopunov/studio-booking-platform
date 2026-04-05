import { z } from "zod";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const timeString = z.string().regex(/^\d{2}:\d{2}$/, "Expected HH:MM");
const dateTimeString = z.string().datetime({ message: "Expected ISO 8601 datetime" });

// ---------------------------------------------------------------------------
// Booking
// ---------------------------------------------------------------------------

export const bookingCreateSchema = z.object({
  venueId: z.string().uuid(),
  date: dateString,
  startTime: timeString,
  durationHours: z.number().positive().max(24),
  addonIds: z.array(z.string().uuid()).optional(),
  comment: z.string().max(500).optional(),
  promocode: z.string().max(50).optional(),
  bonusToSpend: z.number().nonnegative().optional(),
});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

export const clientRegisterSchema = z.object({
  telegramId: z.number().int().positive(),
  firstName: z.string().min(1).max(100),
  lastName: z.string().max(100).optional(),
  phone: z
    .string()
    .regex(/^\+?\d{7,15}$/, "Invalid phone number")
    .optional(),
  birthday: dateString.optional(),
});

export type ClientRegisterInput = z.infer<typeof clientRegisterSchema>;

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

export const reviewCreateSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).optional(),
});

export type ReviewCreateInput = z.infer<typeof reviewCreateSchema>;

// ---------------------------------------------------------------------------
// Promocode
// ---------------------------------------------------------------------------

export const promocodeCreateSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, "Code may contain letters, digits, hyphens, and underscores"),
  type: z.enum(["percent", "fixed"]),
  value: z.number().positive(),
  validFrom: dateTimeString,
  validUntil: dateTimeString,
  maxUses: z.number().int().positive().optional(),
  minBookingAmount: z.number().nonnegative().optional(),
  applicableVenueIds: z.array(z.string().uuid()).optional(),
  firstBookingOnly: z.boolean().optional(),
});

export type PromocodeCreateInput = z.infer<typeof promocodeCreateSchema>;

// ---------------------------------------------------------------------------
// Campaign (bulk messaging)
// ---------------------------------------------------------------------------

export const campaignCreateSchema = z.object({
  name: z.string().min(1).max(200),
  message: z.string().min(1).max(4096),
  scheduledAt: dateTimeString.optional(),
  targetSegment: z
    .object({
      loyaltyTier: z.string().optional(),
      lastVisitBefore: dateTimeString.optional(),
      lastVisitAfter: dateTimeString.optional(),
      minBookings: z.number().int().nonnegative().optional(),
      maxBookings: z.number().int().nonnegative().optional(),
    })
    .optional(),
});

export type CampaignCreateInput = z.infer<typeof campaignCreateSchema>;

// ---------------------------------------------------------------------------
// Auto-message (trigger-based)
// ---------------------------------------------------------------------------

export const autoMessageCreateSchema = z.object({
  trigger: z.enum([
    "booking_confirmed",
    "booking_reminder",
    "booking_cancelled",
    "review_request",
    "birthday",
    "milestone",
    "inactive_client",
  ]),
  template: z.string().min(1).max(4096),
  delayMinutes: z.number().int().nonnegative().default(0),
  enabled: z.boolean().default(true),
});

export type AutoMessageCreateInput = z.infer<typeof autoMessageCreateSchema>;

// ---------------------------------------------------------------------------
// Gift certificate
// ---------------------------------------------------------------------------

export const giftCertificateCreateSchema = z.object({
  amount: z.number().positive(),
  recipientName: z.string().min(1).max(200),
  recipientPhone: z
    .string()
    .regex(/^\+?\d{7,15}$/, "Invalid phone number")
    .optional(),
  message: z.string().max(500).optional(),
  validUntil: dateTimeString,
});

export type GiftCertificateCreateInput = z.infer<typeof giftCertificateCreateSchema>;

// ---------------------------------------------------------------------------
// Pagination (common query params)
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().max(200).optional(),
});

export type PaginationInput = z.infer<typeof paginationSchema>;
