import { prisma } from "@studio/database";
import { formatPrice } from "@studio/utils";

export async function getVenueSocialProof(venueId: string): Promise<string> {
  const sevenDaysAgo = new Date(Date.now() - 7 * 86400000);

  const [weeklyBookings, reviews, avgRating] = await Promise.all([
    prisma.booking.count({
      where: {
        venueId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
        createdAt: { gte: sevenDaysAgo },
      },
    }),
    prisma.review.count({
      where: { booking: { venueId } },
    }),
    prisma.review.aggregate({
      where: { booking: { venueId } },
      _avg: { rating: true },
    }),
  ]);

  const lines: string[] = [];

  if (avgRating._avg.rating) {
    const stars = "⭐".repeat(Math.round(avgRating._avg.rating));
    lines.push(`${stars} ${avgRating._avg.rating.toFixed(1)} (${reviews} отзывов)`);
  }

  if (weeklyBookings > 0) {
    lines.push(`🔥 Забронировано ${weeklyBookings} раз за последнюю неделю`);
  }

  return lines.join("\n");
}

export async function getDateUrgency(
  venueId: string,
  date: Date
): Promise<string | null> {
  const nextDay = new Date(date);
  nextDay.setDate(nextDay.getDate() + 1);

  const booked = await prisma.booking.count({
    where: {
      venueId,
      date: { gte: date, lt: nextDay },
      status: { in: ["PENDING", "CONFIRMED"] },
    },
  });

  // Assume 6 max slots per day
  const MAX_SLOTS = 6;
  const remaining = MAX_SLOTS - booked;

  if (remaining <= 0) return "❌ Все слоты заняты";
  if (remaining <= 2) return `⚡ Осталось ${remaining} свободных окна из ${MAX_SLOTS}`;
  return null;
}

export async function getPostBookingReinforcement(
  venueId: string,
  dayOfWeek: string
): Promise<string> {
  return `✅ Отличный выбор! ${dayOfWeek} — самый популярный день для съёмок ⭐`;
}
