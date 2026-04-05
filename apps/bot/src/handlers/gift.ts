import { Bot } from "grammy";
import { prisma } from "@studio/database";
import { generateGiftCode, formatPrice } from "@studio/utils";
import type { StudioContext } from "../context";

export function registerGift(bot: Bot<StudioContext>) {
  bot.hears("🎁 Подарочные сертификаты", async (ctx) => {
    await ctx.reply(
      "🎁 Подарочные сертификаты\n\n" +
        "Подарите близким незабываемую фотосессию или вечеринку!\n\n" +
        "Выберите тип:",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📸 Фотостудия — 3 часа | 6 900₽", callback_data: "gift:HOURS:3:6900" }],
            [{ text: "📸 Фотостудия — 5 часов | 10 500₽", callback_data: "gift:HOURS:5:10500" }],
            [{ text: "🎉 Ивент-зал — 3 часа | 12 000₽", callback_data: "gift:HOURS:3:12000" }],
            [{ text: "💰 Сертификат на сумму", callback_data: "gift:AMOUNT:custom:0" }],
          ],
        },
      }
    );
  });

  bot.command("gift", async (ctx) => {
    // Same as above
    await ctx.reply(
      "🎁 Подарочные сертификаты\n\nВыберите тип:",
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📸 Фотостудия — 3 часа | 6 900₽", callback_data: "gift:HOURS:3:6900" }],
            [{ text: "📸 Фотостудия — 5 часов | 10 500₽", callback_data: "gift:HOURS:5:10500" }],
            [{ text: "🎉 Ивент-зал — 3 часа | 12 000₽", callback_data: "gift:HOURS:3:12000" }],
            [{ text: "💰 Сертификат на сумму", callback_data: "gift:AMOUNT:custom:0" }],
          ],
        },
      }
    );
  });

  bot.callbackQuery(/^gift:(\w+):(\w+):(\d+)$/, async (ctx) => {
    const type = ctx.match[1] as "AMOUNT" | "HOURS";
    const value = ctx.match[2] === "custom" ? 0 : parseInt(ctx.match[2]);
    const price = parseInt(ctx.match[3]);

    if (type === "AMOUNT" && value === 0) {
      await ctx.editMessageText(
        "💰 Введите сумму сертификата (от 3 000₽):",
        {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "3 000₽", callback_data: "gift_amount:3000" },
                { text: "5 000₽", callback_data: "gift_amount:5000" },
              ],
              [
                { text: "7 000₽", callback_data: "gift_amount:7000" },
                { text: "10 000₽", callback_data: "gift_amount:10000" },
              ],
            ],
          },
        }
      );
      await ctx.answerCallbackQuery();
      return;
    }

    // Create certificate
    const code = generateGiftCode();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    const cert = await prisma.giftCertificate.create({
      data: {
        code,
        type,
        value: value || price,
        purchasedById: ctx.client.id,
        expiresAt,
      },
    });

    await ctx.editMessageText(
      `🎁 Сертификат создан!\n\n` +
        `Код: ${cert.code}\n` +
        `Номинал: ${type === "HOURS" ? `${value} часа` : formatPrice(price)}\n` +
        `Действует до: ${expiresAt.toLocaleDateString("ru-RU")}\n\n` +
        `📨 Отправьте этот код получателю.\n` +
        `Они активируют его через команду /gift в боте.\n\n` +
        `Хотите добавить личное сообщение?`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 Добавить сообщение", callback_data: `gift_msg:${cert.id}` }],
            [{ text: "✅ Готово", callback_data: "main_menu" }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery(/^gift_amount:(\d+)$/, async (ctx) => {
    const amount = parseInt(ctx.match[1]);
    const code = generateGiftCode();
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    const cert = await prisma.giftCertificate.create({
      data: {
        code,
        type: "AMOUNT",
        value: amount,
        purchasedById: ctx.client.id,
        expiresAt,
      },
    });

    await ctx.editMessageText(
      `🎁 Сертификат создан!\n\n` +
        `Код: ${cert.code}\n` +
        `Номинал: ${formatPrice(amount)}\n` +
        `Действует до: ${expiresAt.toLocaleDateString("ru-RU")}\n\n` +
        `📨 Отправьте этот код получателю.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 Добавить сообщение", callback_data: `gift_msg:${cert.id}` }],
            [{ text: "✅ Готово", callback_data: "main_menu" }],
          ],
        },
      }
    );
    await ctx.answerCallbackQuery();
  });

  // Redeem gift certificate
  bot.callbackQuery(/^redeem_gift:(.+)$/, async (ctx) => {
    const certId = ctx.match[1];
    const cert = await prisma.giftCertificate.findUnique({
      where: { id: certId },
    });

    if (!cert || !cert.isActive || cert.redeemedById || cert.expiresAt < new Date()) {
      await ctx.answerCallbackQuery("Сертификат недоступен");
      return;
    }

    await prisma.giftCertificate.update({
      where: { id: certId },
      data: {
        redeemedById: ctx.client.id,
        redeemedAt: new Date(),
      },
    });

    await ctx.editMessageText(
      `✅ Сертификат активирован!\n\n` +
        `Используйте его при следующем бронировании.`
    );
    await ctx.answerCallbackQuery("Сертификат активирован! ✅");
  });
}
