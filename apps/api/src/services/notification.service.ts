// ─── Types ───────────────────────────────────────────────

interface TelegramSendResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

interface BookingWithRelations {
  id: string;
  humanId: string;
  date: Date;
  startTime: string;
  endTime: string;
  durationHours: number;
  finalPrice: unknown; // Decimal from Prisma
  bonusUsed: number;
  bonusEarned: number;
  comment: string | null;
  venue: {
    name: string;
    address: string | null;
  };
  client: {
    firstName: string;
    lastName: string | null;
    telegramId: bigint;
    telegramUsername: string | null;
    phone: string | null;
    loyaltyTier: string;
  };
}

// ─── Config ──────────────────────────────────────────────

function getBotToken(): string {
  const token = process.env.BOT_TOKEN;
  if (!token) {
    throw new Error("BOT_TOKEN environment variable is not set");
  }
  return token;
}

function getAdminChatId(): string {
  const chatId = process.env.ADMIN_CHAT_ID;
  if (!chatId) {
    throw new Error("ADMIN_CHAT_ID environment variable is not set");
  }
  return chatId;
}

// ─── Telegram API ────────────────────────────────────────

export async function sendTelegramMessage(
  telegramId: string | bigint,
  text: string,
  photo?: string,
  buttonText?: string,
  callbackData?: string,
): Promise<TelegramSendResult> {
  const botToken = getBotToken();
  const chatId = String(telegramId);

  const inlineKeyboard =
    buttonText && callbackData
      ? {
          reply_markup: {
            inline_keyboard: [
              [{ text: buttonText, callback_data: callbackData }],
            ],
          },
        }
      : {};

  try {
    if (photo) {
      // Send photo with caption
      const response = await fetch(
        `https://api.telegram.org/bot${botToken}/sendPhoto`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            photo,
            caption: text,
            parse_mode: "HTML",
            ...inlineKeyboard,
          }),
        },
      );

      const data = (await response.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };

      if (!data.ok) {
        console.error("Telegram sendPhoto failed:", data.description);
        return { ok: false, error: data.description };
      }

      return { ok: true, messageId: data.result?.message_id };
    }

    // Send text message
    const response = await fetch(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: "HTML",
          ...inlineKeyboard,
        }),
      },
    );

    const data = (await response.json()) as {
      ok: boolean;
      result?: { message_id: number };
      description?: string;
    };

    if (!data.ok) {
      console.error("Telegram sendMessage failed:", data.description);
      return { ok: false, error: data.description };
    }

    return { ok: true, messageId: data.result?.message_id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Telegram API error:", message);
    return { ok: false, error: message };
  }
}

// ─── Format helpers ──────────────────────────────────────

function formatDate(date: Date): string {
  const d = new Date(date);
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatMoney(value: unknown): string {
  return `${Number(value).toLocaleString("ru-RU")} ₽`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ─── Notification: Admin - New Booking ───────────────────

export async function notifyAdminNewBooking(
  booking: BookingWithRelations,
): Promise<TelegramSendResult> {
  const clientName = [booking.client.firstName, booking.client.lastName]
    .filter(Boolean)
    .join(" ");

  const username = booking.client.telegramUsername
    ? `@${booking.client.telegramUsername}`
    : "n/a";

  const phone = booking.client.phone ?? "n/a";

  const lines = [
    `🆕 <b>Новая бронь ${escapeHtml(booking.humanId)}</b>`,
    ``,
    `📍 ${escapeHtml(booking.venue.name)}`,
    `📅 ${formatDate(booking.date)} | ${booking.startTime}–${booking.endTime} (${booking.durationHours}ч)`,
    `💰 ${formatMoney(booking.finalPrice)}`,
    ``,
    `👤 ${escapeHtml(clientName)}`,
    `📱 ${phone} | ${username}`,
    `🏅 ${booking.client.loyaltyTier}`,
  ];

  if (booking.bonusUsed > 0) {
    lines.push(`🔻 Бонусов списано: ${booking.bonusUsed}`);
  }
  if (booking.comment) {
    lines.push(`💬 ${escapeHtml(booking.comment)}`);
  }

  const text = lines.join("\n");
  const adminChatId = getAdminChatId();

  return sendTelegramMessage(
    adminChatId,
    text,
    undefined,
    "Подтвердить",
    `confirm_booking:${booking.id}`,
  );
}

// ─── Notification: Client - Booking Confirmed ────────────

export async function notifyClientBookingConfirmed(
  booking: BookingWithRelations,
): Promise<TelegramSendResult> {
  const lines = [
    `✅ <b>Бронирование подтверждено!</b>`,
    ``,
    `📍 ${escapeHtml(booking.venue.name)}`,
    booking.venue.address ? `📌 ${escapeHtml(booking.venue.address)}` : null,
    `📅 ${formatDate(booking.date)}`,
    `🕐 ${booking.startTime}–${booking.endTime} (${booking.durationHours}ч)`,
    `💰 К оплате: ${formatMoney(booking.finalPrice)}`,
    ``,
    `Номер брони: <b>${escapeHtml(booking.humanId)}</b>`,
  ];

  if (booking.bonusEarned > 0) {
    lines.push(`🎁 После визита вы получите ${booking.bonusEarned} бонусов`);
  }

  const text = lines.filter(Boolean).join("\n");

  return sendTelegramMessage(booking.client.telegramId, text);
}

// ─── Notification: Client - Booking Cancelled ────────────

export async function notifyClientBookingCancelled(
  booking: BookingWithRelations,
  reason?: string,
): Promise<TelegramSendResult> {
  const lines = [
    `❌ <b>Бронирование отменено</b>`,
    ``,
    `📍 ${escapeHtml(booking.venue.name)}`,
    `📅 ${formatDate(booking.date)} | ${booking.startTime}–${booking.endTime}`,
    `Номер брони: <b>${escapeHtml(booking.humanId)}</b>`,
  ];

  if (reason) {
    lines.push(``, `Причина: ${escapeHtml(reason)}`);
  }

  if (booking.bonusUsed > 0) {
    lines.push(``, `🔄 ${booking.bonusUsed} бонусов возвращены на ваш счёт`);
  }

  const text = lines.join("\n");

  return sendTelegramMessage(booking.client.telegramId, text);
}
