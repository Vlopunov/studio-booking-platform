import { Router } from "express";
import { prisma } from "@studio/database";
import { z } from "zod";
import type { AuthRequest } from "../middleware/auth";

export const autoMessageRouter = Router();

const autoMessageSchema = z.object({
  name: z.string().min(1),
  trigger: z.enum([
    "BOOKING_ABANDONED",
    "FIRST_BOOKING_COMPLETED",
    "NO_BOOKING_7_DAYS",
    "INACTIVE_30_DAYS",
    "INACTIVE_60_DAYS",
    "INACTIVE_90_DAYS",
    "BIRTHDAY_3_DAYS_BEFORE",
    "TIER_UPGRADE",
    "BONUS_EXPIRY_7_DAYS",
    "REVIEW_POSITIVE",
    "BOOKING_MILESTONE",
  ]),
  delayMinutes: z.number().int().min(0).default(0),
  messageText: z.string().min(1),
  messagePhoto: z.string().optional(),
  buttonText: z.string().optional(),
  buttonAction: z.string().optional(),
  maxSendsPerClient: z.number().int().min(1).default(1),
  cooldownDays: z.number().int().min(0).default(30),
  tierRestriction: z.enum(["STANDARD", "SILVER", "GOLD", "PLATINUM"]).optional(),
  isActive: z.boolean().default(true),
});

// GET /api/auto-messages
autoMessageRouter.get("/", async (_req, res) => {
  try {
    const messages = await prisma.autoMessage.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: { select: { logs: true } },
      },
    });

    // Enrich with 30-day stats
    const enriched = await Promise.all(
      messages.map(async (msg) => {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

        const [sent, clicked, converted] = await Promise.all([
          prisma.autoMessageLog.count({
            where: { autoMessageId: msg.id, sentAt: { gte: thirtyDaysAgo } },
          }),
          prisma.autoMessageLog.count({
            where: { autoMessageId: msg.id, clickedAt: { not: null }, sentAt: { gte: thirtyDaysAgo } },
          }),
          prisma.autoMessageLog.count({
            where: { autoMessageId: msg.id, convertedAt: { not: null }, sentAt: { gte: thirtyDaysAgo } },
          }),
        ]);

        return {
          ...msg,
          stats30d: {
            sent,
            clicked,
            converted,
            clickRate: sent > 0 ? (clicked / sent) * 100 : 0,
            conversionRate: sent > 0 ? (converted / sent) * 100 : 0,
          },
        };
      })
    );

    res.json(enriched);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch auto-messages" });
  }
});

// POST /api/auto-messages
autoMessageRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const input = autoMessageSchema.parse(req.body);
    const message = await prisma.autoMessage.create({ data: input });

    await prisma.auditLog.create({
      data: {
        action: "AUTO_MESSAGE_CREATED",
        entityType: "AutoMessage",
        entityId: message.id,
        adminId: req.adminId,
      },
    });

    res.status(201).json(message);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create auto-message" });
  }
});

// PATCH /api/auto-messages/:id
autoMessageRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const message = await prisma.autoMessage.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        action: "AUTO_MESSAGE_UPDATED",
        entityType: "AutoMessage",
        entityId: message.id,
        adminId: req.adminId,
        details: req.body,
      },
    });

    res.json(message);
  } catch (err) {
    res.status(500).json({ error: "Failed to update auto-message" });
  }
});

// DELETE /api/auto-messages/:id
autoMessageRouter.delete("/:id", async (req: AuthRequest, res) => {
  try {
    await prisma.autoMessage.delete({ where: { id: req.params.id } });

    await prisma.auditLog.create({
      data: {
        action: "AUTO_MESSAGE_DELETED",
        entityType: "AutoMessage",
        entityId: req.params.id,
        adminId: req.adminId,
      },
    });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete auto-message" });
  }
});

// GET /api/auto-messages/:id/stats
autoMessageRouter.get("/:id/stats", async (req, res) => {
  try {
    const periods = [7, 30, 90];
    const stats = await Promise.all(
      periods.map(async (days) => {
        const since = new Date(Date.now() - days * 86400000);
        const [sent, clicked, converted] = await Promise.all([
          prisma.autoMessageLog.count({
            where: { autoMessageId: req.params.id, sentAt: { gte: since } },
          }),
          prisma.autoMessageLog.count({
            where: { autoMessageId: req.params.id, clickedAt: { not: null }, sentAt: { gte: since } },
          }),
          prisma.autoMessageLog.count({
            where: { autoMessageId: req.params.id, convertedAt: { not: null }, sentAt: { gte: since } },
          }),
        ]);
        return { period: `${days}d`, sent, clicked, converted };
      })
    );

    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
