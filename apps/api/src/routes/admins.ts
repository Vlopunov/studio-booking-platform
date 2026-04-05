import { Router, Response } from "express";
import bcrypt from "bcryptjs";
import { prisma } from "@studio/database";
import { AuthRequest, requireRole } from "../middleware/auth";

export const adminsRouter = Router();

// All admin management routes require SUPER_ADMIN role
adminsRouter.use(requireRole("SUPER_ADMIN"));

// GET /api/admins
adminsRouter.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const admins = await prisma.admin.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });
    res.json(admins);
  } catch (err) {
    console.error("List admins error:", err);
    res.status(500).json({ error: "Failed to list admins" });
  }
});

// POST /api/admins
adminsRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const { email, password, name, role, telegramId } = req.body;

    if (!email || !password || !name) {
      res.status(400).json({ error: "email, password, and name are required" });
      return;
    }

    const existing = await prisma.admin.findUnique({ where: { email } });
    if (existing) {
      res.status(409).json({ error: "Admin with this email already exists" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const admin = await prisma.admin.create({
      data: {
        email,
        passwordHash,
        name,
        role: role || "MANAGER",
        telegramId: telegramId ? BigInt(telegramId) : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true,
        isActive: true,
        createdAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "ADMIN_CREATED",
        entityType: "Admin",
        entityId: admin.id,
        details: { email, name, role: admin.role },
        ip: req.ip,
      },
    });

    res.status(201).json(admin);
  } catch (err) {
    console.error("Create admin error:", err);
    res.status(500).json({ error: "Failed to create admin" });
  }
});

// PATCH /api/admins/:id
adminsRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const { password, telegramId, ...data } = req.body;
    const updateData: any = { ...data };

    if (password) {
      updateData.passwordHash = await bcrypt.hash(password, 12);
    }
    if (telegramId !== undefined) {
      updateData.telegramId = telegramId ? BigInt(telegramId) : null;
    }

    const admin = await prisma.admin.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        telegramId: true,
        isActive: true,
        updatedAt: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "ADMIN_UPDATED",
        entityType: "Admin",
        entityId: admin.id,
        details: {
          ...data,
          passwordChanged: !!password,
        },
        ip: req.ip,
      },
    });

    res.json(admin);
  } catch (err) {
    console.error("Update admin error:", err);
    res.status(500).json({ error: "Failed to update admin" });
  }
});

// DELETE /api/admins/:id (deactivate)
adminsRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    if (req.params.id === req.adminId) {
      res.status(400).json({ error: "Cannot deactivate yourself" });
      return;
    }

    const admin = await prisma.admin.update({
      where: { id: req.params.id },
      data: { isActive: false },
      select: { id: true, email: true, name: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "ADMIN_DEACTIVATED",
        entityType: "Admin",
        entityId: admin.id,
        details: { email: admin.email },
        ip: req.ip,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete admin error:", err);
    res.status(500).json({ error: "Failed to delete admin" });
  }
});
