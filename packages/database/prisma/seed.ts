import { PrismaClient } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function randomCode(len = 6): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: len }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

async function main() {
  console.log("🌱 Seeding database...\n");

  // ══════════ Admins ══════════
  const pw = await bcrypt.hash("admin123", 12);
  const admin = await prisma.admin.upsert({
    where: { email: "admin@studio.ru" },
    update: {},
    create: { email: "admin@studio.ru", passwordHash: pw, name: "Администратор", role: "SUPER_ADMIN" },
  });
  const manager = await prisma.admin.upsert({
    where: { email: "manager@studio.ru" },
    update: {},
    create: { email: "manager@studio.ru", passwordHash: pw, name: "Менеджер", role: "MANAGER" },
  });
  console.log("  ✅ Admins: admin@studio.ru, manager@studio.ru (п��роль: admin123)");

  // ══════════ Venues ══════════
  const photo = await prisma.venue.upsert({
    where: { slug: "photo-loft" },
    update: {},
    create: {
      name: 'Фотостудия "Лофт"', slug: "photo-loft", type: "PHOTO_STUDIO",
      description: "Просторная фотостудия с циклорамой и профессиональным светом Profoto. Высокие потолки, панорамные окна.",
      address: "г. Москва, ул. Творческая, 12, стр. 1", pricePerHour: 3000, minHours: 1, maxHours: 8,
      amenities: ["Циклорама", "Свет Profoto", "Гримёрка", "Wi-Fi", "Кофемашина"], sortOrder: 1,
    },
  });

  const event = await prisma.venue.upsert({
    where: { slug: "event-panorama" },
    update: {},
    create: {
      name: 'Ивент-зал "Панорама"', slug: "event-panorama", type: "EVENT_HALL",
      description: "Зал для мероприятий, корпоративов и праздников на 80 человек с панорамным видом.",
      address: "г. Москва, ул. Творческая, 12, стр. 2", pricePerHour: 5000, minHours: 2, maxHours: 12,
      capacity: 80, amenities: ["Сцена", "Звук", "Проектор", "Кухня", "Парковка", "DJ-пульт"], sortOrder: 2,
    },
  });
  console.log("  ✅ Venues:", photo.name, ",", event.name);

  // ══════════ Schedules ══════════
  const scheduleData = (venueId: string, weekday: string, weekend: string) => {
    const [wdOpen, wdClose] = weekday.split("-");
    const [weOpen, weClose] = weekend.split("-");
    return Array.from({ length: 7 }, (_, i) => ({
      venueId, dayOfWeek: i,
      openTime: i < 5 ? wdOpen : weOpen,
      closeTime: i < 5 ? wdClose : weClose,
      isActive: true,
    }));
  };

  for (const s of scheduleData(photo.id, "09:00-22:00", "10:00-22:00")) {
    await prisma.schedule.upsert({
      where: { venueId_dayOfWeek: { venueId: s.venueId, dayOfWeek: s.dayOfWeek } },
      update: s, create: s,
    });
  }
  for (const s of scheduleData(event.id, "10:00-23:00", "10:00-23:00")) {
    await prisma.schedule.upsert({
      where: { venueId_dayOfWeek: { venueId: s.venueId, dayOfWeek: s.dayOfWeek } },
      update: s, create: s,
    });
  }
  console.log("  ✅ Schedules: 14 entries");

  // ══════════ Pricing Rules ══════════
  const rules = [
    { venueId: photo.id, name: "Наценка выходного", type: "WEEKEND" as const, multiplier: 1.5, dayOfWeek: 5, priority: 1 },
    { venueId: photo.id, name: "Наценка выходного (Вс)", type: "WEEKEND" as const, multiplier: 1.5, dayOfWeek: 6, priority: 1 },
    { venueId: photo.id, name: "Вечернее время", type: "TIME_RANGE" as const, multiplier: 1.2, startTime: "18:00", endTime: "22:00", priority: 2 },
    { venueId: photo.id, name: "Скидка за длинную бронь (4+ч)", type: "LONG_BOOKING" as const, multiplier: 0.9, minHours: 4, priority: 3 },
    { venueId: event.id, name: "Наценка выходного", type: "WEEKEND" as const, multiplier: 1.4, dayOfWeek: 5, priority: 1 },
    { venueId: event.id, name: "Наценка выходного (Вс)", type: "WEEKEND" as const, multiplier: 1.4, dayOfWeek: 6, priority: 1 },
    { venueId: event.id, name: "Скидка от 5 часов", type: "LONG_BOOKING" as const, multiplier: 0.85, minHours: 5, priority: 3 },
  ];
  for (const rule of rules) {
    const existing = await prisma.pricingRule.findFirst({ where: { venueId: rule.venueId, name: rule.name } });
    if (!existing) await prisma.pricingRule.create({ data: rule });
  }
  console.log("  ✅ Pricing rules:", rules.length);

  // ══════════ Addons ══════════
  const addons = [
    { venueId: photo.id, name: "Ассистент на съёмке", price: 1500, priceType: "PER_HOUR" as const, maxQuantity: 1 },
    { venueId: photo.id, name: "Стойка для фона", price: 500, priceType: "FLAT" as const, maxQuantity: 3 },
    { venueId: photo.id, name: "Генератор тумана", price: 800, priceType: "FLAT" as const, maxQuantity: 1 },
    { venueId: null, name: "Дополнительная уборка", price: 2000, priceType: "FLAT" as const, maxQuantity: 1 },
    { venueId: event.id, name: "DJ-оборудование", price: 3000, priceType: "FLAT" as const, maxQuantity: 1 },
    { venueId: event.id, name: "Кейтеринг (на чел.)", price: 1200, priceType: "FLAT" as const, maxQuantity: 80 },
  ];
  for (const addon of addons) {
    const existing = await prisma.addon.findFirst({ where: { name: addon.name, venueId: addon.venueId } });
    if (!existing) await prisma.addon.create({ data: addon });
  }
  console.log("  ✅ Addons:", addons.length);

  // ══════════ Promocodes ══════════
  const now = new Date();
  const sixMonths = new Date(Date.now() + 180 * 86400000);
  const promos = [
    { code: "WELCOME10", type: "PERCENT" as const, value: 10, maxUses: 100, firstBookingOnly: true, validFrom: now, validUntil: sixMonths },
    { code: "FRIEND10", type: "PERCENT" as const, value: 10, maxUses: 500, validFrom: now, validUntil: sixMonths },
    { code: "FLASH30", type: "PERCENT" as const, value: 30, maxUses: 50, maxDiscount: 5000, venueId: photo.id, validFrom: now, validUntil: sixMonths },
    { code: "BONUS500", type: "BONUS_POINTS" as const, value: 500, maxUses: 200, validFrom: now, validUntil: sixMonths },
    { code: "FIXED2000", type: "FIXED" as const, value: 2000, minOrderAmount: 10000, maxUses: 100, validFrom: now, validUntil: sixMonths },
  ];
  for (const p of promos) {
    await prisma.promocode.upsert({ where: { code: p.code }, update: {}, create: p });
  }
  console.log("  ✅ Promocodes:", promos.length);

  // ══════════ Test Clients ══════════
  const clients = [
    { telegramId: 100001n, firstName: "Иван", lastName: "Петров", telegramUsername: "ivan_p", phone: "+79001111111", loyaltyTier: "GOLD" as const, totalBookings: 12, totalSpent: 95000, bonusBalance: 2500, referralCode: randomCode() },
    { telegramId: 100002n, firstName: "Мария", lastName: "Иванова", telegramUsername: "maria_i", phone: "+79002222222", loyaltyTier: "SILVER" as const, totalBookings: 7, totalSpent: 48000, bonusBalance: 1200, referralCode: randomCode() },
    { telegramId: 100003n, firstName: "Алексей", lastName: "Смирнов", telegramUsername: "alex_s", phone: "+79003333333", loyaltyTier: "PLATINUM" as const, totalBookings: 25, totalSpent: 220000, bonusBalance: 8500, referralCode: randomCode() },
    { telegramId: 100004n, firstName: "Елена", lastName: "Козлова", phone: "+79004444444", loyaltyTier: "BRONZE" as const, totalBookings: 2, totalSpent: 12000, bonusBalance: 300, referralCode: randomCode(), birthday: new Date("1995-06-15") },
    { telegramId: 100005n, firstName: "Дмитрий", lastName: "Волков", telegramUsername: "dmitry_v", phone: "+79005555555", loyaltyTier: "BRONZE" as const, totalBookings: 0, totalSpent: 0, bonusBalance: 0, referralCode: randomCode(), source: "instagram" },
  ];

  for (const c of clients) {
    await prisma.client.upsert({ where: { telegramId: c.telegramId }, update: {}, create: c });
  }
  // Set referral: Client 5 referred by Client 1
  const c1 = await prisma.client.findUnique({ where: { telegramId: 100001n } });
  const c5 = await prisma.client.findUnique({ where: { telegramId: 100005n } });
  if (c1 && c5) {
    await prisma.client.update({ where: { id: c5.id }, data: { referredById: c1.id } });
  }
  console.log("  ✅ Clients:", clients.length);

  // ══════════ Test Bookings ══════════
  const c1Data = await prisma.client.findUnique({ where: { telegramId: 100001n } });
  const c2Data = await prisma.client.findUnique({ where: { telegramId: 100002n } });
  if (c1Data && c2Data) {
    const bookings = [
      { humanId: "B-260401-001", clientId: c1Data.id, venueId: photo.id, date: new Date("2026-04-01"), startTime: "14:00", endTime: "17:00", durationHours: 3, basePrice: 9000, finalPrice: 13500, status: "COMPLETED" as const, completedAt: new Date("2026-04-01T17:00:00") },
      { humanId: "B-260403-001", clientId: c2Data.id, venueId: event.id, date: new Date("2026-04-03"), startTime: "18:00", endTime: "23:00", durationHours: 5, basePrice: 25000, finalPrice: 23750, status: "COMPLETED" as const, completedAt: new Date("2026-04-03T23:00:00") },
      { humanId: "B-260407-001", clientId: c1Data.id, venueId: photo.id, date: new Date("2026-04-07"), startTime: "10:00", endTime: "13:00", durationHours: 3, basePrice: 9000, finalPrice: 9000, status: "CONFIRMED" as const, confirmedAt: new Date() },
      { humanId: "B-260410-001", clientId: c2Data.id, venueId: photo.id, date: new Date("2026-04-10"), startTime: "15:00", endTime: "18:00", durationHours: 3, basePrice: 9000, finalPrice: 8550, status: "PENDING" as const },
    ];
    for (const b of bookings) {
      const existing = await prisma.booking.findUnique({ where: { humanId: b.humanId } });
      if (!existing) await prisma.booking.create({ data: b });
    }
    console.log("  ✅ Bookings:", bookings.length);

    // Reviews
    const completedBooking = await prisma.booking.findUnique({ where: { humanId: "B-260401-001" } });
    if (completedBooking) {
      const existingReview = await prisma.review.findUnique({ where: { bookingId: completedBooking.id } });
      if (!existingReview) {
        await prisma.review.create({
          data: { bookingId: completedBooking.id, clientId: c1Data.id, rating: 5, comment: "Невероятная студия! Свет просто потрясающий.", isPublic: true },
        });
        console.log("  ✅ Reviews: 1");
      }
    }
  }

  // ══════════ Auto Messages ══════════
  const autoMessages = [
    { name: "Брошенная бронь", trigger: "BOOKING_ABANDONED" as const, delayMinutes: 30, messageText: "Мы заметили, что вы начали бронирование, но не завершили 🤔\n\nСлот всё ещё свободен!\n\n💡 Нужна помощь? Напишите нам!", buttonText: "📸 Продолжить", buttonAction: "book", maxSendsPerClient: 1, cooldownDays: 1 },
    { name: "После первой брони", trigger: "FIRST_BOOKING_COMPLETED" as const, delayMinutes: 120, messageText: "Спасибо за первый визит, {firstName}! ❤️\n\n🎁 Дарим 200 бонусов!\n👥 Приведите друга — оба получите по 500 бонусов.", buttonText: "👥 Пригласить", buttonAction: "referral", maxSendsPerClient: 1, cooldownDays: 0 },
    { name: "Скучаем (30 дней)", trigger: "INACTIVE_30_DAYS" as const, delayMinutes: 0, messageText: "Давно не виделись, {firstName}! 🤗\nДарим бонусы на следующее бронирование!\n💰 Баланс: {bonusBalance}", buttonText: "📸 Забронировать", buttonAction: "book", maxSendsPerClient: 1, cooldownDays: 30 },
    { name: "Отзыв", trigger: "REVIEW_POSITIVE" as const, delayMinutes: 60, messageText: "Рады, что понравилось! 🙏\nПоделитесь с друзьями?\n🎁 500 бонусов за каждого друга!", buttonText: "📤 Поделиться", buttonAction: "referral", maxSendsPerClient: 1, cooldownDays: 14 },
    { name: "Юбилейная бронь", trigger: "BOOKING_MILESTONE" as const, delayMinutes: 0, messageText: "🎉 Это ваше {milestoneNumber}-е бронирование!\nДарим {milestoneBonus} бонусов!", buttonText: "⭐ Лояльность", buttonAction: "loyalty", maxSendsPerClient: 10, cooldownDays: 0 },
    { name: "День рождения", trigger: "BIRTHDAY_3_DAYS_BEFORE" as const, delayMinutes: 0, messageText: "🎂 {firstName}, скоро ваш день рождения!\nДарим скидку 20%!\nПромокод: BIRTHDAY20", buttonText: "📸 Забронировать", buttonAction: "book", maxSendsPerClient: 1, cooldownDays: 365 },
    { name: "Бонусы сгорают", trigger: "BONUS_EXPIRY_7_DAYS" as const, delayMinutes: 0, messageText: "⚠️ {firstName}, {bonusBalance} бонусов сгорят через 7 дней!", buttonText: "📸 Забронировать", buttonAction: "book", maxSendsPerClient: 1, cooldownDays: 30 },
  ];
  for (const msg of autoMessages) {
    const existing = await prisma.autoMessage.findFirst({ where: { trigger: msg.trigger, name: msg.name } });
    if (!existing) await prisma.autoMessage.create({ data: msg });
  }
  console.log("  ✅ Auto Messages:", autoMessages.length);

  // ══════════ Loyalty Settings ══════════
  const settings: Record<string, string> = {
    bonus_earn_rate: "5", bonus_spend_rate: "1", max_bonus_spend_percent: "50",
    referral_bonus: "500", referral_friend_bonus: "500",
    silver_threshold_bookings: "5", silver_threshold_spent: "30000", silver_discount_percent: "5",
    gold_threshold_bookings: "15", gold_threshold_spent: "100000", gold_discount_percent: "10",
    platinum_threshold_bookings: "30", platinum_threshold_spent: "250000", platinum_discount_percent: "15",
    review_bonus_amount: "100", bonus_expiry_days: "180",
    win_back_days: "60", win_back_bonus: "300", birthday_bonus: "500",
    cancellation_penalty_hours: "24",
    silver_upgrade_bonus: "200", gold_upgrade_bonus: "500", platinum_upgrade_bonus: "1000",
    gift_certificate_enabled: "true", gift_certificate_expiry_days: "180",
    abandoned_booking_delay_minutes: "30", campaign_cooldown_days: "3",
    quiet_hours_start: "21:00", quiet_hours_end: "10:00",
    milestone_5_bonus: "500", milestone_10_bonus: "1000", milestone_20_bonus: "2000", milestone_50_bonus: "5000",
    first_booking_bonus: "200", cross_sell_discount_percent: "15",
  };
  for (const [key, value] of Object.entries(settings)) {
    const existing = await prisma.loyaltySettings.findFirst({ where: { key } });
    if (existing) {
      await prisma.loyaltySettings.update({ where: { id: existing.id }, data: { value } });
    } else {
      await prisma.loyaltySettings.create({ data: { key, value } });
    }
  }
  console.log("  ✅ Loyalty Settings:", Object.keys(settings).length);

  // ══════════ Gift Certificates ══════════
  const sixMonthsFromNow = new Date(Date.now() + 180 * 86400000);
  const certs = [
    { code: "GIFT-TEST-0001", type: "HOURS" as const, value: 3, expiresAt: sixMonthsFromNow },
    { code: "GIFT-TEST-0002", type: "AMOUNT" as const, value: 5000, expiresAt: sixMonthsFromNow },
  ];
  for (const cert of certs) {
    const existing = await prisma.giftCertificate.findUnique({ where: { code: cert.code } });
    if (!existing) await prisma.giftCertificate.create({ data: cert });
  }
  console.log("  ✅ Gift Certificates:", certs.length);

  // ══════════ Analytics Events ══════════
  const events = [
    { type: "bot.start", clientId: c1Data?.id },
    { type: "booking.started", clientId: c1Data?.id, venueId: photo.id },
    { type: "booking.completed", clientId: c1Data?.id, venueId: photo.id },
    { type: "bot.start", clientId: c2Data?.id },
    { type: "booking.started", clientId: c2Data?.id, venueId: event.id },
    { type: "booking.venue_selected", clientId: c2Data?.id, venueId: event.id },
    { type: "booking.date_selected", clientId: c2Data?.id, venueId: event.id },
    { type: "booking.completed", clientId: c2Data?.id, venueId: event.id },
  ];
  for (const e of events) {
    await prisma.analyticsEvent.create({ data: e });
  }
  console.log("  ✅ Analytics Events:", events.length);

  console.log("\n✅ Seed completed!");
  console.log("   Login: admin@studio.ru / admin123");
  console.log("   Login: manager@studio.ru / admin123");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
