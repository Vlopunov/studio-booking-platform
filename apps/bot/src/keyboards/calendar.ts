import { InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";

const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

const DAY_HEADERS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

/**
 * Generate an inline calendar keyboard for a venue.
 * 🟢 = 4+ hours free, 🟡 = 1-3 hours free, 🔴 = fully booked, — = day off/blocked
 */
export async function generateCalendarKeyboard(
  venueId: string,
  year: number,
  month: number,
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const maxDate = new Date();
  maxDate.setMonth(maxDate.getMonth() + 3);
  maxDate.setHours(23, 59, 59, 999);

  // Month/year header
  keyboard.text(`${MONTH_NAMES_RU[month]} ${year}`, "cal_noop").row();

  // Day-of-week headers
  for (const day of DAY_HEADERS) {
    keyboard.text(day, "cal_noop");
  }
  keyboard.row();

  // Get venue schedule for each day of week
  const schedules = await prisma.schedule.findMany({
    where: { venueId, isActive: true },
  });
  const scheduleByDay = new Map<number, { openTime: string; closeTime: string }>();
  for (const s of schedules) {
    scheduleByDay.set(s.dayOfWeek, { openTime: s.openTime, closeTime: s.closeTime });
  }

  // Date range for the month
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);

  // Fetch all bookings for the month
  const bookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: { gte: firstDay, lte: lastDay },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { date: true, startTime: true, endTime: true, durationHours: true },
  });

  // Fetch blocked slots for the month
  const blockedSlots = await prisma.blockedSlot.findMany({
    where: {
      venueId,
      dateFrom: { lte: lastDay },
      dateTo: { gte: firstDay },
    },
  });

  // Build a map: day number -> total booked hours
  const bookedHoursByDay = new Map<number, number>();
  for (const b of bookings) {
    const d = new Date(b.date).getDate();
    bookedHoursByDay.set(d, (bookedHoursByDay.get(d) || 0) + b.durationHours);
  }

  // Build a set of fully blocked days
  const blockedDays = new Set<number>();
  for (const bs of blockedSlots) {
    const from = new Date(bs.dateFrom);
    const to = new Date(bs.dateTo);
    for (
      let d = new Date(Math.max(from.getTime(), firstDay.getTime()));
      d <= to && d <= lastDay;
      d.setDate(d.getDate() + 1)
    ) {
      blockedDays.add(d.getDate());
    }
  }

  // dayOfWeek offset: Monday=0 in our grid; JS: 0=Sun,1=Mon...6=Sat
  const firstDayOfWeek = (firstDay.getDay() + 6) % 7; // convert to Mon=0

  // Empty cells before the 1st
  for (let i = 0; i < firstDayOfWeek; i++) {
    keyboard.text(" ", "cal_noop");
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const cellDate = new Date(year, month, day);
    const dateStr = formatDateStr(year, month, day);
    // dayOfWeek for schedule: 0=Mon...6=Sun
    const dow = (cellDate.getDay() + 6) % 7;

    if (cellDate < today) {
      // Past date
      keyboard.text(" ", "cal_noop");
    } else if (cellDate > maxDate) {
      keyboard.text(" ", "cal_noop");
    } else if (blockedDays.has(day)) {
      keyboard.text("—", "cal_noop");
    } else if (!scheduleByDay.has(dow)) {
      // Day off
      keyboard.text("—", "cal_noop");
    } else {
      const sched = scheduleByDay.get(dow)!;
      const totalHours = parseTime(sched.closeTime) - parseTime(sched.openTime);
      const booked = bookedHoursByDay.get(day) || 0;
      const freeHours = totalHours - booked;

      let emoji: string;
      if (freeHours >= 4) {
        emoji = "🟢";
      } else if (freeHours >= 1) {
        emoji = "🟡";
      } else {
        emoji = "🔴";
      }

      keyboard.text(`${day} ${emoji}`, `cal:${dateStr}`);
    }

    // Row break after Sunday
    if ((firstDayOfWeek + day) % 7 === 0) {
      keyboard.row();
    }
  }

  // Fill remaining cells in the last week
  const remainingCells = (7 - ((firstDayOfWeek + lastDay.getDate()) % 7)) % 7;
  for (let i = 0; i < remainingCells; i++) {
    keyboard.text(" ", "cal_noop");
  }
  keyboard.row();

  // Navigation arrows
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;

  const prevDate = new Date(prevYear, prevMonth, 1);
  const nextDate = new Date(nextYear, nextMonth, 1);
  const currentMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const canGoPrev = prevDate >= currentMonth;
  const canGoNext = nextDate <= maxDate;

  if (canGoPrev) {
    keyboard.text("◀️", `cal_nav:${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`);
  } else {
    keyboard.text(" ", "cal_noop");
  }

  keyboard.text(" ", "cal_noop");

  if (canGoNext) {
    keyboard.text("▶️", `cal_nav:${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`);
  } else {
    keyboard.text(" ", "cal_noop");
  }

  keyboard.row();
  keyboard.text("◀️ Назад", "booking_back:venue");

  return keyboard;
}

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h + m / 60;
}

function formatDateStr(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
