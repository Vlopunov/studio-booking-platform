import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { prisma } from "@studio/database";
import { isQuietHours, canSendMarketing, renderTemplate } from "@studio/utils";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const connection = new IORedis(REDIS_URL, { maxRetriesPerRequest: null });

// ═══════════════════════════════════════
// Queues
// ═══════════════════════════════════════

const campaignQueue = new Queue("campaign-sender", { connection });
const autoMessageQueue = new Queue("auto-messages", { connection });
const rfmQueue = new Queue("rfm-recalculate", { connection });
const abandonedQueue = new Queue("abandoned-booking", { connection });
const reminderQueue = new Queue("reminders", { connection });
const followUpQueue = new Queue("follow-up", { connection });
const birthdayQueue = new Queue("birthday", { connection });
const winBackQueue = new Queue("win-back", { connection });
const bonusExpiryQueue = new Queue("bonus-expiry", { connection });
const waitlistQueue = new Queue("waitlist", { connection });

export function getCampaignSender() {
  return campaignQueue;
}

export function getAutoMessageQueue() {
  return autoMessageQueue;
}

export function getReminderQueue() {
  return reminderQueue;
}

// ═══════════════════════════════════════
// Telegram helper
// ═══════════════════════════════════════

async function sendTelegramMessage(
  telegramId: bigint | string,
  text: string,
  photo?: string | null,
  buttonText?: string | null,
  callbackData?: string | null
): Promise<void> {
  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) throw new Error("BOT_TOKEN not set");

  const chatId = telegramId.toString();
  const inlineKeyboard =
    buttonText && callbackData
      ? {
          reply_markup: {
            inline_keyboard: [[{ text: buttonText, callback_data: callbackData }]],
          },
        }
      : {};

  const endpoint = photo ? "sendPhoto" : "sendMessage";
  const body = photo
    ? { chat_id: chatId, photo, caption: text, parse_mode: "HTML", ...inlineKeyboard }
    : { chat_id: chatId, text, parse_mode: "HTML", ...inlineKeyboard };

  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════
// Init all workers
// ═══════════════════════════════════════

