import type { MessageTemplateVars } from "@studio/types";

// ═══════════════════════════════════════
// Template engine для сообщений
// ═══════════════════════════════════════

export function renderTemplate(
  template: string,
  vars: Partial<MessageTemplateVars>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const value = vars[key as keyof MessageTemplateVars];
    return value !== undefined ? String(value) : match;
  });
}

// ═══════════════════════════════════════
// UTM парсинг из deep link
// ═══════════════════════════════════════

export interface ParsedDeepLink {
  type: "referral" | "utm" | "gift" | "campaign" | "unknown";
  referralCode?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  giftCode?: string;
  campaignId?: string;
}

export function parseDeepLink(startParam: string): ParsedDeepLink {
  if (startParam.startsWith("ref_")) {
    return { type: "referral", referralCode: startParam.slice(4) };
  }
  if (startParam.startsWith("utm_")) {
    const parts = startParam.slice(4).split("_");
    return {
      type: "utm",
      utmSource: parts[0],
      utmMedium: parts[1],
      utmCampaign: parts[2],
      utmContent: parts[3],
    };
  }
  if (startParam.startsWith("gift_")) {
    return { type: "gift", giftCode: `GIFT-${startParam.slice(5)}` };
  }
  if (startParam.startsWith("camp_")) {
    return { type: "campaign", campaignId: startParam.slice(5) };
  }
  return { type: "unknown" };
}

// ═══════════════════════════════════════
// Генерация кодов
// ═══════════════════════════════════════

export function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export function generateGiftCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = () => {
    let s = "";
    for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };
  return `GIFT-${part()}-${part()}`;
}

// ═══════════════════════════════════════
// Тихие часы
// ═══════════════════════════════════════

export function isQuietHours(
  now: Date = new Date(),
  quietStart = "21:00",
  quietEnd = "10:00"
): boolean {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  const current = hours * 60 + minutes;

  const [startH, startM] = quietStart.split(":").map(Number);
  const [endH, endM] = quietEnd.split(":").map(Number);
  const start = startH * 60 + startM;
  const end = endH * 60 + endM;

  if (start > end) {
    // overnight: e.g., 21:00 - 10:00
    return current >= start || current < end;
  }
  return current >= start && current < end;
}

// ═══════════════════════════════════════
// Cooldown check
// ═══════════════════════════════════════

export function canSendMarketing(
  lastMarketingAt: Date | null,
  cooldownDays: number
): boolean {
  if (!lastMarketingAt) return true;
  const diff = Date.now() - lastMarketingAt.getTime();
  const diffDays = diff / (1000 * 60 * 60 * 24);
  return diffDays >= cooldownDays;
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

export function countBy<T>(arr: T[], key?: keyof T): Record<string, number> {
  const result: Record<string, number> = {};
  for (const item of arr) {
    const val = key ? String(item[key]) : String(item);
    result[val] = (result[val] || 0) + 1;
  }
  return result;
}

export function maxByValue(obj: Record<string, number>): string {
  let maxKey = "";
  let maxVal = -Infinity;
  for (const [key, val] of Object.entries(obj)) {
    if (val > maxVal) {
      maxVal = val;
      maxKey = key;
    }
  }
  return maxKey;
}

export function getDaysSince(date: Date | null): number {
  if (!date) return Infinity;
  return Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
}

export function formatPrice(amount: number): string {
  return new Intl.NumberFormat("ru-RU").format(amount) + "₽";
}

export function formatDate(date: Date): string {
  const days = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
  const months = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
  ];
  return `${date.getDate()} ${months[date.getMonth()]} (${days[date.getDay()]})`;
}

// Milestone бронирований
export const MILESTONES = [5, 10, 20, 50, 100];

export function checkMilestone(totalBookings: number): number | null {
  return MILESTONES.includes(totalBookings) ? totalBookings : null;
}
