import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const dashboardRouter = Router();

// GET /api/dashboard/stats?period=week|month
dashboardRouter.get("/stats", async (req: AuthRequest, res: Response) => {
  try {
    const period = (req.query.period as string) || "week";
    const days = period === "month" ? 30 : 7;
    const since = new Date();
    since.setDate(since.getDate() - days);
    since.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [todayBookings, periodBookings, venues, completedBookings] =
      await Promise.all([
        prisma.booking.count({
          where: { date: { gte: today, lt: tomorrow } },
        }),
        prisma.booking.findMany({
          where: { createdAt: { gte: since } },
          select: { status: true, finalPrice: true },
        }),
        prisma.venue.count({ where: { isActive: true } }),
        prisma.booking.aggregate({
          where: {
            status: "COMPLETED",
            createdAt: { gte: since },
          },
          _sum: { finalPrice: true },
          _count: true,
        }),
      ]);

    // Venue utilization: booked hours vs total available hours
    const bookedVenueSlots = await prisma.booking.groupBy({
      by: ["venueId"],
      where: {
        date: { gte: since },
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
      _sum: { durationHours: true },
    });

    const totalBookedHours = bookedVenueSlots.reduce(
      (acc, v) => acc + (v._sum.durationHours || 0),
      0
    );
    // Assume ~12 working hours per venue per day
    const totalAvailableHours = venues * days * 12;
    const utilization =
      totalAvailableHours > 0
        ? Math.round((totalBookedHours / totalAvailableHours) * 10000) / 100
        : 0;

    const revenue = Number(completedBookings._sum.finalPrice || 0);

    const totalCreated = periodBookings.length;
    const totalCompleted = periodBookings.filter(
      (b) => b.status === "COMPLETED"
    ).length;
    const conversionRate =
      totalCreated > 0
        ? Math.round((totalCompleted / totalCreated) * 10000) / 100
        : 0;

    res.json({
      todayBookings,
      utilization,
      revenue,
      conversionRate,
      period,
    });
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// GET /api/dashboard/funnel?days=7
dashboardRouter.get("/funnel", async (req: AuthRequest, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const funnelSteps = [
      "booking_started",
      "venue_selected",
      "date_selected",
      "booking_completed",
    ];

    const counts = await Promise.all(
      funnelSteps.map((step) =>
        prisma.analyticsEvent.count({
          where: {
            type: step,
            createdAt: { gte: since },
          },
        })
      )
    );

    const funnel = funnelSteps.map((step, i) => ({
      step,
      count: counts[i],
      dropoff:
        i > 0 && counts[i - 1] > 0
          ? Math.round((1 - counts[i] / counts[i - 1]) * 10000) / 100
          : 0,
    }));

    res.json(funnel);
  } catch (err) {
    console.error("Dashboard funnel error:", err);
    res.status(500).json({ error: "Failed to fetch funnel data" });
  }
});

// GET /api/dashboard/heatmap?venue_id=
dashboardRouter.get("/heatmap", async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.query.venue_id as string;
    if (!venueId) {
      res.status(400).json({ error: "venue_id is required" });
      return;
    }

    const bookings = await prisma.booking.findMany({
      where: {
        venueId,
        status: { in: ["CONFIRMED", "COMPLETED"] },
      },
      select: { date: true, startTime: true },
    });

    // Build heatmap: [dayOfWeek][hour] = count
    const heatmap: Record<number, Record<number, number>> = {};
    for (let d = 0; d < 7; d++) {
      heatmap[d] = {};
      for (let h = 0; h < 24; h++) {
        heatmap[d][h] = 0;
      }
    }

    for (const b of bookings) {
      const date = new Date(b.date);
      // JS getDay: 0=Sun, convert to 0=Mon
      const jsDay = date.getDay();
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;
      const hour = parseInt(b.startTime.split(":")[0], 10);
      heatmap[dayOfWeek][hour]++;
    }

    res.json(heatmap);
  } catch (err) {
    console.error("Dashboard heatmap error:", err);
    res.status(500).json({ error: "Failed to fetch heatmap data" });
  }
});

// GET /api/dashboard/upcoming
dashboardRouter.get("/upcoming", async (_req: AuthRequest, res: Response) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dayAfterTomorrow = new Date(today);
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

    const bookings = await prisma.booking.findMany({
      where: {
        date: { gte: today, lt: dayAfterTomorrow },
        status: { in: ["PENDING", "CONFIRMED"] },
      },
      include: {
        client: {
          select: { firstName: true, lastName: true, phone: true },
        },
        venue: { select: { name: true } },
      },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });

    res.json(bookings);
  } catch (err) {
    console.error("Dashboard upcoming error:", err);
    res.status(500).json({ error: "Failed to fetch upcoming bookings" });
  }
});
