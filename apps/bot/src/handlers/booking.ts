import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import { formatPrice, formatDate, checkMilestone } from "@studio/utils";
import { getVenueSocialProof, getPostBookingReinforcement } from "../services/social-proof";
import { updateClientPreferences } from "../services/recommendation";
import { generateCalendarKeyboard } from "../keyboards/calendar";
import { generateTimeSlotsKeyboard } from "../keyboards/time-slots";
import { generateAddonsKeyboard } from "../keyboards/addons";
import type { StudioContext } from "../context";

const MILESTONE_BONUSES: Record<number, number> = {
  5: 500,
  10: 1000,
  20: 2000,
  50: 5000,
  100: 10000,
};

export function registerBooking(bot: Bot<StudioContext>) {
  // ─── Step 1: Venue selection ────────────────────────────────
  bot.hears("📸 Забронировать", async (ctx) => {
    await showVenueSelection(ctx);
  });

  bot.callbackQuery("booking_start", async (ctx) => {
    await ctx.answerCallbackQuery();
    await showVenueSelection(ctx);
  });

  // ─── Venue chosen ───────────────────────────────────────────
  bot.callbackQuery(/^book_venue:(.+)$/, async (ctx) => {
    const venueId = ctx.match[1];
    ctx.session.bookingData = { venueId };
    ctx.session.bookingStep = "date";

    const venue = await prisma.venue.findUnique({
      where: { id: venueId },
      include: { addons: { where: { isActive: true } } },
    });

    if (!venue) {
      await ctx.answerCallbackQuery("Площадка не найдена");
      return;
    }

    // Show venue details with photos
    const socialProof = await getVenueSocialProof(venueId);
    const description =
      `📸 <b>${venue.name}</b>\n\n` +
      (venue.description ? `${venue.description}\n\n` : "") +
      `💰 от ${formatPrice(Number(venue.pricePerHour))}/ч\n` +
      `⏱ ${venue.minHours}–${venue.maxHours} ч\n` +
      (venue.amenities.length > 0 ? `🏠 ${venue.amenities.join(", ")}\n` : "") +
      (socialProof ? `\n${socialProof}\n` : "");

    // Send venue photo if available
    if (venue.photos.length > 0) {
      try {
        await ctx.replyWithPhoto(venue.photos[0], {
          caption: description,
          parse_mode: "HTML",
        });
      } catch {
        // If photo fails, just send text
        await ctx.reply(description, { parse_mode: "HTML" });
      }
    } else {
      await ctx.reply(description, { parse_mode: "HTML" });
    }

    // Show calendar
    const now = new Date();
    const calendarKb = await generateCalendarKeyboard(venueId, now.getFullYear(), now.getMonth());

    await ctx.reply("📅 Выберите дату:", { reply_markup: calendarKb });
    await ctx.answerCallbackQuery();
  });

  // ─── Calendar navigation ────────────────────────────────────
  bot.callbackQuery(/^cal_nav:(\d{4})-(\d{2})$/, async (ctx) => {
    const year = parseInt(ctx.match[1], 10);
    const month = parseInt(ctx.match[2], 10) - 1;
    const venueId = ctx.session.bookingData?.venueId;

    if (!venueId) {
      await ctx.answerCallbackQuery("Ошибка: площадка не выбрана.");
      return;
    }

    const calendarKb = await generateCalendarKeyboard(venueId, year, month);

    try {
      await ctx.editMessageText("📅 Выберите дату:", { reply_markup: calendarKb });
    } catch {
      await ctx.reply("📅 Выберите дату:", { reply_markup: calendarKb });
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Noop callback (for calendar headers, etc.) ─────────────
  bot.callbackQuery("cal_noop", async (ctx) => {
    await ctx.answerCallbackQuery();
  });

  // ─── Step 2: Date chosen → Show time slots ──────────────────
  bot.callbackQuery(/^cal:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
    const date = ctx.match[1];
    const venueId = ctx.session.bookingData?.venueId;

    if (!venueId) {
      await ctx.answerCallbackQuery("Ошибка: площадка не выбрана.");
      return;
    }

    ctx.session.bookingData.date = date;
    ctx.session.bookingStep = "time";

    const timeSlotsKb = await generateTimeSlotsKeyboard(venueId, date);

    try {
      await ctx.editMessageText(
        `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
        { reply_markup: timeSlotsKb },
      );
    } catch {
      await ctx.reply(
        `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
        { reply_markup: timeSlotsKb },
      );
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Step 3: Time chosen → Show duration options ────────────
  bot.callbackQuery(/^time:(\d{2}:\d{2})$/, async (ctx) => {
    const startTime = ctx.match[1];
    const venueId = ctx.session.bookingData?.venueId;
    const date = ctx.session.bookingData?.date;

    if (!venueId || !date) {
      await ctx.answerCallbackQuery("Ошибка: данные сессии потеряны.");
      return;
    }

    ctx.session.bookingData.startTime = startTime;
    ctx.session.bookingStep = "duration";

    const venue = await prisma.venue.findUnique({ where: { id: venueId } });
    if (!venue) {
      await ctx.answerCallbackQuery("Площадка не найдена.");
      return;
    }

    // Calculate max available hours from this start time
    const schedule = await getScheduleForDate(venueId, date);
    const maxAvailable = schedule
      ? calculateMaxHours(startTime, schedule.closeTime, venueId, date)
      : venue.maxHours;
    const resolvedMax = await maxAvailable;

    const keyboard = new InlineKeyboard();
    const minH = venue.minHours;
    const maxH = Math.min(venue.maxHours, resolvedMax);

    for (let h = minH; h <= maxH; h++) {
      const hourLabel = h === 1 ? "час" : h < 5 ? "часа" : "часов";
      keyboard.text(`${h} ${hourLabel}`, `book_duration:${h}`);
      if (h % 3 === 0) keyboard.row();
    }

    if (keyboard.inline_keyboard?.length === 0) {
      keyboard.text("Нет доступной длительности", "cal_noop");
    }

    keyboard.row();
    keyboard.text("◀️ Назад", "booking_back:time");

    try {
      await ctx.editMessageText(
        `⏱ Выберите продолжительность:\n` +
          `Начало: ${startTime}\n` +
          `💰 ${formatPrice(Number(venue.pricePerHour))}/ч`,
        { reply_markup: keyboard },
      );
    } catch {
      await ctx.reply(
        `⏱ Выберите продолжительность:\n` +
          `Начало: ${startTime}\n` +
          `💰 ${formatPrice(Number(venue.pricePerHour))}/ч`,
        { reply_markup: keyboard },
      );
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Step 4: Duration chosen → Show addons ──────────────────
  bot.callbackQuery(/^book_duration:(\d+)$/, async (ctx) => {
    const hours = parseInt(ctx.match[1], 10);
    ctx.session.bookingData.durationHours = hours;
    ctx.session.bookingData.selectedAddons = {};
    ctx.session.bookingStep = "addons";

    const venueId = ctx.session.bookingData.venueId!;
    const addonsKb = await generateAddonsKeyboard(venueId, {});

    try {
      await ctx.editMessageText("🛒 Выберите дополнительные услуги:", {
        reply_markup: addonsKb,
      });
    } catch {
      await ctx.reply("🛒 Выберите дополнительные услуги:", {
        reply_markup: addonsKb,
      });
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Addon toggle ───────────────────────────────────────────
  bot.callbackQuery(/^addon_toggle:(.+)$/, async (ctx) => {
    const addonId = ctx.match[1];
    const selected = ctx.session.bookingData.selectedAddons || {};

    if (selected[addonId]) {
      delete selected[addonId];
    } else {
      selected[addonId] = 1;
    }

    ctx.session.bookingData.selectedAddons = selected;

    const venueId = ctx.session.bookingData.venueId!;
    const addonsKb = await generateAddonsKeyboard(venueId, selected);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: addonsKb });
    } catch {
      // ignore
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Addon quantity ─────────────────────────────────────────
  bot.callbackQuery(/^addon_qty:(.+):([\+\-])$/, async (ctx) => {
    const addonId = ctx.match[1];
    const direction = ctx.match[2];
    const selected = ctx.session.bookingData.selectedAddons || {};

    const addon = await prisma.addon.findUnique({ where: { id: addonId } });
    if (!addon) {
      await ctx.answerCallbackQuery("Услуга не найдена.");
      return;
    }

    const current = selected[addonId] || 0;
    if (direction === "+") {
      if (current < addon.maxQuantity) {
        selected[addonId] = current + 1;
      } else {
        await ctx.answerCallbackQuery(`Максимум: ${addon.maxQuantity}`);
        return;
      }
    } else {
      if (current > 0) {
        selected[addonId] = current - 1;
        if (selected[addonId] === 0) delete selected[addonId];
      }
    }

    ctx.session.bookingData.selectedAddons = selected;

    const venueId = ctx.session.bookingData.venueId!;
    const addonsKb = await generateAddonsKeyboard(venueId, selected);

    try {
      await ctx.editMessageReplyMarkup({ reply_markup: addonsKb });
    } catch {
      // ignore
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Addons done / skip → Show price confirmation ───────────
  bot.callbackQuery(/^addons_(done|skip)$/, async (ctx) => {
    ctx.session.bookingStep = "confirm";
    await ctx.answerCallbackQuery();
    await showConfirmation(ctx);
  });

  // ─── Promocode entry ────────────────────────────────────────
  bot.callbackQuery("book_promo", async (ctx) => {
    ctx.session.bookingStep = "promo_input";
    await ctx.answerCallbackQuery();
    await ctx.reply("🏷 Введите промокод:");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.bookingStep !== "promo_input") return next();

    const code = ctx.message.text.trim().toUpperCase();
    const promo = await prisma.promocode.findFirst({
      where: {
        code,
        isActive: true,
        validFrom: { lte: new Date() },
        validUntil: { gte: new Date() },
      },
    });

    if (!promo) {
      await ctx.reply("❌ Промокод не найден или истёк. Попробуйте другой:");
      return;
    }

    // Check if venue-specific
    if (promo.venueId && promo.venueId !== ctx.session.bookingData.venueId) {
      await ctx.reply("❌ Этот промокод не действует для выбранной площадки.");
      return;
    }

    // Check max uses
    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      await ctx.reply("❌ Промокод уже использован максимальное число раз.");
      return;
    }

    // Check if already used by this client
    const usedBefore = await prisma.usedPromocode.findFirst({
      where: { clientId: ctx.client.id, promocodeId: promo.id },
    });
    if (usedBefore) {
      await ctx.reply("❌ Вы уже использовали этот промокод.");
      return;
    }

    // Check first booking restriction
    if (promo.firstBookingOnly && ctx.client.totalBookings > 0) {
      await ctx.reply("❌ Этот промокод только для первого бронирования.");
      return;
    }

    // Check tier restriction
    if (promo.tierRestriction && ctx.client.loyaltyTier !== promo.tierRestriction) {
      await ctx.reply("❌ Этот промокод не доступен для вашего уровня лояльности.");
      return;
    }

    ctx.session.bookingData.promocode = code;
    ctx.session.bookingStep = "confirm";

    await ctx.reply(`✅ Промокод «${code}» применён!`);
    await showConfirmation(ctx);
  });

  // ─── Bonus spending ─────────────────────────────────────────
  bot.callbackQuery("book_use_bonus", async (ctx) => {
    const balance = ctx.client.bonusBalance;
    if (balance <= 0) {
      await ctx.answerCallbackQuery("У вас нет бонусов.");
      return;
    }

    ctx.session.bookingStep = "bonus_input";
    await ctx.answerCallbackQuery();
    await ctx.reply(
      `💰 У вас ${balance} бонусов (1 бонус = 1₽).\n` +
        `Сколько хотите использовать? Введите число:`,
    );
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.bookingStep !== "bonus_input") return next();

    const amount = parseInt(ctx.message.text.trim(), 10);
    if (isNaN(amount) || amount <= 0) {
      await ctx.reply("Введите положительное число:");
      return;
    }

    const maxBonus = Math.min(amount, ctx.client.bonusBalance);
    ctx.session.bookingData.bonusToSpend = maxBonus;
    ctx.session.bookingStep = "confirm";

    await ctx.reply(`✅ Будет списано ${maxBonus} бонусов.`);
    await showConfirmation(ctx);
  });

  // ─── Comment ────────────────────────────────────────────────
  bot.callbackQuery("book_comment", async (ctx) => {
    ctx.session.bookingStep = "comment_input";
    await ctx.answerCallbackQuery();
    await ctx.reply("💬 Напишите комментарий к бронированию:");
  });

  bot.on("message:text", async (ctx, next) => {
    if (ctx.session.bookingStep !== "comment_input") return next();

    ctx.session.bookingData.comment = ctx.message.text.trim();
    ctx.session.bookingStep = "confirm";
    await ctx.reply("✅ Комментарий сохранён.");
    await showConfirmation(ctx);
  });

  // ─── Confirm booking ────────────────────────────────────────
  bot.callbackQuery("book_confirm", async (ctx) => {
    const bd = ctx.session.bookingData;
    const venue = await prisma.venue.findUnique({ where: { id: bd.venueId! } });
    if (!venue) {
      await ctx.answerCallbackQuery("Ошибка: площадка не найдена.");
      return;
    }

    const priceBreakdown = await calculatePrice(ctx);
    const endTime = calculateEndTime(bd.startTime!, bd.durationHours!);

    // Generate human ID
    const today = new Date();
    const datePrefix = `B-${today.getFullYear().toString().slice(2)}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const todayBookings = await prisma.booking.count({
      where: {
        humanId: { startsWith: datePrefix },
      },
    });
    const humanId = `${datePrefix}-${String(todayBookings + 1).padStart(3, "0")}`;

    // Apply promocode
    let promocodeId: string | undefined;
    if (bd.promocode) {
      const promo = await prisma.promocode.findFirst({
        where: { code: bd.promocode, isActive: true },
      });
      if (promo) {
        promocodeId = promo.id;
        await prisma.promocode.update({
          where: { id: promo.id },
          data: { usedCount: { increment: 1 } },
        });
        await prisma.usedPromocode.create({
          data: { clientId: ctx.client.id, promocodeId: promo.id },
        });
      }
    }

    // Create booking
    const booking = await prisma.booking.create({
      data: {
        humanId,
        clientId: ctx.client.id,
        venueId: bd.venueId!,
        date: new Date(bd.date!),
        startTime: bd.startTime!,
        endTime,
        durationHours: bd.durationHours!,
        basePrice: priceBreakdown.basePrice,
        pricingDetails: priceBreakdown.pricingDetails,
        addonsTotal: priceBreakdown.addonsTotal,
        discountAmount: priceBreakdown.discountAmount,
        discountDetails: priceBreakdown.discountDetails,
        bonusUsed: bd.bonusToSpend || 0,
        finalPrice: priceBreakdown.finalPrice,
        promocodeId,
        comment: bd.comment,
        giftCertId: bd.giftCertId,
        status: "PENDING",
      },
    });

    // Create booking addons
    if (bd.selectedAddons && Object.keys(bd.selectedAddons).length > 0) {
      const addonRecords = await prisma.addon.findMany({
        where: { id: { in: Object.keys(bd.selectedAddons) } },
      });

      for (const addon of addonRecords) {
        const qty = bd.selectedAddons![addon.id] || 0;
        if (qty <= 0) continue;

        const price =
          addon.priceType === "PER_HOUR"
            ? Number(addon.price) * bd.durationHours! * qty
            : Number(addon.price) * qty;

        await prisma.bookingAddon.create({
          data: {
            bookingId: booking.id,
            addonId: addon.id,
            quantity: qty,
            price,
          },
        });
      }
    }

    // Deduct bonus
    if (bd.bonusToSpend && bd.bonusToSpend > 0) {
      await prisma.client.update({
        where: { id: ctx.client.id },
        data: { bonusBalance: { decrement: bd.bonusToSpend } },
      });
      await prisma.bonusTransaction.create({
        data: {
          clientId: ctx.client.id,
          amount: -bd.bonusToSpend,
          type: "SPENT",
          description: `Списание за бронирование #${humanId}`,
          bookingId: booking.id,
        },
      });
    }

    // Update client stats
    const newTotal = ctx.client.totalBookings + 1;
    await prisma.client.update({
      where: { id: ctx.client.id },
      data: {
        totalBookings: { increment: 1 },
        totalSpent: { increment: Number(priceBreakdown.finalPrice) },
        lastActivityAt: new Date(),
      },
    });

    // Check milestone
    const milestone = checkMilestone(newTotal);
    let milestoneText = "";
    if (milestone) {
      const bonus = MILESTONE_BONUSES[milestone] || 0;
      if (bonus > 0) {
        await prisma.client.update({
          where: { id: ctx.client.id },
          data: { bonusBalance: { increment: bonus } },
        });
        await prisma.bonusTransaction.create({
          data: {
            clientId: ctx.client.id,
            amount: bonus,
            type: "MILESTONE_BONUS",
            description: `Юбилейная бронь #${milestone}`,
            bookingId: booking.id,
          },
        });
        milestoneText = `\n\n🎉 Это ваше ${milestone}-е бронирование! Начислено ${bonus} бонусов!`;
      }
    }

    // Update preferences
    await updateClientPreferences(ctx.client.id);

    // Post-booking reinforcement
    const dayOfWeek = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"][
      new Date(bd.date!).getDay()
    ];
    const reinforcement = await getPostBookingReinforcement(bd.venueId!, dayOfWeek);

    // Notify admin (send to admin telegram if configured)
    await notifyAdmin(booking.id, venue.name, bd, ctx.client, humanId);

    const confirmText =
      `✅ Бронирование создано!\n\n` +
      `📸 ${venue.name}\n` +
      `📅 ${formatDate(new Date(bd.date!))} · ${bd.startTime} – ${endTime}\n` +
      `⏱ ${bd.durationHours} ч.\n` +
      `💰 ${formatPrice(Number(priceBreakdown.finalPrice))}\n` +
      `🔖 #${humanId}\n\n` +
      reinforcement +
      milestoneText;

    try {
      await ctx.editMessageText(confirmText, {
        reply_markup: new InlineKeyboard().text("📋 Мои брони", "my_bookings"),
      });
    } catch {
      await ctx.reply(confirmText, {
        reply_markup: new InlineKeyboard().text("📋 Мои брони", "my_bookings"),
      });
    }
    await ctx.answerCallbackQuery("Забронировано! ✅");

    // Reset session
    ctx.session.bookingStep = null;
    ctx.session.bookingData = {};
  });

  // ─── Cancel booking ─────────────────────────────────────────
  bot.callbackQuery("book_cancel", async (ctx) => {
    ctx.session.bookingStep = null;
    ctx.session.bookingData = {};
    try {
      await ctx.editMessageText("❌ Бронирование отменено.");
    } catch {
      await ctx.reply("❌ Бронирование отменено.");
    }
    await ctx.answerCallbackQuery();
  });

  // ─── Back navigation ────────────────────────────────────────
  bot.callbackQuery(/^booking_back:(.+)$/, async (ctx) => {
    const step = ctx.match[1];
    await ctx.answerCallbackQuery();

    switch (step) {
      case "venue": {
        ctx.session.bookingStep = null;
        ctx.session.bookingData = {};
        await showVenueSelection(ctx);
        break;
      }
      case "date": {
        const venueId = ctx.session.bookingData?.venueId;
        if (!venueId) {
          await showVenueSelection(ctx);
          return;
        }
        ctx.session.bookingStep = "date";
        ctx.session.bookingData.date = undefined;

        const now = new Date();
        const calendarKb = await generateCalendarKeyboard(venueId, now.getFullYear(), now.getMonth());
        try {
          await ctx.editMessageText("📅 Выберите дату:", { reply_markup: calendarKb });
        } catch {
          await ctx.reply("📅 Выберите дату:", { reply_markup: calendarKb });
        }
        break;
      }
      case "time": {
        const { venueId, date } = ctx.session.bookingData || {};
        if (!venueId || !date) {
          await showVenueSelection(ctx);
          return;
        }
        ctx.session.bookingStep = "time";
        ctx.session.bookingData.startTime = undefined;

        const timeSlotsKb = await generateTimeSlotsKeyboard(venueId, date);
        try {
          await ctx.editMessageText(
            `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
            { reply_markup: timeSlotsKb },
          );
        } catch {
          await ctx.reply(
            `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
            { reply_markup: timeSlotsKb },
          );
        }
        break;
      }
      case "duration": {
        const { venueId, date, startTime } = ctx.session.bookingData || {};
        if (!venueId || !date || !startTime) {
          await showVenueSelection(ctx);
          return;
        }
        ctx.session.bookingStep = "duration";
        ctx.session.bookingData.durationHours = undefined;
        ctx.session.bookingData.selectedAddons = {};

        // Re-show time slot selection
        const timeSlotsKb = await generateTimeSlotsKeyboard(venueId, date);
        try {
          await ctx.editMessageText(
            `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
            { reply_markup: timeSlotsKb },
          );
        } catch {
          await ctx.reply(
            `🕐 Свободные окна на ${formatDate(new Date(date))}:`,
            { reply_markup: timeSlotsKb },
          );
        }
        break;
      }
      default: {
        await showVenueSelection(ctx);
      }
    }
  });
}

// ─── Helper: Show venue selection ───────────────────────────────
async function showVenueSelection(ctx: StudioContext) {
  const venues = await prisma.venue.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (venues.length === 0) {
    await ctx.reply("К сожалению, нет доступных площадок.");
    return;
  }

  const keyboard = new InlineKeyboard();
  for (const venue of venues) {
    const socialProof = await getVenueSocialProof(venue.id);
    const label =
      `📸 ${venue.name} — от ${formatPrice(Number(venue.pricePerHour))}/ч` +
      (socialProof ? ` · ${socialProof.split("\n")[0]}` : "");
    keyboard.text(label, `book_venue:${venue.id}`).row();
  }

  await ctx.reply("Выберите площадку:", { reply_markup: keyboard });
}

// ─── Helper: Show price confirmation ────────────────────────────
async function showConfirmation(ctx: StudioContext) {
  const bd = ctx.session.bookingData;
  const venue = await prisma.venue.findUnique({ where: { id: bd.venueId! } });
  if (!venue) return;

  const priceBreakdown = await calculatePrice(ctx);
  const endTime = calculateEndTime(bd.startTime!, bd.durationHours!);

  let text =
    `📋 <b>Подтвердите бронирование:</b>\n\n` +
    `📸 ${venue.name}\n` +
    `📅 ${formatDate(new Date(bd.date!))} · ${bd.startTime} – ${endTime}\n` +
    `⏱ ${bd.durationHours} ч.\n\n` +
    `<b>Стоимость:</b>\n` +
    `  Базовая: ${formatPrice(priceBreakdown.basePrice)}\n`;

  // Pricing rules applied
  if (priceBreakdown.pricingDetails && Array.isArray(priceBreakdown.pricingDetails)) {
    for (const rule of priceBreakdown.pricingDetails as any[]) {
      text += `  ${rule.name}: x${rule.multiplier}\n`;
    }
  }

  // Addons
  if (priceBreakdown.addonsTotal > 0) {
    text += `  Допуслуги: +${formatPrice(priceBreakdown.addonsTotal)}\n`;
  }

  // Discount
  if (priceBreakdown.discountAmount > 0) {
    text += `  Скидка: -${formatPrice(priceBreakdown.discountAmount)}\n`;
  }

  // Bonus
  if (bd.bonusToSpend && bd.bonusToSpend > 0) {
    text += `  Бонусы: -${formatPrice(bd.bonusToSpend)}\n`;
  }

  text +=
    `\n<b>Итого: ${formatPrice(Number(priceBreakdown.finalPrice))}</b>\n\n` +
    `⏳ Слот зарезервирован на 10 минут.`;

  if (bd.comment) {
    text += `\n💬 ${bd.comment}`;
  }

  const keyboard = new InlineKeyboard();
  keyboard.text("✅ Подтвердить", "book_confirm").row();

  if (!bd.promocode) {
    keyboard.text("🏷 Промокод", "book_promo");
  }

  if (!bd.bonusToSpend && ctx.client.bonusBalance > 0) {
    keyboard.text("💰 Использовать бонусы", "book_use_bonus");
  }
  keyboard.row();

  if (!bd.comment) {
    keyboard.text("💬 Комментарий", "book_comment").row();
  }

  keyboard.text("❌ Отменить", "book_cancel");

  try {
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
  } catch {
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}

// ─── Price calculation ──────────────────────────────────────────
interface PriceBreakdown {
  basePrice: number;
  pricingDetails: any[];
  addonsTotal: number;
  discountAmount: number;
  discountDetails: any;
  finalPrice: number;
}

async function calculatePrice(ctx: StudioContext): Promise<PriceBreakdown> {
  const bd = ctx.session.bookingData;
  const venue = await prisma.venue.findUnique({ where: { id: bd.venueId! } });
  if (!venue) throw new Error("Venue not found");

  let basePrice = Number(venue.pricePerHour) * bd.durationHours!;

  // Apply pricing rules
  const pricingRules = await prisma.pricingRule.findMany({
    where: { venueId: bd.venueId!, isActive: true },
    orderBy: { priority: "desc" },
  });

  const dateObj = new Date(bd.date!);
  const dow = (dateObj.getDay() + 6) % 7; // Mon=0
  const startMinutes = toMinutes(bd.startTime!);
  const appliedRules: any[] = [];

  let adjustedPrice = basePrice;
  for (const rule of pricingRules) {
    let applies = false;

    switch (rule.type) {
      case "WEEKEND":
        applies = dow >= 5; // Sat/Sun
        break;
      case "TIME_RANGE":
        if (rule.startTime && rule.endTime) {
          const ruleStart = toMinutes(rule.startTime);
          const ruleEnd = toMinutes(rule.endTime);
          applies = startMinutes >= ruleStart && startMinutes < ruleEnd;
        }
        break;
      case "SPECIFIC_DATE":
        if (rule.specificDate) {
          const ruleDate = new Date(rule.specificDate);
          applies =
            ruleDate.getFullYear() === dateObj.getFullYear() &&
            ruleDate.getMonth() === dateObj.getMonth() &&
            ruleDate.getDate() === dateObj.getDate();
        }
        break;
      case "LONG_BOOKING":
        applies = rule.minHours != null && bd.durationHours! >= rule.minHours;
        break;
    }

    if (applies) {
      adjustedPrice = adjustedPrice * Number(rule.multiplier);
      appliedRules.push({
        name: rule.name,
        type: rule.type,
        multiplier: Number(rule.multiplier),
      });
    }
  }

  // Calculate addons total
  let addonsTotal = 0;
  if (bd.selectedAddons && Object.keys(bd.selectedAddons).length > 0) {
    const addonRecords = await prisma.addon.findMany({
      where: { id: { in: Object.keys(bd.selectedAddons) } },
    });

    for (const addon of addonRecords) {
      const qty = bd.selectedAddons![addon.id] || 0;
      if (qty <= 0) continue;

      const price =
        addon.priceType === "PER_HOUR"
          ? Number(addon.price) * bd.durationHours! * qty
          : Number(addon.price) * qty;

      addonsTotal += price;
    }
  }

  // Calculate discount
  let discountAmount = 0;
  let discountDetails: any = null;

  if (bd.promocode) {
    const promo = await prisma.promocode.findFirst({
      where: { code: bd.promocode, isActive: true },
    });
    if (promo) {
      if (promo.type === "PERCENT") {
        discountAmount = adjustedPrice * (Number(promo.value) / 100);
        if (promo.maxDiscount) {
          discountAmount = Math.min(discountAmount, Number(promo.maxDiscount));
        }
      } else if (promo.type === "FIXED") {
        discountAmount = Number(promo.value);
      }
      discountDetails = { code: bd.promocode, type: promo.type, value: Number(promo.value) };
    }
  }

  // Loyalty tier discount
  const tierDiscounts: Record<string, number> = {
    BRONZE: 0,
    SILVER: 0.05,
    GOLD: 0.07,
    PLATINUM: 0.1,
  };
  const tierDiscount = tierDiscounts[ctx.client.loyaltyTier] || 0;
  if (tierDiscount > 0) {
    const loyaltyDisc = adjustedPrice * tierDiscount;
    discountAmount += loyaltyDisc;
    discountDetails = {
      ...(discountDetails || {}),
      loyaltyDiscount: tierDiscount,
      loyaltyAmount: loyaltyDisc,
    };
  }

  const bonusDeduction = bd.bonusToSpend || 0;
  const finalPrice = Math.max(0, adjustedPrice + addonsTotal - discountAmount - bonusDeduction);

  return {
    basePrice,
    pricingDetails: appliedRules,
    addonsTotal,
    discountAmount,
    discountDetails,
    finalPrice: Math.round(finalPrice * 100) / 100,
  };
}

function calculateEndTime(startTime: string, hours: number): string {
  const startMinutes = toMinutes(startTime);
  const endMinutes = startMinutes + hours * 60;
  const h = Math.floor(endMinutes / 60);
  const m = endMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function toMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

async function getScheduleForDate(
  venueId: string,
  dateStr: string,
): Promise<{ openTime: string; closeTime: string } | null> {
  const dateObj = new Date(dateStr);
  const dow = (dateObj.getDay() + 6) % 7;

  const schedule = await prisma.schedule.findFirst({
    where: { venueId, dayOfWeek: dow, isActive: true },
  });

  if (!schedule) return null;
  return { openTime: schedule.openTime, closeTime: schedule.closeTime };
}

async function calculateMaxHours(
  startTime: string,
  closeTime: string,
  venueId: string,
  dateStr: string,
): Promise<number> {
  const startMin = toMinutes(startTime);
  const closeMin = toMinutes(closeTime);

  // Find next booking after start time
  const bookings = await prisma.booking.findMany({
    where: {
      venueId,
      date: new Date(dateStr),
      status: { in: ["PENDING", "CONFIRMED"] },
    },
    select: { startTime: true },
    orderBy: { startTime: "asc" },
  });

  let nextBookingStart = closeMin;
  for (const b of bookings) {
    const bStart = toMinutes(b.startTime);
    if (bStart > startMin) {
      nextBookingStart = Math.min(nextBookingStart, bStart - 30); // 30min buffer
      break;
    }
  }

  const maxMinutes = Math.min(nextBookingStart, closeMin) - startMin;
  return Math.max(1, Math.floor(maxMinutes / 60));
}

async function notifyAdmin(
  bookingId: string,
  venueName: string,
  bd: StudioContext["session"]["bookingData"],
  client: StudioContext["client"],
  humanId: string,
): Promise<void> {
  // Find admins with telegramId
  const admins = await prisma.admin.findMany({
    where: { isActive: true, telegramId: { not: null } },
  });

  if (admins.length === 0) return;

  // Log the booking creation as an analytics event for admin dashboard
  await prisma.analyticsEvent.create({
    data: {
      type: "BOOKING_CREATED",
      clientId: client.id,
      venueId: bd.venueId,
      metadata: {
        bookingId,
        humanId,
        venueName,
        date: bd.date,
        startTime: bd.startTime,
        durationHours: bd.durationHours,
        clientName: `${client.firstName} ${client.lastName || ""}`.trim(),
        clientPhone: client.phone,
      },
    },
  });
}
