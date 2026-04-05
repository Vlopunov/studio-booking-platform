import "dotenv/config";
import express from "express";
import cors from "cors";
import { authMiddleware } from "./middleware/auth";
import { initJobs } from "./jobs";

// Routes
import { authRouter } from "./routes/auth";
import { dashboardRouter } from "./routes/dashboard";
import { bookingsRouter } from "./routes/bookings";
import { venuesRouter } from "./routes/venues";
import { clientsRouter } from "./routes/clients";
import { campaignRouter } from "./routes/campaigns";
import { autoMessageRouter } from "./routes/auto-messages";
import { giftCertificateRouter } from "./routes/gift-certificates";
import { analyticsRouter } from "./routes/analytics";
import { loyaltyRouter } from "./routes/loyalty";
import { promocodesRouter } from "./routes/promocodes";
import { reviewsRouter } from "./routes/reviews";
import { auditRouter } from "./routes/audit";
import { adminsRouter } from "./routes/admins";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: process.env.ADMIN_URL || "http://localhost:3000" }));
app.use(express.json());

// Public
app.use("/api/auth", authRouter);

// Protected
app.use("/api/dashboard", authMiddleware, dashboardRouter);
app.use("/api/bookings", authMiddleware, bookingsRouter);
app.use("/api/venues", authMiddleware, venuesRouter);
app.use("/api/clients", authMiddleware, clientsRouter);
app.use("/api/campaigns", authMiddleware, campaignRouter);
app.use("/api/auto-messages", authMiddleware, autoMessageRouter);
app.use("/api/gift-certificates", authMiddleware, giftCertificateRouter);
app.use("/api/analytics", authMiddleware, analyticsRouter);
app.use("/api/loyalty", authMiddleware, loyaltyRouter);
app.use("/api/promocodes", authMiddleware, promocodesRouter);
app.use("/api/reviews", authMiddleware, reviewsRouter);
app.use("/api/audit", authMiddleware, auditRouter);
app.use("/api/admins", authMiddleware, adminsRouter);

// Health
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
  console.log(`🚀 API server running on http://localhost:${PORT}`);
  try { initJobs(); } catch (e) { console.error("Jobs init failed (Redis may not be ready):", e); }
});
