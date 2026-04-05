import { Router } from "express";
import { prisma } from "@studio/database";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth";
import { getCampaignSender } from "../jobs";

export const campaignRouter = Router();

const campaignSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["BROADCAST", "AUTOMATED", "SCHEDULED"]),
  messageText: z.string().min(1),
  messagePhoto: z.string().optional(),
  buttonText: z.string().optional(),
  buttonAction: z.string().optional(),
  targeting: z.any().optional(),
  promocodeId: z.string().uuid().optional(),
  scheduledAt: z.string().datetime().optional(),
});

// GET /api/campaigns
campaignRouter.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(50, parseInt(req.query.pageSize as string) || 20);
    const status = req.query.status as string;
    const type = req.query.type as string;

    const where: any = {};
    if (status) where.status = status;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { promocode: true },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaigns" });
  }
});

// POST /api/campaigns
campaignRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const input = campaignSchema.parse(req.body);
    const campaign = await prisma.campaign.create({ data: input });

    await prisma.auditLog.create({
      data: {
        action: "CAMPAIGN_CREATED",
        entityType: "Campaign",
        entityId: campaign.id,
        adminId: req.adminId,
        details: { name: campaign.name },
      },
    });

    res.status(201).json(campaign);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// GET /api/campaigns/:id
campaignRouter.get("/:id", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        promocode: true,
        deliveries: {
          orderBy: { sentAt: "desc" },
          take: 100,
          include: { client: { select: { firstName: true, lastName: true, telegramId: true } } },
        },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch campaign" });
  }
});

// PATCH /api/campaigns/:id
campaignRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    if (existing.status === "SENDING" || existing.status === "COMPLETED") {
      res.status(400).json({ error: "Cannot edit campaign in current status" });
      return;
    }

    const campaign = await prisma.campaign.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        action: "CAMPAIGN_UPDATED",
        entityType: "Campaign",
        entityId: campaign.id,
        adminId: req.adminId,
        details: req.body,
      },
    });

    res.json(campaign);
  } catch (err) {
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// DELETE /api/campaigns/:id
campaignRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    if (existing.status === "SENDING") {
      res.status(400).json({ error: "Cannot delete campaign while sending" });
      return;
    }

    await prisma.campaign.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        action: "CAMPAIGN_DELETED",
        entityType: "Campaign",
        entityId: req.params.id,
        adminId: req.adminId,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// POST /api/campaigns/:id/send
campaignRouter.post("/:id/send", async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    if (campaign.status !== "DRAFT" && campaign.status !== "SCHEDULED") {
      res.status(400).json({ error: "Campaign cannot be sent in current status" });
      return;
    }

    // Build audience from targeting
    const audience = await buildAudience(campaign.targeting);

    // Create delivery records
    await prisma.campaignDelivery.createMany({
      data: audience.map((clientId) => ({
        campaignId: campaign.id,
        clientId,
      })),
      skipDuplicates: true,
    });

    // Update campaign
    await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: "SENDING",
        sentAt: new Date(),
        totalTargeted: audience.length,
      },
    });

    // Enqueue BullMQ job
    const sender = getCampaignSender();
    await sender.add("send-campaign", { campaignId: campaign.id });

    await prisma.auditLog.create({
      data: {
        action: "CAMPAIGN_SEND_STARTED",
        entityType: "Campaign",
        entityId: campaign.id,
        adminId: req.adminId,
        details: { audienceSize: audience.length },
      },
    });

    res.json({ success: true, audienceSize: audience.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to send campaign" });
  }
});

// POST /api/campaigns/:id/preview
campaignRouter.post("/:id/preview", async (req: AuthRequest, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    // Count audience without sending
    const audience = await buildAudience(campaign.targeting);

    res.json({
      audienceSize: audience.length,
      messagePreview: campaign.messageText,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to preview campaign" });
  }
});

// GET /api/campaigns/:id/stats
campaignRouter.get("/:id/stats", async (req, res) => {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: req.params.id },
      include: {
        deliveries: { select: { status: true } },
      },
    });

    if (!campaign) {
      res.status(404).json({ error: "Campaign not found" });
      return;
    }

    // Calculate revenue from bookings attributed to this campaign
    const revenue = await prisma.booking.aggregate({
      where: { campaignId: campaign.id, status: "COMPLETED" },
      _sum: { finalPrice: true },
    });

    const stats = {
      totalTargeted: campaign.totalTargeted,
      totalSent: campaign.totalSent,
      totalRead: campaign.totalRead,
      totalClicked: campaign.totalClicked,
      totalConverted: campaign.totalConverted,
      revenue: Number(revenue._sum.finalPrice || 0),
      deliveryRate:
        campaign.totalTargeted > 0
          ? (campaign.totalSent / campaign.totalTargeted) * 100
          : 0,
      clickRate:
        campaign.totalSent > 0
          ? (campaign.totalClicked / campaign.totalSent) * 100
          : 0,
      conversionRate:
        campaign.totalSent > 0
          ? (campaign.totalConverted / campaign.totalSent) * 100
          : 0,
    };

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// ── Audience builder ──

async function buildAudience(targeting: any): Promise<string[]> {
  const where: any = {
    marketingOptOut: false,
    NOT: { tags: { hasSome: ["no-marketing"] } },
  };

  if (targeting) {
    if (targeting.tiers?.length) {
      where.loyaltyTier = { in: targeting.tiers };
    }
    if (targeting.tags?.length) {
      where.tags = { hasSome: targeting.tags };
    }
    if (targeting.excludeTags?.length) {
      where.NOT = {
        ...where.NOT,
        tags: { hasSome: targeting.excludeTags },
      };
    }
    if (targeting.venues?.length) {
      where.bookings = {
        some: { venueId: { in: targeting.venues } },
      };
    }
    if (targeting.totalBookings) {
      if (targeting.totalBookings.min !== undefined) {
        where.totalBookings = { ...where.totalBookings, gte: targeting.totalBookings.min };
      }
      if (targeting.totalBookings.max !== undefined) {
        where.totalBookings = { ...where.totalBookings, lte: targeting.totalBookings.max };
      }
    }
    if (targeting.lastBookingDaysAgo) {
      const now = new Date();
      if (targeting.lastBookingDaysAgo.min !== undefined) {
        const maxDate = new Date(now.getTime() - targeting.lastBookingDaysAgo.min * 86400000);
        where.lastActivityAt = { ...where.lastActivityAt, lte: maxDate };
      }
      if (targeting.lastBookingDaysAgo.max !== undefined) {
        const minDate = new Date(now.getTime() - targeting.lastBookingDaysAgo.max * 86400000);
        where.lastActivityAt = { ...where.lastActivityAt, gte: minDate };
      }
    }
  }

  const clients = await prisma.client.findMany({
    where,
    select: { id: true },
  });

  return clients.map((c) => c.id);
}
