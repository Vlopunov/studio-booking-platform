import type { StudioContext } from "../context";
import { getPersonalRecommendation } from "../services/recommendation";
import { formatPrice } from "@studio/utils";

export async function registerMainMenu(ctx: StudioContext) {
  const client = ctx.client;
  const recommendation = await getPersonalRecommendation(client.id);

  let greeting = `Привет, ${client.firstName}! 👋\n\n`;

  if (recommendation) {
    switch (recommendation.type) {
      case "FAVORITE_SLOT":
        greeting +=
          `💡 Рекомендуем:\n` +
          `Ваше любимое время в "${recommendation.venueName}" свободно на эту неделю!\n\n`;
        break;
      case "EXPIRING_BONUS":
        greeting +=
          `⚠️ У вас ${recommendation.amount} бонусов, которые скоро сгорят!\n` +
          `Используйте их при следующем бронировании.\n\n`;
        break;
      case "COMEBACK":
        greeting +=
          `Давно не виделись! Мы соскучились 🤗\n` +
          `Специально для вас — бонусы на следующее бронирование!\n\n`;
        break;
      case "CROSS_SELL":
        greeting +=
          `💡 Попробуйте "${recommendation.venueName}"!\n` +
          `Скидка 15% на первое посещение новой площадки.\n\n`;
        break;
    }
  }

  greeting += `💰 Баланс: ${client.bonusBalance} бонусов\n`;
  greeting += `⭐ Уровень: ${formatTier(client.loyaltyTier)}`;

  const keyboard: any[][] = [
    [{ text: "📸 Заброниров��ть" }, { text: "📋 Мои брони" }],
    [{ text: "🎁 Подарочные сертификаты" }, { text: "⭐ Моя лояльность" }],
    [{ text: "👥 Пригласить друга" }, { text: "⚙️ Настройки" }],
  ];

  if (
    recommendation?.type === "FAVORITE_SLOT" &&
    recommendation.venueName
  ) {
    keyboard.unshift([
      {
        text: `📸 З��бронировать "${recommendation.venueName}"`,
      },
    ]);
  }

  await ctx.reply(greeting, {
    reply_markup: {
      keyboard,
      resize_keyboard: true,
    },
  });
}

function formatTier(tier: string): string {
  const map: Record<string, string> = {
    STANDARD: "Стандарт",
    SILVER: "🥈 Серебро",
    GOLD: "🥇 Золото",
    PLATINUM: "💎 Платина",
  };
  return map[tier] || tier;
}
