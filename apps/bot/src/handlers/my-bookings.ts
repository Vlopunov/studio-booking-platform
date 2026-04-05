import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import { formatPrice, formatDate } from "@studio/utils";
import type { StudioContext } from "../context";

const PAGE_SIZE = 5;

export function registerMyBookings(bot: Bot<StudioContext>) {
  // Entry from main menu
  bot.hears("📋 Мои брони", async (ctx) => {
    await showBookings(ctx, 0);
  });

  // Entry from inline callback
  bot.callbackQuery("my_bookings", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showBookings(ctx, 0);
  });

  // Pagination
  bot.callbackQuery(/^bookings_page:(\d+)$/, async (ctx) => {
    const page = parseInt(ctx.match[1], 10);
    await ctx.answerCallbackQuery();
    await showBookingsEdit(ctx, page);
  });

  // Cancel a pending booking
  bot.callbackQuery(/^cancel_booking:(.+)$/, async (ctx) => {
    const bookingId = ctx.match[1];

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, clientId: ctx.client.id, status: "PENDING" },
    });

    if (!booking) {
      await ctx.answerCallbackQuery("Бронирование не найдено или уже нельзя отменить.");
      return;
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "CLIENT",
        cancelReason: "Отменено клиентом",
      },
    });

    // Check waitlist and notify
    const waitlistEntries = await prisma.waitlistEntry.findMany({
      where: {
        venueId: booking.venueId,
        desiredDate: booking.date,
        isActive: true,
        isNotified: false,
      },
      include: { client: true },
    });

    // We just mark them as notified; actual notification is handled by the bot's job system
    if (waitlistEntries.length > 0) {
      await prisma.waitlistEntry.updateMany({
        where: { id: { in: waitlistEntries.map((e) => e.id) } },
        data: { isNotified: true, notifiedAt: new Date() },
      });
    }

    await ctx.answerCallbackQuery("Бронирование отменено.");
    await showBookingsEdit(ctx, 0);
  });

  // Repeat a completed booking
  bot.callbackQuery(/^repeat_booking:(.+)$/, async (ctx) => {
    const bookingId = ctx.match[1];

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, clientId: ctx.client.id, status: "COMPLETED" },
      include: { venue: true },
    });

    if (!booking) {
      await ctx.answerCallbackQuery("Бронирование не найдено.");
      return;
    }

    // Pre-fill booking session with data from the old booking
    ctx.session.bookingStep = "date";
    ctx.session.bookingData = {
      venueId: booking.venueId,
    };

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `🔄 Повтор бронирования в «${booking.venue.name}»\n` +
        `Выберите новую дату:`,
    );

    // Trigger calendar for the venue — the booking handler's cal_nav will catch it
    const now = new Date();
    const { generateCalendarKeyboard } = await import("../keyboards/calendar");
    const calendarKb = await generateCalendarKeyboard(
      booking.venueId,
      now.getFullYear(),
      now.getMonth(),
    );

    await ctx.reply("📅 Выберите дату:", { reply_markup: calendarKb });
  });
}

async function showBookings(ctx: StudioContext, page: number) {
  const text = await buildBookingsText(ctx.client.id, page);
  const keyboard = await buildBookingsKeyboard(ctx.client.id, page);
  await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
}

async function showBookingsEdit(ctx: StudioContext, page: number) {
  const text = await buildBookingsText(ctx.client.id, page);
  const keyboard = await buildBookingsKeyboard(ctx.client.id, page);

  try {
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
  } catch {
    // If editing fails (e.g., message is too old), send a new one
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}

async function buildBookingsText(clientId: string, page: number): Promise<string> {
  const bookings = await prisma.booking.findMany({
    where: { clientId },
    include: { venue: true, review: true },
    orderBy: [
      { status: "asc" }, // PENDING first
      { date: "desc" },
    ],
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const total = await prisma.booking.count({ where: { clientId } });

  if (bookings.length === 0) {
    return "📋 У вас пока нет бронирований.";
  }

  const statusLabels: Record<string, string> = {
    PENDING: "⏳ Ожидает",
    CONFIRMED: "✅ Подтверждено",
    COMPLETED: "✔️ Завершено",
    CANCELLED: "❌ Отменено",
    NO_SHOW: "🚫 Неявка",
  };

  let text = `📋 <b>Мои бронирования</b> (${page * PAGE_SIZE + 1}–${Math.min((page + 1) * PAGE_SIZE, total)} из ${total})\n\n`;

  for (const b of bookings) {
    const dateStr = formatDate(new Date(b.date));
    text +=
      `${statusLabels[b.status] || b.status} <b>${b.venue.name}</b>\n` +
      `   📅 ${dateStr} · ${b.startTime}–${b.endTime} (${b.durationHours}ч)\n` +
      `   💰 ${formatPrice(Number(b.finalPrice))}\n` +
      `   #${b.humanId}\n\n`;
  }

  return text;
}

async function buildBookingsKeyboard(
  clientId: string,
  page: number,
): Promise<InlineKeyboard> {
  const keyboard = new InlineKeyboard();

  const bookings = await prisma.booking.findMany({
    where: { clientId },
    include: { review: true },
    orderBy: [{ status: "asc" }, { date: "desc" }],
    skip: page * PAGE_SIZE,
    take: PAGE_SIZE,
  });

  const total = await prisma.booking.count({ where: { clientId } });

  for (const b of bookings) {
    if (b.status === "PENDING") {
      keyboard.text(`❌ Отменить #${b.humanId}`, `cancel_booking:${b.id}`).row();
    }

    if (b.status === "COMPLETED") {
      if (!b.review) {
        keyboard
          .text(`🔄 Повторить #${b.humanId}`, `repeat_booking:${b.id}`)
          .text(`⭐ Отзыв`, `start_review:${b.id}`)
          .row();
      } else {
        keyboard.text(`🔄 Повторить #${b.humanId}`, `repeat_booking:${b.id}`).row();
      }
    }
  }

  // Pagination
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages > 1) {
    if (page > 0) {
      keyboard.text("◀️", `bookings_page:${page - 1}`);
    }
    keyboard.text(`${page + 1}/${totalPages}`, "cal_noop");
    if (page < totalPages - 1) {
      keyboard.text("▶️", `bookings_page:${page + 1}`);
    }
    keyboard.row();
  }

  return keyboard;
}
