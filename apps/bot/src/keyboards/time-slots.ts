import { InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";

const BUFFER_MINUTES = 30;

/**
 * Generate a keyboard showing available continuous time windows for a given date.
 * Accounts for schedule, existing bookings, blocked slots, and a 30-minute buffer.
 */
export async function generateTimeSlotsKeyboard(
  venueId: string,
  date: string,
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();
  const dateObj = new Date(date);

  // Get schedule for this day of week (0=Mon...6=Sun)
  const dow = (dateObj.getDay() + 6) % 7;
  const schedule = await prisma.schedule.findFirst({
    where: { venueId, dayOfWeek: dow, isActive: true },
  });

  if (!schedule) {
    keyboard.text("Нет расписания на этот день", "cal_noop");
    return keyboard;
  }

  const openMinutes = toMinutes(schedule.openTime);
  const closeMinutes = toMinutes(schedule.closeTime);

  // Fetch bookings for the date
  const nextDay = new Date(dateObj);
  nextDay.setDate(nextDay.getDate() + 1);

  const bookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: dateObj,
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });

  // Fetch blocked slots overlapping the date
  const blockedSlots = await prisma.blockedSlot.findMany({
    where: {
      venueId,
      dateFrom: { lte: nextDay },
      dateTo: { gte: dateObj },
    },
  });

  // Build occupied intervals in minutes (including buffer)
  const occupied: Array<{ start: number; end: number }> = [];

  for (const b of bookings) {
    const start = toMinutes(b.startTime) - BUFFER_MINUTES;
    const end = toMinutes(b.endTime) + BUFFER_MINUTES;
    occupied.push({ start: Math.max(start, openMinutes), end: Math.min(end, closeMinutes) });
  }

  for (const bs of blockedSlots) {
    // Blocked slots span full days; treat as occupying the whole day
    occupied.push({ start: openMinutes, end: closeMinutes });
  }

  // Sort and merge occupied intervals
  occupied.sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];
  for (const interval of occupied) {
    if (merged.length > 0 && interval.start <= merged[merged.length - 1].end) {
      merged[merged.length - 1].end = Math.max(merged[merged.length - 1].end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }

  // Find free windows (minimum 1 hour)
  const freeWindows: Array<{ start: number; end: number }> = [];
  let cursor = openMinutes;

  for (const occ of merged) {
    if (occ.start > cursor) {
      const windowLength = occ.start - cursor;
      if (windowLength >= 60) {
        freeWindows.push({ start: cursor, end: occ.start });
      }
    }
    cursor = Math.max(cursor, occ.end);
  }

  // Remaining time after last occupied block
  if (cursor < closeMinutes) {
    const windowLength = closeMinutes - cursor;
    if (windowLength >= 60) {
      freeWindows.push({ start: cursor, end: closeMinutes });
    }
  }

  if (freeWindows.length === 0) {
    keyboard.text("Нет свободных окон", "cal_noop").row();
    keyboard.text("📋 Встать в лист ожидания", `waitlist:${venueId}:${date}`);
    keyboard.row();
    keyboard.text("◀️ Назад", "booking_back:date");
    return keyboard;
  }

  // If today, filter out windows that have already started
  const now = new Date();
  const isToday =
    dateObj.getFullYear() === now.getFullYear() &&
    dateObj.getMonth() === now.getMonth() &&
    dateObj.getDate() === now.getDate();

  const currentMinutes = isToday ? now.getHours() * 60 + now.getMinutes() : 0;

  for (const w of freeWindows) {
    const effectiveStart = Math.max(w.start, currentMinutes);
    if (w.end - effectiveStart < 60) continue;

    const label = `${formatMinutes(effectiveStart)}–${formatMinutes(w.end)} 🟢`;
    keyboard.text(label, `time:${formatMinutes(effectiveStart)}`).row();
  }

  keyboard.text("◀️ Назад", "booking_back:date");

  return keyboard;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
