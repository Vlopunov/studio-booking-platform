import { Bot, InlineKeyboard } from "grammy";
import { prisma } from "@studio/database";
import { formatPrice, formatDate } from "@studio/utils";
import { getVenueSocialProof, getPostBookingReinforcement } from "../services/social-proof";
import { updateClientPreferences } from "../services/recommendation";
import { generateCalendarKeyboard } from "../keyboards/calendar";
import { generateTimeSlotsKeyboard } from "../keyboards/time-slots";
import { generateAddonsKeyboard } from "../keyboards/addons";
import {
  createBooking,
  calculatePrice as calculateServicePrice,
  type PriceBreakdown,
} from "../services/booking.service";
import type { StudioContext } from "../context";

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

    // Show venue details
    const socialProof = await getVenueSocialProof(venueId);
    const description =
      `📸 <b>${venue.name}</b>\n\n` +
      (venue.description ? `${venue.description}\n\n` : "") +
      `💰 от ${formatPrice(Number(venue.pricePerHour))}/ч\n` +
      `⏱ ${venue.minHours}–${venue.maxHours} ч\n` +
      (venue.amenities.length > 0 ? `🏠 ${venue.amenities.join(", ")}\n` : "") +
      (socialProof ? `\n${socialProof}\n` : "");

    // FIX 6: Send venue photo on selection
    if (venue.photos.length > 0) {
      try {
        await ctx.replyWithPhoto(venue.photos[0], {
          caption: description,
          parse_mode: "HTML",
        });
      } catch {
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

    // FIX 2: Back button
    keyboard.row();
    keyboard.text("◀️ Назад к времени", "booking_back:time");

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

    if (promo.venueId && promo.venueId !== ctx.session.bookingData.venueId) {
      await ctx.reply("❌ Этот промокод не действует для выбранной площадки.");
      return;
    }

    if (promo.maxUses && promo.usedCount >= promo.maxUses) {
      await ctx.reply("❌ Промокод уже использован максимальное число раз.");
      return;
    }

    const usedBefore = await prisma.usedPromocode.findFirst({
      where: { clientId: ctx.client.id, promocodeId: promo.id },
    });
    if (usedBefore) {
      await ctx.reply("❌ Вы уже использовали этот промокод.");
      return;
    }

    if (promo.firstBookingOnly && ctx.client.totalBookings > 0) {
      await ctx.reply("❌ Этот промокод только для первого бронирования.");
      return;
    }

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

  // ─── FIX 1: Confirm booking — uses booking service ─────────
  bot.callbackQuery("book_confirm", async (ctx) => {
    const bd = ctx.session.bookingData;

    if (!bd.venueId || !bd.date || !bd.startTime || !bd.durationHours) {
      await ctx.answerCallbackQuery("Ошибка: данные бронирования неполные.");
      return;
    }

    // Build addon selections from session data
    const addonSelections: Array<{ addonId: string; quantity: number }> = [];
    if (bd.selectedAddons) {
      for (const [addonId, quantity] of Object.entries(bd.selectedAddons)) {
        if (quantity > 0) {
          addonSelections.push({ addonId, quantity });
        }
      }
    }

    try {
      // Call booking service — handles:
      // - humanId generation (B-YYMMDD-NNN)
      // - working hours validation
      // - 30-min buffer slot conflict check (in transaction)
      // - price calculation with pricing rules + loyalty discount from LoyaltySettings
      // - bonus deduction
      // - promocode usage recording
      // - booking creation with all proper fields
      // - analytics event recording
      // NOTE: Does NOT award bonuses — only sets bonusEarned estimate.
      // Actual bonus crediting happens in completeBooking() (admin action).
      const { booking, priceBreakdown } = await createBooking(ctx.client.id, {
        venueId: bd.venueId,
        date: new Date(bd.date),
        startTime: bd.startTime,
        durationHours: bd.durationHours,
        addonSelections: addonSelections.length > 0 ? addonSelections : undefined,
        promocodeCode: bd.promocode,
        bonusToSpend: bd.bonusToSpend,
        comment: bd.comment,
        giftCertId: bd.giftCertId,
      });

      // Update client preferences (non-blocking)
      updateClientPreferences(ctx.client.id).catch(() => {});

      // Post-booking reinforcement text
      const dayOfWeek = [
        "Воскресенье", "Понедельник", "Вторник", "Среда",
        "Четверг", "Пятница", "Суббота",
      ][new Date(bd.date).getDay()];
      const reinforcement = await getPostBookingReinforcement(bd.venueId, dayOfWeek);

      const venue = await prisma.venue.findUnique({ where: { id: bd.venueId } });
      const venueName = venue?.name || "Площадка";

      const confirmText =
        `✅ Бронирование создано!\n\n` +
        `📸 ${venueName}\n` +
        `📅 ${formatDate(new Date(bd.date))} · ${booking.startTime} – ${booking.endTime}\n` +
        `⏱ ${booking.durationHours} ч.\n` +
        `💰 ${formatPrice(Number(booking.finalPrice))}\n` +
        (priceBreakdown.bonusEarned > 0
          ? `⭐ Будет начислено ${priceBreakdown.bonusEarned} бонусов после визита\n`
          : "") +
        `🔖 #${booking.humanId}\n\n` +
        reinforcement;

      try {
        await ctx.editMessageText(confirmText, {
          reply_markup: new InlineKeyboard()
            .text("📋 Мои брони", "my_bookings")
            .row()
            .text("🏠 Главное меню", "main_menu"),
        });
      } catch {
        await ctx.reply(confirmText, {
          reply_markup: new InlineKeyboard()
            .text("📋 Мои брони", "my_bookings")
            .row()
            .text("🏠 Главное меню", "main_menu"),
        });
      }
      await ctx.answerCallbackQuery("Забронировано! ✅");

      // Reset session
      ctx.session.bookingStep = null;
      ctx.session.bookingData = {};
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Неизвестная ошибка";
      console.error("Booking creation failed:", error);

      try {
        await ctx.editMessageText(
          `❌ Не удалось создать бронирование:\n${message}\n\nПопробуйте выбрать другое время.`,
          {
            reply_markup: new InlineKeyboard()
              .text("◀️ Назад к времени", "booking_back:time")
              .row()
              .text("🏠 Главное меню", "main_menu"),
          },
        );
      } catch {
        await ctx.reply(
          `❌ Не удалось создать бронирование:\n${message}\n\nПопробуйте выбрать другое время.`,
          {
            reply_markup: new InlineKeyboard()
              .text("◀️ Назад к времени", "booking_back:time")
              .row()
              .text("🏠 Главное меню", "main_menu"),
          },
        );
      }
      await ctx.answerCallbackQuery("Ошибка бронирования");
    }
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

  // ─── FIX 2: Back navigation handlers ───────────────────────
  bot.callbackQuery(/^booking_back:(.+)$/, async (ctx) => {
    const step = ctx.match[1];
    await ctx.answerCallbackQuery();

    switch (step) {
      case "main": {
        // Back to main menu
        ctx.session.bookingStep = null;
        ctx.session.bookingData = {};
        // Import is dynamic to avoid circular dependency
        const { registerMainMenu } = await import("./main-menu");
        await registerMainMenu(ctx);
        break;
      }
      case "venue": {
        // Back to venue selection (from calendar)
        ctx.session.bookingStep = null;
        ctx.session.bookingData = {};
        await showVenueSelection(ctx);
        break;
      }
      case "date": {
        // Back to date selection (from time slots)
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
        // Back to time selection (from duration)
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
        // Back to duration selection (from addons)
        const bd3 = ctx.session.bookingData || {};
        if (!bd3.venueId || !bd3.date || !bd3.startTime) {
          await showVenueSelection(ctx);
          return;
        }
        ctx.session.bookingStep = "duration";
        ctx.session.bookingData.durationHours = undefined;
        ctx.session.bookingData.selectedAddons = {};

        // Re-show duration picker
        const durationVenue = await prisma.venue.findUnique({ where: { id: bd3.venueId } });
        if (!durationVenue) {
          await showVenueSelection(ctx);
          return;
        }

        const durationSchedule = await getScheduleForDate(bd3.venueId, bd3.date);
        const durationMaxAvail = durationSchedule
          ? await calculateMaxHours(bd3.startTime, durationSchedule.closeTime, bd3.venueId, bd3.date)
          : durationVenue.maxHours;

        const durationKb = new InlineKeyboard();
        const dMinH = durationVenue.minHours;
        const dMaxH = Math.min(durationVenue.maxHours, durationMaxAvail);

        for (let h = dMinH; h <= dMaxH; h++) {
          const hourLabel = h === 1 ? "час" : h < 5 ? "часа" : "часов";
          durationKb.text(`${h} ${hourLabel}`, `book_duration:${h}`);
          if (h % 3 === 0) durationKb.row();
        }
        durationKb.row();
        durationKb.text("◀️ Назад к времени", "booking_back:time");

        try {
          await ctx.editMessageText(
            `⏱ Выберите продолжительность:\n` +
              `Начало: ${bd3.startTime}\n` +
              `💰 ${formatPrice(Number(durationVenue.pricePerHour))}/ч`,
            { reply_markup: durationKb },
          );
        } catch {
          await ctx.reply(
            `⏱ Выберите продолжительность:\n` +
              `Начало: ${bd3.startTime}\n` +
              `💰 ${formatPrice(Number(durationVenue.pricePerHour))}/ч`,
            { reply_markup: durationKb },
          );
        }
        break;
      }
      case "addons": {
        // Back to addons (from confirmation)
        const bd2 = ctx.session.bookingData || {};
        if (!bd2.venueId) {
          await showVenueSelection(ctx);
          return;
        }
        ctx.session.bookingStep = "addons";
        const addonsKb = await generateAddonsKeyboard(
          bd2.venueId,
          bd2.selectedAddons || {},
        );
        try {
          await ctx.editMessageText("🛒 Выберите дополнительные услуги:", {
            reply_markup: addonsKb,
          });
        } catch {
          await ctx.reply("🛒 Выберите дополнительные услуги:", {
            reply_markup: addonsKb,
          });
        }
        break;
      }
      default: {
        await showVenueSelection(ctx);
      }
    }
  });

  // ─── Main menu callback ─────────────────────────────────────
  bot.callbackQuery("main_menu", async (ctx) => {
    await ctx.answerCallbackQuery();
    ctx.session.bookingStep = null;
    ctx.session.bookingData = {};
    const { registerMainMenu } = await import("./main-menu");
    await registerMainMenu(ctx);
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

  // FIX 2: Back button — main menu
  keyboard.text("🏠 Главное меню", "booking_back:main");

  await ctx.reply("Выберите площадку:", { reply_markup: keyboard });
}

// ─── Helper: Show price confirmation ────────────────────────────

async function showConfirmation(ctx: StudioContext) {
  const bd = ctx.session.bookingData;
  const venue = await prisma.venue.findUnique({ where: { id: bd.venueId! } });
  if (!venue) return;

  // Build addon selections
  const addonSelections: Array<{ addonId: string; quantity: number }> = [];
  if (bd.selectedAddons) {
    for (const [addonId, quantity] of Object.entries(bd.selectedAddons)) {
      if (quantity > 0) {
        addonSelections.push({ addonId, quantity });
      }
    }
  }

  // Use the proper service-level price calculation
  const priceBreakdown = await calculateServicePrice(
    bd.venueId!,
    new Date(bd.date!),
    bd.startTime!,
    bd.durationHours!,
    ctx.client.id,
    addonSelections.length > 0 ? addonSelections : undefined,
    bd.promocode,
    bd.bonusToSpend,
  );

  const endTime = calculateEndTime(bd.startTime!, bd.durationHours!);

  let text =
    `📋 <b>Подтвердите бронирование:</b>\n\n` +
    `📸 ${venue.name}\n` +
    `📅 ${formatDate(new Date(bd.date!))} · ${bd.startTime} – ${endTime}\n` +
    `⏱ ${bd.durationHours} ч.\n\n` +
    `<b>Стоимость:</b>\n` +
    `  Базовая: ${formatPrice(priceBreakdown.baseTotal)} (${formatPrice(priceBreakdown.baseRate)}/ч)\n`;

  // Pricing rules applied
  if (priceBreakdown.appliedRules.length > 0) {
    for (const rule of priceBreakdown.appliedRules) {
      text += `  ${rule.name}: x${rule.multiplier}\n`;
    }
  }

  // Addons
  if (priceBreakdown.addons.length > 0) {
    const addonsTotal = priceBreakdown.addons.reduce((s, a) => s + a.total, 0);
    text += `  Допуслуги: +${formatPrice(addonsTotal)}\n`;
    for (const addon of priceBreakdown.addons) {
      text += `    ${addon.name} x${addon.quantity}: ${formatPrice(addon.total)}\n`;
    }
  }

  // Loyalty discount
  if (priceBreakdown.loyaltyDiscount > 0) {
    text += `  Скидка лояльности: -${formatPrice(priceBreakdown.loyaltyDiscount)}\n`;
  }

  // Promocode discount
  if (priceBreakdown.promocodeDiscount > 0) {
    text += `  Промокод: -${formatPrice(priceBreakdown.promocodeDiscount)}\n`;
  }

  // Bonus
  if (priceBreakdown.bonusDiscount > 0) {
    text += `  Бонусы: -${formatPrice(priceBreakdown.bonusDiscount)}\n`;
  }

  text += `\n<b>Итого: ${formatPrice(priceBreakdown.finalPrice)}</b>\n`;

  if (priceBreakdown.bonusEarned > 0) {
    text += `⭐ Будет начислено ${priceBreakdown.bonusEarned} бонусов после визита\n`;
  }

  text += `\n⏳ Слот зарезервирован на 10 минут.`;

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
  keyboard.row();

  // FIX 2: Back button — back to addons
  keyboard.text("◀️ Назад к допуслугам", "booking_back:addons");

  try {
    await ctx.editMessageText(text, { reply_markup: keyboard, parse_mode: "HTML" });
  } catch {
    await ctx.reply(text, { reply_markup: keyboard, parse_mode: "HTML" });
  }
}

// ─── Utility functions ────────────────────────────────────────────

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
