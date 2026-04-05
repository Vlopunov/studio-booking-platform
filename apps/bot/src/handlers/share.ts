import { Bot } from "grammy";
import { prisma } from "@studio/database";
import type { StudioContext } from "../context";

export function registerShare(bot: Bot<StudioContext>) {
  bot.hears("👥 Пригласить друга", async (ctx) => {
    const client = ctx.client;
    const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${client.referralCode}`;

    const referralCount = await prisma.client.count({
      where: { referredById: client.id },
    });

    await ctx.reply(
      `👥 Пригласить друга\n\n` +
        `За каждого друга, который забронирует —\n` +
        `вы оба получите по 500 бонусов!\n\n` +
        `🔗 Ваша ссылка:\n${referralLink}\n\n` +
        `📊 Приглашено друзей: ${referralCount}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📤 Отправить другу",
                switch_inline_query:
                  `Привет! Попробуй этот сервис для бронирования фотостудий: ${referralLink}`,
              },
            ],
            [
              {
                text: "📋 Скопировать ссылку",
                callback_data: "copy_referral",
              },
            ],
          ],
        },
      }
    );
  });

  bot.callbackQuery("copy_referral", async (ctx) => {
    const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${ctx.client.referralCode}`;
    await ctx.reply(`🔗 ${referralLink}`);
    await ctx.answerCallbackQuery("Ссылка отправлена");
  });

  // After positive review — suggest sharing
  bot.callbackQuery(/^share_after_review:(.+)$/, async (ctx) => {
    const bookingId = ctx.match[1];
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      include: { venue: true },
    });

    if (!booking) return;

    const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${ctx.client.referralCode}`;

    await ctx.editMessageText(
      `📸 Рады, что вам понравилось!\n\n` +
        `Поделитесь впечатлениями с друзьями:\n\n` +
        `🎁 За каждого друга, который забронирует —\n` +
        `вы оба получите по 500 бонусов!\n\n` +
        `Ваша ссылка: ${referralLink}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "📤 Отправить другу в Telegram",
                switch_inline_query:
                  `Рекомендую ${booking.venue.name}! Отличное место для фото 📸 ${referralLink}`,
              },
            ],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });
}
