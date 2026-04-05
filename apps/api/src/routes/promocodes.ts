import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const promocodesRouter = Router();

// GET /api/promocodes
promocodesRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      isActive,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};
    if (isActive !== undefined) {
      where.isActive = isActive === "true";
    }

    const [promocodes, total] = await Promise.all([
      prisma.promocode.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      prisma.promocode.count({ where }),
    ]);

    res.json({
      data: promocodes,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("List promocodes error:", err);
    res.status(500).json({ error: "Failed to list promocodes" });
  }
});

// POST /api/promocodes
promocodesRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const promocode = await prisma.promocode.create({
      data: {
        ...req.body,
        validFrom: new Date(req.body.validFrom),
        validUntil: new Date(req.body.validUntil),
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "PROMOCODE_CREATED",
        entityType: "Promocode",
        entityId: promocode.id,
        details: { code: promocode.code, type: promocode.type },
        ip: req.ip,
      },
    });

    res.status(201).json(promocode);
  } catch (err) {
    console.error("Create promocode error:", err);
    res.status(500).json({ error: "Failed to create promocode" });
  }
});

// PATCH /api/promocodes/:id
promocodesRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const data = { ...req.body };
    if (data.validFrom) data.validFrom = new Date(data.validFrom);
    if (data.validUntil) data.validUntil = new Date(data.validUntil);

    const promocode = await prisma.promocode.update({
      where: { id: req.params.id },
      data,
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "PROMOCODE_UPDATED",
        entityType: "Promocode",
        entityId: promocode.id,
        details: req.body,
        ip: req.ip,
      },
    });

    res.json(promocode);
  } catch (err) {
    console.error("Update promocode error:", err);
    res.status(500).json({ error: "Failed to update promocode" });
  }
});

// DELETE /api/promocodes/:id (deactivate)
promocodesRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const promocode = await prisma.promocode.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "PROMOCODE_DEACTIVATED",
        entityType: "Promocode",
        entityId: promocode.id,
        details: { code: promocode.code },
        ip: req.ip,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete promocode error:", err);
    res.status(500).json({ error: "Failed to delete promocode" });
  }
});
