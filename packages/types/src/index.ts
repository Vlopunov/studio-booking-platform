// ═══════════════════════════════════════
// Targeting Filter для кампаний
// ═══════════════════════════════════════

export interface CampaignTargeting {
  tiers?: string[];
  tags?: string[];
  excludeTags?: string[];
  lastBookingDaysAgo?: { min?: number; max?: number };
  totalBookings?: { min?: number; max?: number };
  registeredDaysAgo?: { min?: number };
  venues?: string[];
}

// ═══════════════════════════════════════
// API Request / Response типы
// ═══════════════════════════════════════

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface CampaignCreateInput {
  name: string;
  type: "BROADCAST" | "AUTOMATED" | "SCHEDULED";
  messageText: string;
  messagePhoto?: string;
  buttonText?: string;
  buttonAction?: string;
  targeting?: CampaignTargeting;
  promocodeId?: string;
  scheduledAt?: string;
}

export interface CampaignUpdateInput extends Partial<CampaignCreateInput> {
  status?: "DRAFT" | "SCHEDULED" | "CANCELLED";
}

export interface CampaignStats {
  totalTargeted: number;
  totalSent: number;
  totalRead: number;
  totalClicked: number;
  totalConverted: number;
  revenue: number;
  deliveryRate: number;
  clickRate: number;
  conversionRate: number;
}

export interface AutoMessageCreateInput {
  name: string;
  trigger: string;
  delayMinutes: number;
  messageText: string;
  messagePhoto?: string;
  buttonText?: string;
  buttonAction?: string;
  maxSendsPerClient?: number;
  cooldownDays?: number;
  tierRestriction?: string;
  isActive?: boolean;
}

export interface GiftCertificateCreateInput {
  type: "AMOUNT" | "HOURS";
  value: number;
  venueId?: string;
  recipientName?: string;
  message?: string;
  expiresInDays?: number;
}

// ═══════════════════════════════════════
// Аналитика
// ═══════════════════════════════════════

export interface SourceStats {
  source: string;
  medium: string | null;
  clients: number;
  bookings: number;
  conversionRate: number;
  avgCheck: number;
  ltv: number;
}

export interface RfmStats {
  segment: string;
  count: number;
  percentage: number;
  avgRecency: number;
  avgFrequency: number;
  avgMonetary: number;
}

export interface CohortRetention {
  cohort: string;
  months: (number | null)[];
}

export interface Recommendation {
  type: "FAVORITE_SLOT" | "EXPIRING_BONUS" | "COMEBACK" | "CROSS_SELL";
  venueId?: string;
  venueName?: string;
  date?: string;
  time?: string;
  amount?: number;
  days?: number;
}

// ═══════════════════════════════════════
// Template переменные для сообщений
// ═══════════════════════════════════════

export interface MessageTemplateVars {
  firstName: string;
  lastName?: string;
  loyaltyTier: string;
  bonusBalance: number;
  totalBookings: number;
  referralCode: string;
  venueName?: string;
  winBackBonus?: number;
  milestoneNumber?: number;
  milestoneBonus?: number;
}
