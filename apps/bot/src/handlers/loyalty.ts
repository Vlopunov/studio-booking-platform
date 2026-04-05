import { Bot } from "grammy";
import { prisma } from "@studio/database";
import { formatPrice } from "@studio/utils";
import type { StudioContext } from "../context";

export function registerLoyalty(bot: Bot<StudioContext>) {
  bot.hears("⭐ Моя лояльность", async (ctx) => {
    const client = ctx.client;

    const transactions = await prisma.bonusTransaction.findMany({
      where: { clientId: client.id },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    const completedBookings = await prisma.booking.count({
      where: { clientId: client.id, status: "COMPLETED" },
    });

    const totalHours = await prisma.booking.aggregate({
      where: { clientId: client.id, status: "COMPLETED" },
      _sum: { hours: true },
    });

    const savedAmount = await prisma.booking.aggregate({
      where: { clientId: client.id, status: "COMPLETED" },
      _sum: { discount: true },
    });

    const tierInfo = getTierInfo(client.loyaltyTier);
    const nextTier = getNextTierInfo(client.loyaltyTier, client.totalBookings);

    let text =
      `⭐ Ваша лояльность\n\n` +
      `Уровень: ${tierInfo.name}\n` +
      `💰 Бонусов: ${client.bonusBalance}\n` +
      `📸 Визитов: ${completedBookings}\n` +
      `⏱ Часов в студии: ${totalHours._sum.hours || 0}\n` +
      `💸 Сэкономлено: ${formatPrice(Number(savedAmount._sum.discount || 0))}\n`;

    if (nextTier) {
      text +=
        `\n📈 До уровня "${nextTier.name}": ещё ${nextTier.bookingsNeeded} бронирований\n` +
        `   Бонус: кешбэк ${nextTier.cashback}%`;
    }

    if (transactions.length > 0) {
      text += `\n\n📊 Последние операции:\n`;
      for (const t of transactions) {
        const sign = t.amount > 0 ? "+" : "";
        text += `${sign}${t.amount} — ${t.description}\n`;
      }
    }

    await ctx.reply(text);
  });

  // Callback from loyalty button in auto-messages
  bot.callbackQuery("loyalty", async (ctx) => {
    // Trigger the same handler
    const client = ctx.client;
    const completedBookings = await prisma.booking.count({
      where: { clientId: client.id, status: "COMPLETED" },
    });

    await ctx.answerCallbackQuery();
    await ctx.reply(
      `⭐ ${getTierInfo(client.loyaltyTier).name}\n` +
        `💰 ${client.bonusBalance} бонусов\n` +
        `📸 ${completedBookings} визитов`
    );
  });
}

function getTierInfo(tier: string) {
  const map: Record<string, { name: string; cashback: number }> = {
    STANDARD: { name: "Стандарт", cashback: 3 },
    SILVER: { name: "🥈 Серебро", cashback: 5 },
    GOLD: { name: "🥇 Золото", cashback: 7 },
    PLATINUM: { name: "💎 Платина", cashback: 10 },
  };
  return map[tier] || map.STANDARD;
}

function getNextTierInfo(
  currentTier: string,
  currentBookings: number
): { name: string; bookingsNeeded: number; cashback: number } | null {
  const tiers = [
    { tier: "STANDARD", threshold: 0, name: "Стандарт", cashback: 3 },
    { tier: "SILVER", threshold: 5, name: "🥈 Серебро", cashback: 5 },
    { tier: "GOLD", threshold: 15, name: "🥇 Золото", cashback: 7 },
    { tier: "PLATINUM", threshold: 30, name: "💎 Платина", cashback: 10 },
  ];

  const currentIdx = tiers.findIndex((t) => t.tier === currentTier);
  if (currentIdx === -1 || currentIdx >= tiers.length - 1) return null;

  const next = tiers[currentIdx + 1];
  return {
    name: next.name,
    bookingsNeeded: next.threshold - currentBookings,
    cashback: next.cashback,
  };
}
