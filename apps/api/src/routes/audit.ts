import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const auditRouter = Router();

// GET /api/audit
auditRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      admin,
      action,
      from,
      to,
      page = "1",
      limit = "50",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};

    if (admin) where.adminId = admin;
    if (action) where.action = { contains: action, mode: "insensitive" };
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          admin: { select: { name: true, email: true, role: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("List audit logs error:", err);
    res.status(500).json({ error: "Failed to list audit logs" });
  }
});
