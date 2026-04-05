import { Router } from "express";
import { prisma } from "@studio/database";

export const analyticsRouter = Router();

// GET /api/analytics/sources
analyticsRouter.get("/sources", async (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 90;
    const since = new Date(Date.now() - period * 86400000);

    const sources = await prisma.utmSource.groupBy({
      by: ["source", "medium"],
      where: { createdAt: { gte: since } },
      _count: true,
    });

    const enriched = await Promise.all(
      sources.map(async (s) => {
        const clients = await prisma.utmSource.findMany({
          where: { source: s.source, medium: s.medium, createdAt: { gte: since } },
          select: { clientId: true },
          distinct: ["clientId"],
        });

        const clientIds = clients.map((c) => c.clientId);

        const bookings = await prisma.booking.aggregate({
          where: {
            clientId: { in: clientIds },
            status: "COMPLETED",
          },
          _count: true,
          _sum: { finalPrice: true },
        });

        const totalRevenue = Number(bookings._sum.finalPrice || 0);
        const totalClients = clientIds.length;
        const totalBookings = bookings._count;

        return {
          source: s.source,
          medium: s.medium,
          clients: totalClients,
          bookings: totalBookings,
          conversionRate: totalClients > 0 ? (totalBookings / totalClients) * 100 : 0,
          avgCheck: totalBookings > 0 ? totalRevenue / totalBookings : 0,
          ltv: totalClients > 0 ? totalRevenue / totalClients : 0,
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch source stats" });
  }
});

// GET /api/analytics/utm
analyticsRouter.get("/utm", async (req, res) => {
  try {
    const { source, medium } = req.query;
    const period = parseInt(req.query.period as string) || 90;
    const since = new Date(Date.now() - period * 86400000);

    const where: any = { createdAt: { gte: since } };
    if (source) where.source = source;
    if (medium) where.medium = medium;

    const data = await prisma.utmSource.groupBy({
      by: ["source", "medium", "campaign", "content"],
      where,
      _count: true,
      orderBy: { _count: { _all: "desc" } },
    });

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch UTM data" });
  }
});

// GET /api/analytics/rfm
analyticsRouter.get("/rfm", async (_req, res) => {
  try {
    const segments = await prisma.client.groupBy({
      by: ["rfmSegment"],
      where: { rfmSegment: { not: null } },
      _count: true,
      _avg: { rfmRecency: true, rfmFrequency: true },
    });

    const total = await prisma.client.count({ where: { rfmSegment: { not: null } } });

    const result = segments.map((s) => ({
      segment: s.rfmSegment,
      count: s._count,
      percentage: total > 0 ? (s._count / total) * 100 : 0,
      avgRecency: Math.round(s._avg.rfmRecency || 0),
      avgFrequency: Math.round(s._avg.rfmFrequency || 0),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch RFM data" });
  }
});

// GET /api/analytics/cohort-retention
analyticsRouter.get("/cohort-retention", async (req, res) => {
  try {
    const months = parseInt(req.query.months as string) || 6;
    const cohorts: any[] = [];

    for (let i = months - 1; i >= 0; i--) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - i, 1);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      // Clients registered in this cohort month
      const cohortClients = await prisma.client.findMany({
        where: {
          createdAt: { gte: startDate, lt: endDate },
        },
        select: { id: true },
      });

      const clientIds = cohortClients.map((c) => c.id);
      const cohortSize = clientIds.length;

      if (cohortSize === 0) {
        cohorts.push({
          cohort: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
          months: Array(months - i).fill(null),
        });
        continue;
      }

      const retention: (number | null)[] = [];

      for (let m = 0; m <= months - i - 1; m++) {
        const periodStart = new Date(startDate);
        periodStart.setMonth(periodStart.getMonth() + m);
        const periodEnd = new Date(periodStart);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const activeInPeriod = await prisma.booking.findMany({
          where: {
            clientId: { in: clientIds },
            createdAt: { gte: periodStart, lt: periodEnd },
            status: { in: ["CONFIRMED", "COMPLETED"] },
          },
          select: { clientId: true },
          distinct: ["clientId"],
        });

        retention.push(
          Math.round((activeInPeriod.length / cohortSize) * 100)
        );
      }

      cohorts.push({
        cohort: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
        months: retention,
      });
    }

    res.json(cohorts);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch cohort retention" });
  }
});

// GET /api/analytics/ltv
analyticsRouter.get("/ltv", async (req, res) => {
  try {
    const period = parseInt(req.query.period as string) || 6;
    const results: any[] = [];

    for (let i = period - 1; i >= 0; i--) {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - i, 1);
      startDate.setHours(0, 0, 0, 0);

      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + 1);

      const cohortClients = await prisma.client.findMany({
        where: { createdAt: { gte: startDate, lt: endDate } },
        select: { id: true },
      });

      const clientIds = cohortClients.map((c) => c.id);

      if (clientIds.length === 0) {
        results.push({
          cohort: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
          ltv: 0,
          clients: 0,
        });
        continue;
      }

      const revenue = await prisma.booking.aggregate({
        where: { clientId: { in: clientIds }, status: "COMPLETED" },
        _sum: { finalPrice: true },
      });

      results.push({
        cohort: `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, "0")}`,
        ltv: Math.round(Number(revenue._sum.finalPrice || 0) / clientIds.length),
        clients: clientIds.length,
      });
    }

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch LTV data" });
  }
});

// GET /api/analytics/referral-stats
analyticsRouter.get("/referral-stats", async (_req, res) => {
  try {
    const referrers = await prisma.client.findMany({
      where: { referrals: { some: {} } },
      select: {
        id: true,
        firstName: true,
        referralCode: true,
        _count: { select: { referrals: true } },
      },
      orderBy: { referrals: { _count: "desc" } },
      take: 20,
    });

    const totalReferrals = await prisma.client.count({
      where: { referredById: { not: null } },
    });

    const totalReferrers = await prisma.client.count({
      where: { referrals: { some: {} } },
    });

    const viralCoefficient =
      totalReferrers > 0 ? totalReferrals / totalReferrers : 0;

    res.json({
      viralCoefficient: Math.round(viralCoefficient * 100) / 100,
      totalReferrals,
      totalReferrers,
      topReferrers: referrers.map((r) => ({
        id: r.id,
        name: r.firstName,
        code: r.referralCode,
        referrals: r._count.referrals,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch referral stats" });
  }
});

// GET /api/analytics/campaign-roi
analyticsRouter.get("/campaign-roi", async (_req, res) => {
  try {
    const campaigns = await prisma.campaign.findMany({
      where: { status: "COMPLETED" },
      orderBy: { completedAt: "desc" },
      take: 20,
    });

    const results = await Promise.all(
      campaigns.map(async (c) => {
        const revenue = await prisma.booking.aggregate({
          where: { campaignId: c.id, status: "COMPLETED" },
          _sum: { finalPrice: true },
        });

        return {
          id: c.id,
          name: c.name,
          sent: c.totalSent,
          converted: c.totalConverted,
          revenue: Number(revenue._sum.finalPrice || 0),
          conversionRate:
            c.totalSent > 0 ? (c.totalConverted / c.totalSent) * 100 : 0,
        };
      })
    );

    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign ROI" });
  }
});
