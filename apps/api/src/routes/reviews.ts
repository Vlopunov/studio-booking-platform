import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const reviewsRouter = Router();

// GET /api/reviews
reviewsRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      rating,
      venue,
      moderated,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};

    if (rating) where.rating = parseInt(rating);
    if (moderated !== undefined) where.isPublic = moderated === "true";
    if (venue) {
      where.booking = { venueId: venue };
    }

    const [reviews, total] = await Promise.all([
      prisma.review.findMany({
        where,
        include: {
          client: {
            select: { firstName: true, lastName: true, telegramUsername: true },
          },
          booking: {
            select: {
              humanId: true,
              venue: { select: { name: true } },
              date: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.review.count({ where }),
    ]);

    res.json({
      data: reviews,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("List reviews error:", err);
    res.status(500).json({ error: "Failed to list reviews" });
  }
});

// PATCH /api/reviews/:id
reviewsRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { isPublic } = req.body;

    const review = await prisma.review.update({
      where: { id: req.params.id },
      data: { isPublic },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: isPublic ? "REVIEW_PUBLISHED" : "REVIEW_HIDDEN",
        entityType: "Review",
        entityId: review.id,
        details: { isPublic },
        ip: req.ip,
      },
    });

    res.json(review);
  } catch (err) {
    console.error("Update review error:", err);
    res.status(500).json({ error: "Failed to update review" });
  }
});

// POST /api/reviews/:id/reply
reviewsRouter.post("/:id/reply", async (req: AuthRequest, res: Response) => {
  try {
    const { text } = req.body;
    const reviewId = req.params.id;

    if (!text) {
      res.status(400).json({ error: "text is required" });
      return;
    }

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
      include: {
        client: { select: { id: true, telegramId: true, firstName: true } },
      },
    });

    if (!review) {
      res.status(404).json({ error: "Review not found" });
      return;
    }

    // Reply delivery would be handled by the bot service
    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "REVIEW_REPLIED",
        entityType: "Review",
        entityId: reviewId,
        details: {
          text,
          clientId: review.clientId,
          telegramId: review.client.telegramId.toString(),
        },
        ip: req.ip,
      },
    });

    res.json({
      success: true,
      message: "Reply queued for delivery",
      telegramId: review.client.telegramId.toString(),
    });
  } catch (err) {
    console.error("Reply to review error:", err);
    res.status(500).json({ error: "Failed to reply to review" });
  }
});
