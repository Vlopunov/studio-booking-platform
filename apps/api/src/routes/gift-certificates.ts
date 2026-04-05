import { Router } from "express";
import { prisma } from "@studio/database";
import { z } from "zod";
import { generateGiftCode } from "@studio/utils";
import type { AuthRequest } from "../middleware/auth";

export const giftCertificateRouter = Router();

const createSchema = z.object({
  type: z.enum(["AMOUNT", "HOURS"]),
  value: z.number().positive(),
  venueId: z.string().uuid().optional(),
  recipientName: z.string().optional(),
  message: z.string().optional(),
  expiresInDays: z.number().int().positive().default(180),
});

// GET /api/gift-certificates
giftCertificateRouter.get("/", async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const pageSize = Math.min(50, parseInt(req.query.pageSize as string) || 20);
    const status = req.query.status as string;

    const where: any = {};
    if (status === "active") {
      where.isActive = true;
      where.redeemedAt = null;
      where.expiresAt = { gt: new Date() };
    } else if (status === "redeemed") {
      where.redeemedAt = { not: null };
    } else if (status === "expired") {
      where.expiresAt = { lte: new Date() };
      where.redeemedAt = null;
    }

    const [data, total] = await Promise.all([
      prisma.giftCertificate.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          purchasedBy: { select: { firstName: true, lastName: true } },
          redeemedBy: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.giftCertificate.count({ where }),
    ]);

    res.json({
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch certificates" });
  }
});

// POST /api/gift-certificates
giftCertificateRouter.post("/", async (req: AuthRequest, res) => {
  try {
    const input = createSchema.parse(req.body);
    const code = generateGiftCode();
    const expiresAt = new Date(Date.now() + input.expiresInDays * 86400000);

    const cert = await prisma.giftCertificate.create({
      data: {
        code,
        type: input.type,
        value: input.value,
        venueId: input.venueId,
        recipientName: input.recipientName,
        message: input.message,
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        action: "GIFT_CERT_CREATED",
        entityType: "GiftCertificate",
        entityId: cert.id,
        adminId: req.adminId,
        details: { code: cert.code, value: Number(cert.value) },
      },
    });

    res.status(201).json(cert);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: err.errors });
      return;
    }
    res.status(500).json({ error: "Failed to create certificate" });
  }
});

// GET /api/gift-certificates/:id
giftCertificateRouter.get("/:id", async (req, res) => {
  try {
    const cert = await prisma.giftCertificate.findUnique({
      where: { id: req.params.id },
      include: {
        purchasedBy: { select: { firstName: true, lastName: true, telegramId: true } },
        redeemedBy: { select: { firstName: true, lastName: true, telegramId: true } },
      },
    });

    if (!cert) {
      res.status(404).json({ error: "Certificate not found" });
      return;
    }

    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch certificate" });
  }
});

// PATCH /api/gift-certificates/:id
giftCertificateRouter.patch("/:id", async (req: AuthRequest, res) => {
  try {
    const cert = await prisma.giftCertificate.update({
      where: { id: req.params.id },
      data: { isActive: req.body.isActive },
    });

    await prisma.auditLog.create({
      data: {
        action: "GIFT_CERT_UPDATED",
        entityType: "GiftCertificate",
        entityId: cert.id,
        adminId: req.adminId,
        details: req.body,
      },
    });

    res.json(cert);
  } catch (err) {
    res.status(500).json({ error: "Failed to update certificate" });
  }
});

// GET /api/gift-certificates/stats
giftCertificateRouter.get("/stats/summary", async (_req, res) => {
  try {
    const [totalSold, totalRedeemed, totalRevenue, totalActive] =
      await Promise.all([
        prisma.giftCertificate.count(),
        prisma.giftCertificate.count({
          where: { redeemedAt: { not: null } },
        }),
        prisma.giftCertificate.aggregate({
          where: { purchasedById: { not: null } },
          _sum: { value: true },
        }),
        prisma.giftCertificate.count({
          where: {
            isActive: true,
            redeemedAt: null,
            expiresAt: { gt: new Date() },
          },
        }),
      ]);

    res.json({
      totalSold,
      totalRedeemed,
      totalActive,
      totalRevenue: Number(totalRevenue._sum.value || 0),
      redemptionRate:
        totalSold > 0 ? (totalRedeemed / totalSold) * 100 : 0,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});
