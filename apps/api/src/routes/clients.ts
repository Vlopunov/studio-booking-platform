import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const clientsRouter = Router();

// GET /api/clients
clientsRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      search,
      tier,
      tag,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};

    if (search) {
      where.OR = [
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { phone: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
        { telegramUsername: { contains: search, mode: "insensitive" } },
      ];
    }
    if (tier) where.loyaltyTier = tier;
    if (tag) where.tags = { has: tag };

    const [clients, total] = await Promise.all([
      prisma.client.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          phone: true,
          email: true,
          telegramUsername: true,
          loyaltyTier: true,
          bonusBalance: true,
          totalSpent: true,
          totalBookings: true,
          tags: true,
          rfmSegment: true,
          lastActivityAt: true,
          createdAt: true,
        },
        orderBy: { lastActivityAt: "desc" },
        skip,
        take,
      }),
      prisma.client.count({ where }),
    ]);

    res.json({
      data: clients,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("List clients error:", err);
    res.status(500).json({ error: "Failed to list clients" });
  }
});

// GET /api/clients/export?format=csv
clientsRouter.get("/export", async (_req: AuthRequest, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      select: {
        id: true,
        firstName: true,
        lastName: true,
        phone: true,
        email: true,
        telegramUsername: true,
        loyaltyTier: true,
        bonusBalance: true,
        totalSpent: true,
        totalBookings: true,
        tags: true,
        rfmSegment: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const header =
      "ID,FirstName,LastName,Phone,Email,Telegram,Tier,Bonus,TotalSpent,TotalBookings,Tags,RFM,CreatedAt\n";
    const rows = clients
      .map(
        (c) =>
          `${c.id},"${c.firstName}","${c.lastName || ""}",${c.phone || ""},${c.email || ""},${c.telegramUsername || ""},${c.loyaltyTier},${c.bonusBalance},${c.totalSpent},${c.totalBookings},"${c.tags.join(",")}",${c.rfmSegment || ""},${c.createdAt.toISOString()}`
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="clients.csv"'
    );
    res.send(header + rows);
  } catch (err) {
    console.error("Export clients error:", err);
    res.status(500).json({ error: "Failed to export clients" });
  }
});

// GET /api/clients/:id
clientsRouter.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const client = await prisma.client.findUnique({
      where: { id: req.params.id },
      include: {
        bookings: {
          include: { venue: { select: { name: true } } },
          orderBy: { date: "desc" },
          take: 50,
        },
        bonusHistory: {
          orderBy: { createdAt: "desc" },
          take: 50,
        },
        reviews: {
          include: {
            booking: {
              select: { humanId: true, venue: { select: { name: true } } },
            },
          },
          orderBy: { createdAt: "desc" },
        },
        referrals: {
          select: {
            id: true,
            firstName: true,
            totalBookings: true,
            createdAt: true,
          },
        },
        referredBy: {
          select: { id: true, firstName: true, referralCode: true },
        },
      },
    });

    if (!client) {
      res.status(404).json({ error: "Client not found" });
      return;
    }

    res.json(client);
  } catch (err) {
    console.error("Get client error:", err);
    res.status(500).json({ error: "Failed to get client" });
  }
});

// PATCH /api/clients/:id
clientsRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { notes, tags } = req.body;
    const updateData: any = {};
    if (notes !== undefined) updateData.notes = notes;
    if (tags !== undefined) updateData.tags = tags;

    const client = await prisma.client.update({
      where: { id: req.params.id },
      data: updateData,
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "CLIENT_UPDATED",
        entityType: "Client",
        entityId: client.id,
        details: updateData,
        ip: req.ip,
      },
    });

    res.json(client);
  } catch (err) {
    console.error("Update client error:", err);
    res.status(500).json({ error: "Failed to update client" });
  }
});

// POST /api/clients/:id/bonus-adjust
clientsRouter.post(
  "/:id/bonus-adjust",
  async (req: AuthRequest, res: Response) => {
    try {
      const { amount, reason } = req.body;
      const clientId = req.params.id;

      if (!amount || !reason) {
        res.status(400).json({ error: "amount and reason are required" });
        return;
      }

      const [client, transaction] = await prisma.$transaction([
        prisma.client.update({
          where: { id: clientId },
          data: { bonusBalance: { increment: amount } },
        }),
        prisma.bonusTransaction.create({
          data: {
            clientId,
            amount,
            type: "ADMIN_ADJUST",
            description: reason,
          },
        }),
      ]);

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "BONUS_ADJUSTED",
          entityType: "Client",
          entityId: clientId,
          details: { amount, reason, transactionId: transaction.id },
          ip: req.ip,
        },
      });

      res.json({
        bonusBalance: client.bonusBalance,
        transaction,
      });
    } catch (err) {
      console.error("Bonus adjust error:", err);
      res.status(500).json({ error: "Failed to adjust bonus" });
    }
  }
);

// POST /api/clients/:id/send-message
clientsRouter.post(
  "/:id/send-message",
  async (req: AuthRequest, res: Response) => {
    try {
      const { text } = req.body;
      const clientId = req.params.id;

      if (!text) {
        res.status(400).json({ error: "text is required" });
        return;
      }

      const client = await prisma.client.findUnique({
        where: { id: clientId },
        select: { telegramId: true, firstName: true },
      });

      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      // Telegram message sending would be handled by a separate service
      // Here we log the intent and the bot service picks it up
      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "MESSAGE_SENT",
          entityType: "Client",
          entityId: clientId,
          details: { text, telegramId: client.telegramId.toString() },
          ip: req.ip,
        },
      });

      res.json({
        success: true,
        message: "Message queued for delivery",
        telegramId: client.telegramId.toString(),
      });
    } catch (err) {
      console.error("Send message error:", err);
      res.status(500).json({ error: "Failed to send message" });
    }
  }
);
