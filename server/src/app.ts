// `types/express.d.ts` is picked up automatically by tsconfig's `include` glob.
// The `declare global` block it contains augments Express.Request with `user?: IUser`.

import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import { pinoHttp } from "pino-http";

import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middlewares/error.js";
import { authRouter } from "./routes/authRoutes.js";
import { userRouter } from "./routes/userRoutes.js";
import { courseRouter } from "./routes/courseRoutes.js";
import { paymentRouter } from "./routes/paymentRoutes.js";

export const app = express();

// --- Body parsers (no file uploads — all uploads go through presigned URLs) ---
// Razorpay webhook FIRST, scoped to its exact path. The webhook needs the
// raw body bytes for HMAC verification; express.json() would consume them.
// Path-scoped middlewares only fire on matching URLs, so the global JSON
// parser continues to serve every other route unchanged. Must be registered
// BEFORE the global express.json() so it wins the middleware chain.
app.use(
  "/api/v1/payment/webhook",
  express.raw({ type: "application/json", limit: "1mb" }),
);

// 5 MB is plenty for JSON bodies (register, profile update, payment verification).
// Files of any size are PUT directly to R2 from the browser, bypassing this server.
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Boot-time webhook secret assert ---
// If the webhook route is mounted, the webhook secret MUST be set — otherwise
// every webhook fails HMAC verification with a generic 400 that's a nightmare
// to debug. Fail loud here so the deploy is broken immediately, not silently.
if (!env.RAZORPAY_WEBHOOK_SECRET) {
  throw new Error(
    "RAZORPAY_WEBHOOK_SECRET is required when the webhook route is mounted. " +
      "Configure it in Razorpay Dashboard → Webhooks, then add it to .env.",
  );
}

// --- Cookies + logging ---
// cookie-parser is only needed for the refresh-token cookie on /api/v1/auth/*.
// We mount it globally because that's cheaper than per-route mounting and
// it's a no-op on routes that don't read cookies.
app.use(cookieParser());

// app.use(pinoHttp({ logger }));

// --- CORS ---
// `credentials: true` lets the browser send the refresh cookie on cross-origin
// requests. `origin` is pinned to the frontend URL — never `*` when credentials
// are enabled (the browser would reject it).
app.use(
  cors({
    origin: env.FRONTEND_URL,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  }),
);

// --- Root ping (no auth, always available) ---
app.get("/", (_req, res) => {
  res.send(
    `<h1>CourseHub API is running. <a href="${env.FRONTEND_URL}">Open frontend</a>.</h1>`,
  );
});

// --- Health check (used by load balancers / uptime monitors) ---
app.get("/health", (_req, res) => {
  res.json({ status: "ok", uptime: process.uptime(), env: env.NODE_ENV });
});

// --- Routes (added in Phase 5+) ---
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/user", userRouter);
app.use("/api/v1", courseRouter);
app.use("/api/v1", paymentRouter);

// --- Global error handler — MUST be last, AFTER all routes ---
// Catches anything thrown anywhere upstream and serialises as
// `{ success: false, message }` so the frontend always gets a predictable shape.
app.use(errorHandler);