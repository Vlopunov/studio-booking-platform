import { Router, Response } from "express";
import { z } from "zod";
import { prisma } from "@studio/database";
import { AuthRequest } from "../middleware/auth";

const createBookingSchema = z.object({
  clientId: z.string().uuid().optional(),
  venueId: z.string().uuid(),
  date: z.string(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:MM"),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:MM").optional(),
  durationHours: z.number().int().min(1).max(12),
  basePrice: z.number().min(0).optional(),
  finalPrice: z.number().min(0).optional(),
  addons: z
    .array(
      z.object({
        addonId: z.string().uuid(),
        quantity: z.number().int().min(1),
        price: z.number().min(0),
      })
    )
    .optional(),
  comment: z.string().optional(),
  adminNote: z.string().optional(),
});

export const bookingsRouter = Router();

// GET /api/bookings
bookingsRouter.get("/", async (req: AuthRequest, res: Response) => {
  try {
    const {
      venue,
      status,
      date_from,
      date_to,
      search,
      page = "1",
      limit = "20",
    } = req.query as Record<string, string>;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const where: any = {};

    if (venue) where.venueId = venue;
    if (status) where.status = status;
    if (date_from || date_to) {
      where.date = {};
      if (date_from) where.date.gte = new Date(date_from);
      if (date_to) where.date.lte = new Date(date_to);
    }
    if (search) {
      where.OR = [
        { humanId: { contains: search, mode: "insensitive" } },
        {
          client: {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { phone: { contains: search, mode: "insensitive" } },
            ],
          },
        },
      ];
    }

    const [bookings, total] = await Promise.all([
      prisma.booking.findMany({
        where,
        include: {
          client: {
            select: {
              firstName: true,
              lastName: true,
              phone: true,
              loyaltyTier: true,
            },
          },
          venue: { select: { name: true } },
        },
        orderBy: [{ date: "desc" }, { startTime: "desc" }],
        skip,
        take,
      }),
      prisma.booking.count({ where }),
    ]);

    // Normalize: add flat clientName/venueName/totalPrice for admin consumption
    const normalized = bookings.map((b: any) => ({
      ...b,
      clientName: [b.client?.firstName, b.client?.lastName].filter(Boolean).join(" "),
      clientPhone: b.client?.phone || "",
      venueName: b.venue?.name || "",
      totalPrice: Number(b.finalPrice || 0),
    }));

    res.json({
      data: normalized,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / take),
    });
  } catch (err) {
    console.error("List bookings error:", err);
    res.status(500).json({ error: "Failed to list bookings" });
  }
});

// GET /api/bookings/export?format=csv
bookingsRouter.get("/export", async (req: AuthRequest, res: Response) => {
  try {
    const { venue, status, date_from, date_to } = req.query as Record<
      string,
      string
    >;

    const where: any = {};
    if (venue) where.venueId = venue;
    if (status) where.status = status;
    if (date_from || date_to) {
      where.date = {};
      if (date_from) where.date.gte = new Date(date_from);
      if (date_to) where.date.lte = new Date(date_to);
    }

    const bookings = await prisma.booking.findMany({
      where,
      include: {
        client: {
          select: { firstName: true, lastName: true, phone: true },
        },
        venue: { select: { name: true } },
      },
      orderBy: { date: "desc" },
    });

    const header =
      "ID,HumanID,Client,Phone,Venue,Date,Start,End,Duration,BasePrice,FinalPrice,Status\n";
    const rows = bookings
      .map(
        (b) =>
          `${b.id},${b.humanId},"${b.client.firstName} ${b.client.lastName || ""}",${b.client.phone || ""},${b.venue.name},${new Date(b.date).toISOString().split("T")[0]},${b.startTime},${b.endTime},${b.durationHours},${b.basePrice},${b.finalPrice},${b.status}`
      )
      .join("\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="bookings.csv"'
    );
    res.send(header + rows);
  } catch (err) {
    console.error("Export bookings error:", err);
    res.status(500).json({ error: "Failed to export bookings" });
  }
});

