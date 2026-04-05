import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import type { StudioContext } from "../context";

export function registerWaitlist(bot: Bot<StudioContext>) {
  // Join waitlist for a fully booked date
  bot.callbackQuery(/^waitlist:(.+):(.+)$/, async (ctx) => {
    const venueId = ctx.match[1];
    const dateStr = ctx.match[2];
    const desiredDate = new Date(dateStr);

    // Check if already on waitlist
    const existing = await prisma.waitlistEntry.findFirst({
      where: {
        clientId: ctx.client.id,
        venueId,
        desiredDate,
        isActive: true,
      },
    });

    if (existing) {
      await ctx.answerCallbackQuery("Вы уже в листе ожидания на эту дату.");
      return;
    }

    // Get venue name for the message
    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      select: { name: true },
    });

    // Save waitlist entry
    await prisma.waitlistEntry.create({
      data: {
        clientId: ctx.client.id,
        venueId,
        desiredDate,
      },
    });

    await ctx.answerCallbackQuery("Вы добавлены в лист ожидания! ✅");

    const keyboard = new InlineKeyboard()
      .text("📅 Выбрать другую дату", "booking_back:date")
      .row()
      .text("📋 Мои брони", "my_bookings");

    await ctx.editMessageText(
      `📋 Вы записаны в лист ожидания!\n\n` +
        `📸 ${venue?.name || "Площадка"}\n` +
        `📅 ${desiredDate.toLocaleDateString("ru-RU")}\n\n` +
        `Мы уведомим вас, если появится свободное время.`,
      { reply_markup: keyboard },
    );
  });
}
