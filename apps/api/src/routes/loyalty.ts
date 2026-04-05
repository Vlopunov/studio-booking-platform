import { Router, Response } from "express";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

export const loyaltyRouter = Router();

// GET /api/loyalty/settings
loyaltyRouter.get("/settings", async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await prisma.loyaltySettings.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    res.json(result);
  } catch (err) {
    console.error("Get loyalty settings error:", err);
    res.status(500).json({ error: "Failed to get loyalty settings" });
  }
});

// PUT /api/loyalty/settings
loyaltyRouter.put("/settings", async (req: AuthRequest, res: Response) => {
  try {
    const items: Array<{ key: string; value: string }> = req.body;

    if (!Array.isArray(items)) {
      res.status(400).json({ error: "Body must be an array of {key, value}" });
      return;
    }

    await prisma.$transaction(
      items.map((item) =>
        prisma.loyaltySettings.upsert({
          where: { key: item.key },
          update: { value: item.value },
          create: { key: item.key, value: item.value },
        })
      )
    );

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "LOYALTY_SETTINGS_UPDATED",
        entityType: "LoyaltySettings",
        details: { updated: items.map((i) => i.key) },
        ip: req.ip,
      },
    });

    // Return updated settings
    const settings = await prisma.loyaltySettings.findMany();
    const result: Record<string, string> = {};
    for (const s of settings) {
      result[s.key] = s.value;
    }
    res.json(result);
  } catch (err) {
    console.error("Update loyalty settings error:", err);
    res.status(500).json({ error: "Failed to update loyalty settings" });
  }
});
