import { Bot } from "grammy";
import { prisma } from "@studio/database";
import type { StudioContext } from "../context";

export function registerCampaignCallbacks(bot: Bot<StudioContext>) {
  // Handle campaign CTA button clicks: camp:{campaignId}:{action}
  bot.callbackQuery(/^camp:(.+):(.+)$/, async (ctx) => {
    const campaignId = ctx.match[1];
    const action = ctx.match[2];

    // Record click
    const delivery = await prisma.campaignDelivery.findFirst({
      where: { campaignId, clientId: ctx.client.id },
    });

    if (delivery && !delivery.clickedAt) {
      await prisma.campaignDelivery.update({
        where: { id: delivery.id },
        data: { clickedAt: new Date(), status: "CLICKED" },
      });

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { totalClicked: { increment: 1 } },
      });
    }

    // Route action
    switch (action) {
      case "book":
        await ctx.answerCallbackQuery();
        await ctx.reply("📸 Выберите площадку:", {
          reply_markup: {
            keyboard: [[{ text: "📸 Забронировать" }]],
            resize_keyboard: true,
          },
        });
        break;

      case "referral":
        await ctx.answerCallbackQuery();
        const referralLink = `https://t.me/${process.env.BOT_USERNAME}?start=ref_${ctx.client.referralCode}`;
        await ctx.reply(
          `👥 Ваша реферальная ссылка:\n${referralLink}\n\n` +
            `За каждого друга — 500 бонусов вам и другу!`
        );
        break;

      case "loyalty":
        await ctx.answerCallbackQuery();
        await ctx.reply(
          `⭐ Ваш уровень: ${ctx.client.loyaltyTier}\n` +
            `💰 Бонусов: ${ctx.client.bonusBalance}`
        );
        break;

      default:
        if (action.startsWith("promo:")) {
          const promoCode = action.slice(6);
          await ctx.answerCallbackQuery(`Промокод: ${promoCode}`);
          await ctx.reply(
            `🏷 Ваш промокод: ${promoCode}\n\n` +
              `Используйте его при бронировании!`
          );
        } else if (action.startsWith("url:")) {
          await ctx.answerCallbackQuery("Перейдите по ссылке");
        } else {
          await ctx.answerCallbackQuery();
        }
    }
  });

  // Settings — marketing opt-out
  bot.hears("⚙️ Настройки", async (ctx) => {
    const optedOut = ctx.client.marketingOptOut;

    await ctx.reply("⚙️ Настройки", {
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: optedOut
                ? "📢 Включить рассылки"
                : "🔇 Отключить рассылки",
              callback_data: `toggle_marketing:${optedOut ? "on" : "off"}`,
            },
          ],
        ],
      },
    });
  });

  bot.callbackQuery(/^toggle_marketing:(on|off)$/, async (ctx) => {
    const enable = ctx.match[1] === "on";

    await prisma.client.update({
      where: { id: ctx.client.id },
      data: {
        marketingOptOut: !enable,
        tags: enable
          ? { set: ctx.client.tags.filter((t: string) => t !== "no-marketing") }
          : { push: "no-marketing" },
      },
    });

    await ctx.editMessageText(
      enable
        ? "📢 Маркетинговые рассылки включены."
        : "🔇 Вы отключили рассылки. Вы не будете получать маркетинговые сообщения."
    );
    await ctx.answerCallbackQuery(enable ? "Рассылки включены" : "Рассылки отключены");
  });

  // Main menu callback
  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply("Выберите действие:", {
      reply_markup: {
        keyboard: [
          [{ text: "📸 Забронировать" }, { text: "📋 Мои брони" }],
          [{ text: "🎁 Под��рочные сертификаты" }, { text: "⭐ Моя лояльность" }],
          [{ text: "👥 Пригласить друга" }, { text: "⚙️ Настройки" }],
        ],
        resize_keyboard: true,
      },
    });
  });
}
