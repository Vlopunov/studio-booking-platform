import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import type { StudioContext } from "../context";

const REVIEW_BONUS = 100; // bonus points for leaving a review

export function registerReview(bot: Bot<StudioContext>) {
  // Start review flow from my-bookings
  bot.callbackQuery(/^start_review:(.+)$/, async (ctx) => {
    const bookingId = ctx.match[1];

    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        clientId: ctx.client.id,
        status: "COMPLETED",
      },
      include: { venue: true, review: true },
    });

    if (!booking) {
      await ctx.answerCallbackQuery("Бронирование не найдено.");
      return;
    }

    if (booking.review) {
      await ctx.answerCallbackQuery("Вы уже оставили отзыв для этого бронирования.");
      return;
    }

    const keyboard = new InlineKeyboard();
    for (let i = 1; i <= 5; i++) {
      keyboard.text("⭐".repeat(i), `review:${bookingId}:${i}`);
    }
    keyboard.row();
    keyboard.text("◀️ Назад", "my_bookings");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `⭐ Оцените бронирование в «${booking.venue.name}»\n\n` +
        `📅 ${booking.date.toLocaleDateString("ru-RU")} · ${booking.startTime}–${booking.endTime}\n\n` +
        `Выберите оценку:`,
      { reply_markup: keyboard },
    );
  });

  // Handle rating selection
  bot.callbackQuery(/^review:(.+):(\d)$/, async (ctx) => {
    const bookingId = ctx.match[1];
    const rating = parseInt(ctx.match[2], 10);

    // Verify booking belongs to user and has no review
    const booking = await prisma.booking.findFirst({
      where: {
        id: bookingId,
        clientId: ctx.client.id,
        status: "COMPLETED",
      },
      include: { review: true },
    });

    if (!booking || booking.review) {
      await ctx.answerCallbackQuery("Отзыв уже оставлен или бронирование не найдено.");
      return;
    }

    // Store rating temporarily; ask for comment
    ctx.session.bookingStep = "review_comment";
    ctx.session.bookingData = {
      ...ctx.session.bookingData,
      venueId: booking.venueId,
      comment: undefined,
    };
    // Store bookingId and rating in a way accessible from text handler
    // We repurpose promocode/giftCertId fields temporarily
    (ctx.session.bookingData as any)._reviewBookingId = bookingId;
    (ctx.session.bookingData as any)._reviewRating = rating;

    const keyboard = new InlineKeyboard().text("Пропустить", `review_skip:${bookingId}:${rating}`);

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(
      `${"⭐".repeat(rating)} — Отлично!\n\n` +
        `Напишите комментарий к отзыву (необязательно).\n` +
        `Или нажмите «Пропустить».`,
      { reply_markup: keyboard },
    );
  });

  // Handle review comment (text message)
  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.bookingStep !== "review_comment") {
      return next();
    }

    const bookingId = (ctx.session.bookingData as any)?._reviewBookingId;
    const rating = (ctx.session.bookingData as any)?._reviewRating;

    if (!bookingId || !rating) {
      ctx.session.bookingStep = null;
      return next();
    }

    const comment = ctx.message.text.trim();
    await saveReview(ctx, bookingId, rating, comment);
  });

  // Skip comment
  bot.callbackQuery(/^review_skip:(.+):(\d)$/, async (ctx) => {
    const bookingId = ctx.match[1];
    const rating = parseInt(ctx.match[2], 10);

    await ctx.answerCallbackQuery();
    await saveReview(ctx, bookingId, rating, null);
  });
}

async function saveReview(
  ctx: StudioContext,
  bookingId: string,
  rating: number,
  comment: string | null,
) {
  // Prevent duplicate reviews
  const existing = await prisma.review.findUnique({
    where: { bookingId },
  });

  if (existing) {
    ctx.session.bookingStep = null;
    await ctx.reply("Вы уже оставили отзыв для этого бронирования.");
    return;
  }

  // Create review
  await prisma.review.create({
    data: {
      bookingId,
      clientId: ctx.client.id,
      rating,
      comment,
    },
  });

  // Award bonus
  await prisma.client.update({
    where: { id: ctx.client.id },
    data: { bonusBalance: { increment: REVIEW_BONUS } },
  });

  await prisma.bonusTransaction.create({
    data: {
      clientId: ctx.client.id,
      amount: REVIEW_BONUS,
      type: "REVIEW",
      description: `Отзыв за бронирование`,
      bookingId,
    },
  });

  ctx.session.bookingStep = null;

  const stars = "⭐".repeat(rating);
  await ctx.reply(
    `${stars}\n\n` +
      `Спасибо за отзыв! 🙏\n` +
      `Вам начислено ${REVIEW_BONUS} бонусов.`,
    {
      reply_markup: new InlineKeyboard().text("📋 Мои брони", "my_bookings"),
    },
  );
}
