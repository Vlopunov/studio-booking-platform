import "dotenv/config";
import { Bot, session } from "grammy";
import { RedisAdapter } from "@grammyjs/storage-redis";
import IORedis from "ioredis";
import { prisma } from "@studio/database";
import { parseDeepLink, generateReferralCode } from "@studio/utils";
import { registerMainMenu } from "./handlers/main-menu";
import { registerBooking } from "./handlers/booking";
import { registerGift } from "./handlers/gift";
import { registerShare } from "./handlers/share";
import { registerLoyalty } from "./handlers/loyalty";
import { registerCampaignCallbacks } from "./handlers/campaign-callbacks";
import { registerMyBookings } from "./handlers/my-bookings";
import { registerReview } from "./handlers/review";
import { registerWaitlist } from "./handlers/waitlist";
import { registerRegister, requestPhone } from "./handlers/register";
import type { StudioContext } from "./context";

const BOT_TOKEN = process.env.BOT_TOKEN;
if (!BOT_TOKEN) throw new Error("BOT_TOKEN is required");

const bot = new Bot<StudioContext>(BOT_TOKEN);

// FIX 5: Redis-backed session storage (survives restarts, scales across instances)
const redis = new IORedis(process.env.REDIS_URL || "redis://localhost:6379");

bot.use(
  session({
    initial: () => ({
      bookingStep: null as string | null,
      bookingData: {} as any,
    }),
    storage: new RedisAdapter({ instance: redis }),
  })
);

// Middleware: load/create client
bot.use(async (ctx, next) => {
  if (!ctx.from) return next();

  let client = await prisma.client.findUnique({
    where: { telegramId: BigInt(ctx.from.id) },
  });

  if (!client) {
    client = await prisma.client.create({
      data: {
        telegramId: BigInt(ctx.from.id),
        telegramUsername: ctx.from.username,
        firstName: ctx.from.first_name,
        lastName: ctx.from.last_name,
        referralCode: generateReferralCode(),
      },
    });

    // Track analytics
    await prisma.analyticsEvent.create({
      data: { type: "bot.start", clientId: client.id },
    });
  } else {
    await prisma.client.update({
      where: { id: client.id },
      data: {
        lastActivityAt: new Date(),
        telegramUsername: ctx.from.username,
        firstName: ctx.from.first_name,
      },
    });
  }

  ctx.client = client;
  return next();
});

// Analytics middleware
bot.use(async (ctx, next) => {
  if (ctx.callbackQuery?.data && ctx.client) {
    const action = ctx.callbackQuery.data.split(":")[0];
    const eventMap: Record<string, string> = {
      book_venue: "booking.venue_selected",
      book_date: "booking.date_selected",
      cal: "booking.date_selected",
      // book_confirm analytics handled by booking.service.ts
      waitlist: "waitlist.joined",
      referral: "referral.shared",
    };
    if (eventMap[action]) {
      await prisma.analyticsEvent.create({
        data: { type: eventMap[action], clientId: ctx.client.id },
      });
    }
  }
  return next();
});

// /start with deep links
bot.command("start", async (ctx) => {
  const startParam = ctx.match;

  if (startParam) {
    const link = parseDeepLink(startParam);

    switch (link.type) {
      case "referral": {
        const referrer = await prisma.client.findFirst({ where: { referralCode: link.referralCode } });
        if (referrer && referrer.id !== ctx.client.id && !ctx.client.referredById) {
          await prisma.client.update({ where: { id: ctx.client.id }, data: { referredById: referrer.id } });
        }
        break;
      }
      case "utm": {
        await prisma.utmSource.create({
          data: {
            clientId: ctx.client.id, source: link.utmSource || "unknown",
            medium: link.utmMedium, campaign: link.utmCampaign, content: link.utmContent,
          },
        });
        break;
      }
      case "gift": {
        const cert = await prisma.giftCertificate.findUnique({ where: { code: link.giftCode } });
        if (cert && cert.isActive && !cert.redeemedById && cert.expiresAt > new Date()) {
          await ctx.reply(
            `🎁 Вам подарили сертификат!\n\n` +
            (cert.recipientName ? `От: ${cert.recipientName}\n` : "") +
            (cert.message ? `Сообщение: "${cert.message}"\n\n` : "\n") +
            `${cert.type === "HOURS" ? `📸 ${cert.value} часа` : `💰 ${cert.value}₽`}\n` +
            `Действует до: ${cert.expiresAt.toLocaleDateString("ru-RU")}`,
            { reply_markup: { inline_keyboard: [[{ text: "📸 Забронировать!", callback_data: `redeem_gift:${cert.id}` }]] } }
          );
          return;
        }
        await ctx.reply("❌ Сертификат не найден или истёк.");
        return;
      }
      case "campaign": {
        const delivery = await prisma.campaignDelivery.findFirst({
          where: { campaignId: link.campaignId, clientId: ctx.client.id },
        });
        if (delivery) {
          await prisma.campaignDelivery.update({ where: { id: delivery.id }, data: { clickedAt: new Date(), status: "CLICKED" } });
          await prisma.campaign.update({ where: { id: link.campaignId }, data: { totalClicked: { increment: 1 } } });
        }
        break;
      }
    }
  }

  // Check if new user needs registration
  if (!ctx.client.phone) {
    await requestPhone(ctx);
    return;
  }

  await registerMainMenu(ctx);
});

// Register all handlers
registerRegister(bot);
registerBooking(bot);
registerMyBookings(bot);
registerGift(bot);
registerShare(bot);
registerLoyalty(bot);
registerReview(bot);
registerWaitlist(bot);
registerCampaignCallbacks(bot);

bot.catch((err) => {
  console.error("Bot error:", err);
});

bot.start({ onStart: () => console.log("🤖 Bot started") });
