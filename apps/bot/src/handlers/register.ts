import { Bot, Keyboard } from "grammy";
import { prisma } from "@studio/database";
import type { StudioContext } from "../context";

/**
 * Registration handler for new users.
 * Requests phone via contact sharing, then optionally asks for birthday.
 */
export function registerRegister(bot: Bot<StudioContext>) {
  // Entry point: /register or triggered when phone is missing
  bot.command("register", async (ctx) => {
    await requestPhone(ctx);
  });

  // Also trigger when a user without phone tries to book
  bot.callbackQuery("request_register", async (ctx) => {
    await ctx.answerCallbackQuery();
    await requestPhone(ctx);
  });

  // Handle shared contact
  bot.on("message:contact", async (ctx) => {
    const contact = ctx.message.contact;

    // Verify the contact belongs to the sender
    if (contact.user_id !== ctx.from?.id) {
      await ctx.reply("Пожалуйста, отправьте свой контакт, а не чужой.");
      return;
    }

    const phone = contact.phone_number.startsWith("+")
      ? contact.phone_number
      : `+${contact.phone_number}`;

    // Update client with phone
    await prisma.client.update({
      where: { id: ctx.client.id },
      data: {
        phone,
        firstName: contact.first_name || ctx.client.firstName,
        lastName: contact.last_name || ctx.client.lastName,
      },
    });

    // Ask for birthday (optional)
    const keyboard = new Keyboard()
      .text("Пропустить")
      .resized()
      .oneTime();

    await ctx.reply(
      "Спасибо! 📱\n\n" +
        "Укажите дату рождения в формате ДД.ММ.ГГГГ\n" +
        "(мы начислим бонусы в ваш день рождения! 🎂)\n\n" +
        "Или нажмите «Пропустить».",
      { reply_markup: keyboard },
    );

    ctx.session.bookingStep = "register_birthday";
  });

  // Handle birthday input
  bot.hears(/^\d{2}\.\d{2}\.\d{4}$/, async (ctx) => {
    if (ctx.session.bookingStep !== "register_birthday") return;

    const parts = ctx.message.text.split(".");
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1;
    const year = parseInt(parts[2], 10);
    const birthday = new Date(year, month, day);

    // Basic validation
    if (
      isNaN(birthday.getTime()) ||
      birthday > new Date() ||
      birthday.getFullYear() < 1920
    ) {
      await ctx.reply("Некорректная дата. Попробуйте ещё раз (ДД.ММ.ГГГГ):");
      return;
    }

    await prisma.client.update({
      where: { id: ctx.client.id },
      data: { birthday },
    });

    ctx.session.bookingStep = null;
    await ctx.reply(
      "Отлично, дата рождения сохранена! 🎉\n" +
        "Теперь вы можете забронировать студию.",
      {
        reply_markup: { remove_keyboard: true },
      },
    );
  });

  // Handle "skip birthday"
  bot.hears("Пропустить", async (ctx) => {
    if (ctx.session.bookingStep !== "register_birthday") return;

    ctx.session.bookingStep = null;
    await ctx.reply("Хорошо, вы можете указать дату позже в настройках. ✨", {
      reply_markup: { remove_keyboard: true },
    });
  });
}

export async function requestPhone(ctx: StudioContext) {
  const keyboard = new Keyboard()
    .requestContact("📱 Отправить номер телефона")
    .resized()
    .oneTime();

  await ctx.reply(
    "Для бронирования нам нужен ваш номер телефона.\n" +
      "Нажмите кнопку ниже, чтобы поделиться контактом.",
    { reply_markup: keyboard },
  );
}
