import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

const createVenueSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  pricePerHour: z.number().min(0),
  capacity: z.number().int().min(1).optional(),
  minBookingHours: z.number().int().min(1).optional(),
  maxBookingHours: z.number().int().min(1).optional(),
  sortOrder: z.number().int().optional(),
  schedules: z
    .array(
      z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        openTime: z.string().regex(/^\d{2}:\d{2}$/),
        closeTime: z.string().regex(/^\d{2}:\d{2}$/),
        isActive: z.boolean(),
      })
    )
    .optional(),
});

export const venuesRouter = Router();

// GET /api/venues
venuesRouter.get("/", async (_req: AuthRequest, res: Response) => {
  try {
    const venues = await prisma.venue.findMany({
      where: { isActive: true },
      include: { schedules: { orderBy: { dayOfWeek: "asc" } } },
      orderBy: { sortOrder: "asc" },
    });
    res.json(venues);
  } catch (err) {
    console.error("List venues error:", err);
    res.status(500).json({ error: "Failed to list venues" });
  }
});

// POST /api/venues
venuesRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createVenueSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const { schedules, ...data } = req.body;

    const venue = await prisma.venue.create({
      data: {
        ...data,
        schedules: schedules
          ? { create: schedules }
          : undefined,
      },
      include: { schedules: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "VENUE_CREATED",
        entityType: "Venue",
        entityId: venue.id,
        details: { name: venue.name },
        ip: req.ip,
      },
    });

    res.status(201).json(venue);
  } catch (err) {
    console.error("Create venue error:", err);
    res.status(500).json({ error: "Failed to create venue" });
  }
});

// PATCH /api/venues/:id
venuesRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: req.body,
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "VENUE_UPDATED",
        entityType: "Venue",
        entityId: venue.id,
        details: req.body,
        ip: req.ip,
      },
    });

    res.json(venue);
  } catch (err) {
    console.error("Update venue error:", err);
    res.status(500).json({ error: "Failed to update venue" });
  }
});

// DELETE /api/venues/:id (soft delete)
venuesRouter.delete("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: { isActive: false },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "VENUE_DEACTIVATED",
        entityType: "Venue",
        entityId: venue.id,
        ip: req.ip,
      },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Delete venue error:", err);
    res.status(500).json({ error: "Failed to delete venue" });
  }
});

// GET /api/venues/:id/schedule
venuesRouter.get("/:id/schedule", async (req: AuthRequest, res: Response) => {
  try {
    const schedules = await prisma.schedule.findMany({
      where: { venueId: req.params.id },
      orderBy: { dayOfWeek: "asc" },
    });
    res.json(schedules);
  } catch (err) {
    console.error("Get schedule error:", err);
    res.status(500).json({ error: "Failed to get schedule" });
  }
});

// PUT /api/venues/:id/schedule
venuesRouter.put("/:id/schedule", async (req: AuthRequest, res: Response) => {
  try {
    const venueId = req.params.id;
    const items: Array<{
      dayOfWeek: number;
      openTime: string;
      closeTime: string;
      isActive: boolean;
    }> = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.schedule.deleteMany({ where: { venueId } });
      await tx.schedule.createMany({
        data: items.map((item) => ({ ...item, venueId })),
      });
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "SCHEDULE_UPDATED",
        entityType: "Venue",
        entityId: venueId,
        details: { scheduleCount: items.length },
        ip: req.ip,
      },
    });

    const schedules = await prisma.schedule.findMany({
      where: { venueId },
      orderBy: { dayOfWeek: "asc" },
    });

    res.json(schedules);
  } catch (err) {
    console.error("Update schedule error:", err);
    res.status(500).json({ error: "Failed to update schedule" });
  }
});

// GET /api/venues/:id/pricing-rules
venuesRouter.get(
  "/:id/pricing-rules",
  async (req: AuthRequest, res: Response) => {
    try {
      const rules = await prisma.pricingRule.findMany({
        where: { venueId: req.params.id },
        orderBy: { priority: "desc" },
      });
      res.json(rules);
    } catch (err) {
      console.error("List pricing rules error:", err);
      res.status(500).json({ error: "Failed to list pricing rules" });
    }
  }
);

// POST /api/venues/:id/pricing-rules
venuesRouter.post(
  "/:id/pricing-rules",
  async (req: AuthRequest, res: Response) => {
    try {
      const rule = await prisma.pricingRule.create({
        data: { ...req.body, venueId: req.params.id },
      });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "PRICING_RULE_CREATED",
          entityType: "PricingRule",
          entityId: rule.id,
          details: { name: rule.name, venueId: req.params.id },
          ip: req.ip,
        },
      });

      res.status(201).json(rule);
    } catch (err) {
      console.error("Create pricing rule error:", err);
      res.status(500).json({ error: "Failed to create pricing rule" });
    }
  }
);

// PATCH /api/venues/:id/pricing-rules/:ruleId
venuesRouter.patch(
  "/:id/pricing-rules/:ruleId",
  async (req: AuthRequest, res: Response) => {
    try {
      const rule = await prisma.pricingRule.update({
        where: { id: req.params.ruleId },
        data: req.body,
      });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "PRICING_RULE_UPDATED",
          entityType: "PricingRule",
          entityId: rule.id,
          details: req.body,
          ip: req.ip,
        },
      });

      res.json(rule);
    } catch (err) {
      console.error("Update pricing rule error:", err);
      res.status(500).json({ error: "Failed to update pricing rule" });
    }
  }
);

// DELETE /api/venues/:id/pricing-rules/:ruleId
venuesRouter.delete(
  "/:id/pricing-rules/:ruleId",
  async (req: AuthRequest, res: Response) => {
    try {
      await prisma.pricingRule.delete({ where: { id: req.params.ruleId } });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "PRICING_RULE_DELETED",
          entityType: "PricingRule",
          entityId: req.params.ruleId,
          ip: req.ip,
        },
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Delete pricing rule error:", err);
      res.status(500).json({ error: "Failed to delete pricing rule" });
    }
  }
);