export function initJobs() {
  // ── Campaign sender ──
  new Worker(
    "campaign-sender",
    async (job) => {
      const { campaignId } = job.data;
      const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
      if (!campaign || campaign.status !== "SENDING") return;

      const deliveries = await prisma.campaignDelivery.findMany({
        where: { campaignId, status: "PENDING" },
        include: {
          client: {
            select: {
              id: true, telegramId: true, firstName: true, loyaltyTier: true,
              bonusBalance: true, totalBookings: true, referralCode: true,
              marketingOptOut: true, lastMarketingAt: true,
            },
          },
        },
      });

      let sentCount = 0;
      for (const delivery of deliveries) {
        if (isQuietHours()) continue;
        if (delivery.client.marketingOptOut || !canSendMarketing(delivery.client.lastMarketingAt, 3)) {
          await prisma.campaignDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED" } });
          continue;
        }

        const text = renderTemplate(campaign.messageText, {
          firstName: delivery.client.firstName,
          loyaltyTier: delivery.client.loyaltyTier,
          bonusBalance: delivery.client.bonusBalance,
          totalBookings: delivery.client.totalBookings,
          referralCode: delivery.client.referralCode,
        });

        try {
          await sendTelegramMessage(
            delivery.client.telegramId,
            text,
            campaign.messagePhoto,
            campaign.buttonText,
            campaign.buttonAction ? `camp:${campaignId}:${campaign.buttonAction}` : undefined
          );
          await prisma.campaignDelivery.update({
            where: { id: delivery.id },
            data: { status: "SENT", sentAt: new Date() },
          });
          await prisma.client.update({
            where: { id: delivery.client.id },
            data: { lastMarketingAt: new Date() },
          });
          sentCount++;
          await sleep(34); // throttle 30 msg/sec
        } catch {
          await prisma.campaignDelivery.update({ where: { id: delivery.id }, data: { status: "FAILED" } });
        }
      }

      await prisma.campaign.update({
        where: { id: campaignId },
        data: { totalSent: { increment: sentCount }, status: "COMPLETED", completedAt: new Date() },
      });
    },
    { connection, concurrency: 1 }
  );

  // ── Auto-messages ──
  new Worker(
    "auto-messages",
    async (job) => {
      const { autoMessageId, clientId } = job.data;
      const autoMsg = await prisma.autoMessage.findUnique({ where: { id: autoMessageId } });
      if (!autoMsg || !autoMsg.isActive) return;

      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client || client.marketingOptOut) return;
      if (isQuietHours()) return;

      // Check tier, max sends, cooldown
      if (autoMsg.tierRestriction) {
        const tierOrder = ["BRONZE", "SILVER", "GOLD", "PLATINUM"];
        if (tierOrder.indexOf(client.loyaltyTier) < tierOrder.indexOf(autoMsg.tierRestriction)) return;
      }

      const sendCount = await prisma.autoMessageLog.count({ where: { autoMessageId, clientId } });
      if (sendCount >= autoMsg.maxSendsPerClient) return;

      if (autoMsg.cooldownDays > 0) {
        const lastSent = await prisma.autoMessageLog.findFirst({
          where: { autoMessageId, clientId },
          orderBy: { sentAt: "desc" },
        });
        if (lastSent && (Date.now() - lastSent.sentAt.getTime()) / 86400000 < autoMsg.cooldownDays) return;
      }

      const text = renderTemplate(autoMsg.messageText, {
        firstName: client.firstName,
        loyaltyTier: client.loyaltyTier,
        bonusBalance: client.bonusBalance,
        totalBookings: client.totalBookings,
        referralCode: client.referralCode,
      });

      try {
        await sendTelegramMessage(client.telegramId, text, autoMsg.messagePhoto, autoMsg.buttonText, autoMsg.buttonAction);
        await prisma.autoMessageLog.create({ data: { autoMessageId, clientId } });
        await prisma.client.update({ where: { id: clientId }, data: { lastMarketingAt: new Date() } });
      } catch { /* bot blocked */ }
    },
    { connection, concurrency: 5 }
  );

  // ── Abandoned booking check (every 5 min) ──
  abandonedQueue.add("check", {}, { repeat: { every: 5 * 60 * 1000 } });
  new Worker(
    "abandoned-booking",
    async () => {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000);
      const abandoned = await prisma.booking.findMany({
        where: { status: "PENDING", confirmedAt: null, createdAt: { lte: thirtyMinAgo } },
        select: { id: true, clientId: true },
      });

      const autoMsg = await prisma.autoMessage.findFirst({
        where: { trigger: "BOOKING_ABANDONED", isActive: true },
      });
      if (!autoMsg) return;

      for (const b of abandoned) {
        await autoMessageQueue.add("send", {
          autoMessageId: autoMsg.id,
          clientId: b.clientId,
        }, { delay: autoMsg.delayMinutes * 60000, jobId: `abandoned-${b.id}` });
      }
    },
    { connection }
  );

  // ── Reminders (24h and 2h before booking) ──
  reminderQueue.add("check", {}, { repeat: { every: 15 * 60 * 1000 } }); // every 15 min
  new Worker(
    "reminders",
    async () => {
      const now = new Date();

      // 24h reminders
      const tomorrow = new Date(now.getTime() + 24 * 3600000);
      const tomorrowBookings = await prisma.booking.findMany({
        where: {
          status: "CONFIRMED",
          date: { gte: new Date(tomorrow.toISOString().split("T")[0]), lte: new Date(new Date(tomorrow.getTime() + 86400000).toISOString().split("T")[0]) },
          reminder24hSent: false,
        },
        include: { client: true, venue: true },
      });

      for (const b of tomorrowBookings) {
        await sendTelegramMessage(
          b.client.telegramId,
          `⏰ Напоминание: завтра в ${b.startTime}\n📸 ${b.venue.name}\n📍 ${b.venue.address || ""}`,
        );
        await prisma.booking.update({ where: { id: b.id }, data: { reminder24hSent: true } });
      }

      // 2h reminders
      const twoHoursLater = new Date(now.getTime() + 2 * 3600000);
      const soonBookings = await prisma.booking.findMany({
        where: {
          status: "CONFIRMED",
          date: { equals: new Date(now.toISOString().split("T")[0]) },
          reminder2hSent: false,
        },
        include: { client: true, venue: true },
      });

      for (const b of soonBookings) {
        const [bookH] = b.startTime.split(":").map(Number);
        const bookTime = new Date(now);
        bookTime.setHours(bookH, 0, 0, 0);
        const diff = bookTime.getTime() - now.getTime();

        if (diff > 0 && diff <= 2.5 * 3600000) {
          await sendTelegramMessage(
            b.client.telegramId,
            `🔔 Через 2 часа: ${b.venue.name}, ${b.startTime}`,
          );
          await prisma.booking.update({ where: { id: b.id }, data: { reminder2hSent: true } });
        }
      }
    },
    { connection }
  );

  // ── Follow-up: review request 2h after completion ──
  followUpQueue.add("check", {}, { repeat: { every: 30 * 60 * 1000 } });
  new Worker(
    "follow-up",
    async () => {
      const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
      const fourHoursAgo = new Date(Date.now() - 4 * 3600000);

      const completed = await prisma.booking.findMany({
        where: {
          status: "COMPLETED",
          completedAt: { gte: fourHoursAgo, lte: twoHoursAgo },
          followUpSent: false,
          review: null,
        },
        include: { client: true, venue: true },
      });

      for (const b of completed) {
        await sendTelegramMessage(
          b.client.telegramId,
          `Спасибо за визит! 🙏\n\nКак вам ${b.venue.name}?`,
          null,
          null,
          null
        );
        // Send rating buttons separately
        const BOT_TOKEN = process.env.BOT_TOKEN;
        if (BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: b.client.telegramId.toString(),
              text: "Оцените визит:",
              reply_markup: {
                inline_keyboard: [
                  [1, 2, 3, 4, 5].map((r) => ({
                    text: "⭐".repeat(r),
                    callback_data: `review:${b.id}:${r}`,
                  })),
                ],
              },
            }),
          });
        }
        await prisma.booking.update({ where: { id: b.id }, data: { followUpSent: true } });
      }
    },
    { connection }
  );

  // ── Birthday bonus (daily at 10:00) ──
  birthdayQueue.add("check", {}, { repeat: { pattern: "0 10 * * *" } });
  new Worker(
    "birthday",
    async () => {
      const today = new Date();
      const month = today.getMonth() + 1;
      const day = today.getDate();

      const birthdayClients = await prisma.$queryRaw<Array<{ id: string; telegramId: bigint; firstName: string }>>`
        SELECT id, "telegramId", "firstName"
        FROM "Client"
        WHERE EXTRACT(MONTH FROM birthday) = ${month}
          AND EXTRACT(DAY FROM birthday) = ${day}
      `;

      const bonusSetting = await prisma.loyaltySettings.findFirst({ where: { key: "birthday_bonus" } });
      const bonus = parseInt(bonusSetting?.value || "500");

      for (const client of birthdayClients) {
        const alreadySent = await prisma.bonusTransaction.findFirst({
          where: {
            clientId: client.id,
            type: "BIRTHDAY",
            createdAt: { gte: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
          },
        });
        if (alreadySent) continue;

        await prisma.$transaction([
          prisma.bonusTransaction.create({
            data: { clientId: client.id, amount: bonus, type: "BIRTHDAY", description: `С днём рождения! 🎂` },
          }),
          prisma.client.update({
            where: { id: client.id },
            data: { bonusBalance: { increment: bonus } },
          }),
        ]);

        await sendTelegramMessage(
          client.telegramId,
          `🎂 С днём рождения, ${client.firstName}!\n\nДарим вам ${bonus} бонусов! 🎁`
        );
      }
    },
    { connection }
  );

  // ── Win-back inactive clients (daily at 11:00) ──
  winBackQueue.add("check", {}, { repeat: { pattern: "0 11 * * *" } });
  new Worker(
    "win-back",
    async () => {
      const winBackDaysSetting = await prisma.loyaltySettings.findFirst({ where: { key: "win_back_days" } });
      const winBackBonusSetting = await prisma.loyaltySettings.findFirst({ where: { key: "win_back_bonus" } });
      const winBackDays = parseInt(winBackDaysSetting?.value || "60");
      const winBackBonus = parseInt(winBackBonusSetting?.value || "300");

      const cutoff = new Date(Date.now() - winBackDays * 86400000);
      const ninetyDaysAgo = new Date(Date.now() - 90 * 86400000);

      const inactiveClients = await prisma.client.findMany({
        where: {
          lastActivityAt: { lte: cutoff },
          marketingOptOut: false,
          // Not already win-backed in last 90 days
          bonusHistory: {
            none: {
              type: "WIN_BACK",
              createdAt: { gte: ninetyDaysAgo },
            },
          },
        },
        select: { id: true, telegramId: true, firstName: true },
        take: 50, // batch
      });

      for (const client of inactiveClients) {
        await prisma.$transaction([
          prisma.bonusTransaction.create({
            data: { clientId: client.id, amount: winBackBonus, type: "WIN_BACK", description: "Бонус за возвращение" },
          }),
          prisma.client.update({
            where: { id: client.id },
            data: { bonusBalance: { increment: winBackBonus } },
          }),
        ]);

        await sendTelegramMessage(
          client.telegramId,
          `Давно не виделись, ${client.firstName}! 🤗\n\nДарим ${winBackBonus} бонусов. Скучаем!`,
          null,
          "📸 Забронировать",
          "book"
        );

        await sleep(100);
      }
    },
    { connection }
  );

  // ── Bonus expiry warning (daily at 12:00) ──
  bonusExpiryQueue.add("check", {}, { repeat: { pattern: "0 12 * * *" } });
  new Worker(
    "bonus-expiry",
    async () => {
      const expirySetting = await prisma.loyaltySettings.findFirst({ where: { key: "bonus_expiry_days" } });
      const expiryDays = parseInt(expirySetting?.value || "0");
      if (expiryDays === 0) return; // bonuses don't expire

      const warningDate = new Date(Date.now() + 7 * 86400000);

      const expiringBonuses = await prisma.bonusTransaction.findMany({
        where: {
          amount: { gt: 0 },
          expiresAt: { lte: warningDate, gt: new Date() },
        },
        include: { client: true },
      });

      const clientMap = new Map<string, { client: any; total: number }>();
      for (const tx of expiringBonuses) {
        const entry = clientMap.get(tx.clientId) || { client: tx.client, total: 0 };
        entry.total += tx.amount;
        clientMap.set(tx.clientId, entry);
      }

      for (const [_clientId, { client, total }] of clientMap) {
        if (client.marketingOptOut) continue;
        await sendTelegramMessage(
          client.telegramId,
          `⚠️ ${client.firstName}, ${total} бонусов сгорят через 7 дней!\n\nЗабронируйте сейчас, чтобы не потерять их.`,
          null,
          "📸 Забронировать",
          "book"
        );
      }
    },
    { connection }
  );

  // ── Waitlist checker (every 10 min) ──
  waitlistQueue.add("check", {}, { repeat: { every: 10 * 60 * 1000 } });
  new Worker(
    "waitlist",
    async () => {
      const activeEntries = await prisma.waitlistEntry.findMany({
        where: { isActive: true, isNotified: false },
        include: { client: true },
      });

      for (const entry of activeEntries) {
        // Check if slot is now available
        const bookings = await prisma.booking.count({
          where: {
            venueId: entry.venueId,
            date: entry.desiredDate,
            status: { in: ["PENDING", "CONFIRMED"] },
          },
        });

        if (bookings < 6) {
          // Slot available!
          await sendTelegramMessage(
            entry.client.telegramId,
            `🎉 Освободился слот!\n📅 ${entry.desiredDate.toLocaleDateString("ru-RU")}\n\nЗабронировать сейчас?`,
            null,
            "📸 Забронировать",
            "book"
          );

          await prisma.waitlistEntry.update({
            where: { id: entry.id },
            data: { isNotified: true, notifiedAt: new Date() },
          });
        }
      }
    },
    { connection }
  );

  // ── RFM recalculation (daily at 02:00) ──
  rfmQueue.add("recalculate", {}, { repeat: { pattern: "0 2 * * *" } });
  new Worker(
    "rfm-recalculate",
    async () => {
      const sixMonthsAgo = new Date(Date.now() - 180 * 86400000);
      const clients = await prisma.client.findMany({
        where: { totalBookings: { gt: 0 } },
        select: {
          id: true,
          lastActivityAt: true,
          bookings: {
            where: { status: "COMPLETED", completedAt: { gte: sixMonthsAgo } },
            select: { finalPrice: true },
          },
        },
      });

      for (const client of clients) {
        const recency = Math.floor((Date.now() - client.lastActivityAt.getTime()) / 86400000);
        const frequency = client.bookings.length;
        const monetary = client.bookings.reduce((s, b) => s + Number(b.finalPrice), 0);

        let segment: string;
        if (recency <= 14 && frequency >= 5 && monetary >= 50000) segment = "CHAMPIONS";
        else if (recency <= 30 && frequency >= 3) segment = "LOYAL";
        else if (recency <= 30 && frequency <= 2) segment = "NEW";
        else if (recency <= 60 && frequency >= 2) segment = "PROMISING";
        else if (recency <= 90 && frequency >= 3) segment = "SLEEPING";
        else segment = "LOST";

        await prisma.client.update({
          where: { id: client.id },
          data: { rfmSegment: segment as any, rfmRecency: recency, rfmFrequency: frequency, rfmMonetary: monetary },
        });
      }
      console.log(`[RFM] Updated ${clients.length} clients`);
    },
    { connection }
  );

  // ── Daily admin summary (09:00) ──
  const summaryQueue = new Queue("daily-summary", { connection });
  summaryQueue.add("send", {}, { repeat: { pattern: "0 9 * * *" } });
  new Worker(
    "daily-summary",
    async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today.getTime() + 86400000);

      const [todayBookings, todayRevenue, pendingCount] = await Promise.all([
        prisma.booking.count({
          where: { date: { gte: today, lt: tomorrow }, status: { in: ["CONFIRMED", "COMPLETED"] } },
        }),
        prisma.booking.aggregate({
          where: { date: { gte: today, lt: tomorrow }, status: "COMPLETED" },
          _sum: { finalPrice: true },
        }),
        prisma.booking.count({ where: { status: "PENDING" } }),
      ]);

      const admins = await prisma.admin.findMany({
        where: { telegramId: { not: null }, isActive: true },
        select: { telegramId: true },
      });

      const text =
        `📊 Дневная сводка\n\n` +
        `📅 Бронирований сегодня: ${todayBookings}\n` +
        `💰 Выручка: ${Number(todayRevenue._sum.finalPrice || 0).toLocaleString("ru-RU")}₽\n` +
        `⏳ Ожидают подтверждения: ${pendingCount}`;

      for (const admin of admins) {
        if (admin.telegramId) {
          await sendTelegramMessage(admin.telegramId, text);
        }
      }
    },
    { connection }
  );

  console.log("📦 All BullMQ jobs initialized (13 workers)");
}
