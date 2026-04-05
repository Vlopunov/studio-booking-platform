import { prisma } from "@studio/database";
import type { Recommendation } from "@studio/types";
import { getDaysSince, countBy, maxByValue } from "@studio/utils";

export async function getPersonalRecommendation(
  clientId: string
): Promise<Recommendation | null> {
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    include: {
      bookings: {
        where: { status: "COMPLETED" },
        orderBy: { date: "desc" },
        take: 10,
        select: { venueId: true, startTime: true, venue: { select: { name: true } } },
      },
      preferredVenue: true,
    },
  });

  if (!client) return null;

  // 1. Если есть любимый слот и он свободен
  if (client.preferredVenueId && client.preferredTimeSlot) {
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);

    const available = await prisma.booking.findFirst({
      where: {
        venueId: client.preferredVenueId,
        date: { gte: new Date(), lte: nextWeek },
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
    });

    if (!available && client.preferredVenue) {
      return {
        type: "FAVORITE_SLOT",
        venueId: client.preferredVenueId,
        venueName: client.preferredVenue.name,
      };
    }
  }

  // 2. Скоро сгорают бонусы
  if (client.bonusBalance > 0) {
    // Simplified: assume bonuses expire in 14 days if no activity
    const daysSinceActivity = getDaysSince(client.lastActivityAt);
    if (daysSinceActivity > 150) {
      return { type: "EXPIRING_BONUS", amount: client.bonusBalance };
    }
  }

  // 3. Давно не был — comeback
  const daysSince = getDaysSince(client.lastActivityAt);
  if (daysSince > 30) {
    return { type: "COMEBACK", days: daysSince };
  }

  // 4. Cross-sell — предложить новую площадку
  if (client.bookings.length > 0) {
    const triedVenueIds = new Set(client.bookings.map((b) => b.venueId));
    const allVenues = await prisma.venue.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
    });
    const untried = allVenues.filter((v) => !triedVenueIds.has(v.id));
    if (untried.length > 0) {
      return {
        type: "CROSS_SELL",
        venueId: untried[0].id,
        venueName: untried[0].name,
      };
    }
  }

  return null;
}

export async function updateClientPreferences(clientId: string): Promise<void> {
  const bookings = await prisma.booking.findMany({
    where: { clientId, status: "COMPLETED" },
    orderBy: { date: "desc" },
    take: 10,
    select: { venueId: true, startTime: true },
  });

  if (bookings.length < 2) return;

  const venueFrequency = countBy(bookings, "venueId");
  const preferredVenueId = maxByValue(venueFrequency);

  const timeSlots = bookings.map((b) => {
    const hour = parseInt(b.startTime.split(":")[0]);
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  });
  const slotFrequency = countBy(timeSlots);
  const preferredTimeSlot = maxByValue(slotFrequency);

  await prisma.client.update({
    where: { id: clientId },
    data: { preferredVenueId, preferredTimeSlot },
  });
}