// GET /api/venues/:id/addons
venuesRouter.get("/:id/addons", async (req: AuthRequest, res: Response) => {
  try {
    const addons = await prisma.addon.findMany({
      where: { venueId: req.params.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json(addons);
  } catch (err) {
    console.error("List addons error:", err);
    res.status(500).json({ error: "Failed to list addons" });
  }
});

// POST /api/venues/:id/addons
venuesRouter.post("/:id/addons", async (req: AuthRequest, res: Response) => {
  try {
    const addon = await prisma.addon.create({
      data: { ...req.body, venueId: req.params.id },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "ADDON_CREATED",
        entityType: "Addon",
        entityId: addon.id,
        details: { name: addon.name, venueId: req.params.id },
        ip: req.ip,
      },
    });

    res.status(201).json(addon);
  } catch (err) {
    console.error("Create addon error:", err);
    res.status(500).json({ error: "Failed to create addon" });
  }
});

// PATCH /api/venues/:id/addons/:addonId
venuesRouter.patch(
  "/:id/addons/:addonId",
  async (req: AuthRequest, res: Response) => {
    try {
      const addon = await prisma.addon.update({
        where: { id: req.params.addonId },
        data: req.body,
      });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "ADDON_UPDATED",
          entityType: "Addon",
          entityId: addon.id,
          details: req.body,
          ip: req.ip,
        },
      });

      res.json(addon);
    } catch (err) {
      console.error("Update addon error:", err);
      res.status(500).json({ error: "Failed to update addon" });
    }
  }
);

// GET /api/venues/:id/availability?date=YYYY-MM-DD
venuesRouter.get(
  "/:id/availability",
  async (req: AuthRequest, res: Response) => {
    try {
      const venueId = req.params.id;
      const dateStr = req.query.date as string;
      if (!dateStr) {
        res.status(400).json({ error: "date query parameter is required" });
        return;
      }

      const date = new Date(dateStr + "T00:00:00");
      const jsDay = date.getDay();
      const dayOfWeek = jsDay === 0 ? 6 : jsDay - 1;

      const schedule = await prisma.schedule.findUnique({
        where: { venueId_dayOfWeek: { venueId, dayOfWeek } },
      });

      if (!schedule || !schedule.isActive) {
        res.json({ available: false, slots: [] });
        return;
      }

      const openHour = parseInt(schedule.openTime.split(":")[0], 10);
      const closeHour = parseInt(schedule.closeTime.split(":")[0], 10);

      // Get existing bookings for the date
      const nextDay = new Date(date);
      nextDay.setDate(nextDay.getDate() + 1);

      const [bookings, blockedSlots] = await Promise.all([
        prisma.booking.findMany({
          where: {
            venueId,
            date: { gte: date, lt: nextDay },
            status: { in: ["PENDING", "CONFIRMED"] },
          },
          select: { startTime: true, endTime: true },
        }),
        prisma.blockedSlot.findMany({
          where: {
            venueId,
            dateFrom: { lt: nextDay },
            dateTo: { gt: date },
          },
        }),
      ]);

      // Build occupied set
      const occupied = new Set<number>();

      for (const b of bookings) {
        const start = parseInt(b.startTime.split(":")[0], 10);
        const end = parseInt(b.endTime.split(":")[0], 10);
        for (let h = start; h < end; h++) occupied.add(h);
      }

      for (const bs of blockedSlots) {
        const bsStart = Math.max(bs.dateFrom.getHours(), openHour);
        const bsEnd = Math.min(bs.dateTo.getHours() || closeHour, closeHour);
        for (let h = bsStart; h < bsEnd; h++) occupied.add(h);
      }

      const slots: Array<{ time: string; available: boolean }> = [];
      for (let h = openHour; h < closeHour; h++) {
        const time = `${String(h).padStart(2, "0")}:00`;
        slots.push({ time, available: !occupied.has(h) });
      }

      res.json({ available: true, slots });
    } catch (err) {
      console.error("Availability error:", err);
      res.status(500).json({ error: "Failed to check availability" });
    }
  }
);

// POST /api/venues/:id/blocked-slots
venuesRouter.post(
  "/:id/blocked-slots",
  async (req: AuthRequest, res: Response) => {
    try {
      const slot = await prisma.blockedSlot.create({
        data: {
          venueId: req.params.id,
          dateFrom: new Date(req.body.dateFrom),
          dateTo: new Date(req.body.dateTo),
          reason: req.body.reason,
        },
      });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "BLOCKED_SLOT_CREATED",
          entityType: "BlockedSlot",
          entityId: slot.id,
          details: {
            venueId: req.params.id,
            dateFrom: req.body.dateFrom,
            dateTo: req.body.dateTo,
          },
          ip: req.ip,
        },
      });

      res.status(201).json(slot);
    } catch (err) {
      console.error("Create blocked slot error:", err);
      res.status(500).json({ error: "Failed to create blocked slot" });
    }
  }
);

// DELETE /api/venues/:id/blocked-slots/:slotId
venuesRouter.delete(
  "/:id/blocked-slots/:slotId",
  async (req: AuthRequest, res: Response) => {
    try {
      await prisma.blockedSlot.delete({ where: { id: req.params.slotId } });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: "BLOCKED_SLOT_DELETED",
          entityType: "BlockedSlot",
          entityId: req.params.slotId,
          ip: req.ip,
        },
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Delete blocked slot error:", err);
      res.status(500).json({ error: "Failed to delete blocked slot" });
    }
  }
);