// GET /api/bookings/:id
bookingsRouter.get("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const booking = await prisma.booking.findUnique({
      where: { id: req.params.id },
      include: {
        client: true,
        venue: true,
        addons: { include: { addon: true } },
        review: true,
      },
    });

    if (!booking) {
      res.status(404).json({ error: "Booking not found" });
      return;
    }

    res.json({
      ...booking,
      clientName: [booking.client?.firstName, booking.client?.lastName].filter(Boolean).join(" "),
      clientPhone: booking.client?.phone || "",
      venueName: booking.venue?.name || "",
      totalPrice: Number(booking.finalPrice || 0),
    });
  } catch (err) {
    console.error("Get booking error:", err);
    res.status(500).json({ error: "Failed to get booking" });
  }
});

// POST /api/bookings
bookingsRouter.post("/", async (req: AuthRequest, res: Response) => {
  try {
    const parsed = createBookingSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "Validation failed", details: parsed.error.flatten() });
      return;
    }

    const {
      clientId,
      venueId,
      date,
      startTime,
      endTime,
      durationHours,
      basePrice,
      finalPrice,
      addons,
      comment,
      adminNote,
      ...rest
    } = req.body;

    // Generate humanId: B-YYMMDD-NNN
    const dateObj = new Date(date);
    const datePrefix = `B-${dateObj.getFullYear().toString().slice(2)}${String(dateObj.getMonth() + 1).padStart(2, "0")}${String(dateObj.getDate()).padStart(2, "0")}`;

    const todayCount = await prisma.booking.count({
      where: { humanId: { startsWith: datePrefix } },
    });

    const humanId = `${datePrefix}-${String(todayCount + 1).padStart(3, "0")}`;

    const booking = await prisma.booking.create({
      data: {
        humanId,
        clientId,
        venueId,
        date: new Date(date),
        startTime,
        endTime,
        durationHours,
        basePrice,
        finalPrice,
        comment,
        adminNote,
        status: "CONFIRMED",
        confirmedAt: new Date(),
        ...rest,
        addons: addons
          ? {
              create: addons.map(
                (a: { addonId: string; quantity: number; price: number }) => ({
                  addonId: a.addonId,
                  quantity: a.quantity,
                  price: a.price,
                })
              ),
            }
          : undefined,
      },
      include: {
        client: true,
        venue: true,
        addons: { include: { addon: true } },
      },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "BOOKING_CREATED",
        entityType: "Booking",
        entityId: booking.id,
        details: { humanId, venueId, clientId },
        ip: req.ip,
      },
    });

    res.status(201).json(booking);
  } catch (err) {
    console.error("Create booking error:", err);
    res.status(500).json({ error: "Failed to create booking" });
  }
});

// PATCH /api/bookings/:id/status
bookingsRouter.patch(
  "/:id/status",
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, reason } = req.body;
      const bookingId = req.params.id;

      const updateData: any = { status };

      if (status === "CONFIRMED") {
        updateData.confirmedAt = new Date();
      } else if (status === "CANCELLED") {
        updateData.cancelledAt = new Date();
        updateData.cancelReason = reason || null;
        updateData.cancelledBy = "admin";
      } else if (status === "COMPLETED") {
        updateData.completedAt = new Date();
      }

      const booking = await prisma.booking.update({
        where: { id: bookingId },
        data: updateData,
      });

      await prisma.auditLog.create({
        data: {
          adminId: req.adminId,
          action: `BOOKING_${status}`,
          entityType: "Booking",
          entityId: bookingId,
          details: { status, reason },
          ip: req.ip,
        },
      });

      res.json(booking);
    } catch (err) {
      console.error("Update booking status error:", err);
      res.status(500).json({ error: "Failed to update booking status" });
    }
  }
);

// PATCH /api/bookings/:id
bookingsRouter.patch("/:id", async (req: AuthRequest, res: Response) => {
  try {
    const bookingId = req.params.id;
    const { addons, ...data } = req.body;

    const booking = await prisma.booking.update({
      where: { id: bookingId },
      data,
      include: { client: true, venue: true },
    });

    await prisma.auditLog.create({
      data: {
        adminId: req.adminId,
        action: "BOOKING_UPDATED",
        entityType: "Booking",
        entityId: bookingId,
        details: data,
        ip: req.ip,
      },
    });

    res.json(booking);
  } catch (err) {
    console.error("Update booking error:", err);
    res.status(500).json({ error: "Failed to update booking" });
  }
});
