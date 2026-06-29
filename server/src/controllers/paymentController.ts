import type { Request, Response } from "express";
import { Types } from "mongoose";

import { Course } from "../models/courseModel.js";
import { User } from "../models/userModel.js";
import { Payment } from "../models/paymentModel.js";
import {
  createOrder as createRazorpayOrder,
  verifyRazorpaySignature,
  verifyWebhookSignature,
} from "../services/paymentService.js";
import { cache } from "../services/cacheService.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { CACHE_KEYS } from "../utils/constants.js";
import { logger } from "../utils/logger.js";
import type {
  CreateOrderBody,
  PaymentVerificationBody,
} from "../schemas/payment.schema.js";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Records a successful payment and grants the user lifetime access to the
 * course. Idempotent — safe to call from both `/payment/verify` (browser)
 * and `/payment/webhook` (Razorpay server-side).
 *
 * Three race windows converge here:
 *   1. User reloads the success page → re-posts the same `/payment/verify`.
 *   2. Webhook arrives after the browser already verified.
 *   3. Both fire concurrently → first `Payment.create` wins, second hits
 *      the unique index on `razorpay_order_id`.
 *
 * All three collapse to: `findOne` pre-check, `Payment.create` with a
 * `11000` catch, then a user-array push guarded by `.some(...)`. The cache
 * invalidation is idempotent so it's safe to run on every path.
 */
async function grantCourseAccess(opts: {
  orderId: string;
  paymentId: string;
  signature: string;
  userId: string;
  courseId: string;
  amount: number;
}): Promise<void> {
  // Fast-path: Payment row already exists. Skip the create entirely, but
  // still self-heal purchasedCourses in case a previous crash wrote Payment
  // but lost the user.save() — the next operation would otherwise leave the
  // user locked out.
  const existing = await Payment.findOne({ razorpay_order_id: opts.orderId });
  if (existing) {
    await syncPurchasedCourse(opts.userId, opts.courseId);
    await cache.del(CACHE_KEYS.course(opts.courseId)).catch(() => {});
    return;
  }

  try {
    await Payment.create({
      user: opts.userId,
      course: opts.courseId,
      razorpay_order_id: opts.orderId,
      razorpay_payment_id: opts.paymentId,
      razorpay_signature: opts.signature,
      amount: opts.amount,
      currency: "INR",
      status: "captured",
    });
  } catch (err) {
    // MongoServerError isn't exported in this Mongoose 9 version — check by
    // name + code, which is stable across driver versions.
    const isDuplicate =
      err instanceof Error &&
      err.name === "MongoServerError" &&
      (err as Error & { code?: number }).code === 11000;
    if (!isDuplicate) throw err;
    // Lost a race with the other verify path → fall through to user sync.
  }

  await syncPurchasedCourse(opts.userId, opts.courseId);
  await cache.del(CACHE_KEYS.course(opts.courseId)).catch(() => {});
}

/**
 * Push the courseId onto `user.purchasedCourses` if it isn't already there.
 * `.some(...)` makes the push idempotent across repeated calls.
 */
async function syncPurchasedCourse(userId: string, courseId: string): Promise<void> {
  const user = await User.findById(userId);
  if (!user) return;
  if (user.purchasedCourses.some((c) => c.toString() === courseId)) return;
  user.purchasedCourses.push(new Types.ObjectId(courseId));
  await user.save();
}

/* ------------------------------------------------------------------ *
 * Browser-facing endpoints (auth required)
 * ------------------------------------------------------------------ */

/**
 * POST /api/v1/payment/create-order   (auth)
 *
 * Body: `{ courseId }`. Looks up the course, multiplies its price by 100
 * (Razorpay wants paise), and creates a Razorpay Order.
 *
 * Idempotent: if the user already has a `captured` Payment for this course,
 * returns 200 with `alreadyPaid: true` instead of creating a duplicate
 * order. Buying twice is a UX bug, not a server error — the frontend can
 * treat the 200 as a soft path.
 */
export async function createCourseOrder(req: Request, res: Response): Promise<void> {
  const { courseId } = req.validated!.body as CreateOrderBody;

  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);
  if (course.price <= 0) {
    throw new AppError("This course is free — no payment needed", 400);
  }

  const user = req.user!; // isAuthenticated guarantees this

  const alreadyPaid = await Payment.findOne({
    user: user._id,
    course: course._id,
    status: "captured",
  });
  if (alreadyPaid) {
    res.status(200).json({
      success: true,
      message: "You already own this course",
      alreadyPaid: true,
      courseId: String(course._id),
    });
    return;
  }

  const order = await createRazorpayOrder({
    amountPaise: course.price * 100,
    courseId: String(course._id),
    userId: String(user._id),
  });

  res.status(201).json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: env.RAZORPAY_API_KEY,
    course: {
      id: String(course._id),
      title: course.title,
      price: course.price,
    },
  });
}

/**
 * POST /api/v1/payment/verify   (auth)
 *
 * Body: `{ razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId }`.
 *
 * 1. Verify HMAC-SHA256 of `${orderId}|${paymentId}` against the API secret.
 *    On fail: 400 with `{ success: false, message: "Invalid payment signature" }`.
 * 2. Look up the course (404 on missing — protects against a tampered body
 *    pointing at a non-existent course).
 * 3. Hand off to `grantCourseAccess` — idempotent over re-calls.
 * 4. Return 200 `{ success: true, reference, courseId }`. Frontend reads
 *    `reference` and refreshes `/me` to pick up the new purchasedCourses.
 */
export async function paymentVerification(req: Request, res: Response): Promise<void> {
  const body = req.validated!.body as PaymentVerificationBody;
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
    courseId,
  } = body;

  const ok = verifyRazorpaySignature(orderId, paymentId, signature);
  if (!ok) {
    // Direct emit (not AppError) — keeps the failure path obvious and avoids
    // one indirection through the global error handler.
    res.status(400).json({
      success: false,
      message: "Invalid payment signature",
    });
    return;
  }

  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);

  await grantCourseAccess({
    orderId,
    paymentId,
    signature,
    userId: String(req.user!._id),
    courseId: String(course._id),
    amount: course.price,
  });

  res.status(200).json({
    success: true,
    reference: paymentId,
    courseId: String(course._id),
  });
}

/* ------------------------------------------------------------------ *
 * Webhook (server-to-server, HMAC auth, raw body)
 * ------------------------------------------------------------------ */

/**
 * POST /api/v1/payment/webhook   (NO auth — HMAC-signed by Razorpay)
 *
 * Recovery path for the browser-side `/payment/verify` failing (network drop,
 * user closes the tab before the POST lands, etc.). Razorpay will retry for
 * up to ~24h until we 200.
 *
 * Critical invariants:
 *   - Body is a raw `Buffer` (set by `express.raw()` mounted scoped to this
 *     path in `app.ts` BEFORE the global `express.json()`).
 *   - NEVER throw to the global error handler from here — Razorpay retries
 *     non-2xx responses, so a transient DB blip would re-attempt into the
 *     duplicate-key storm `grantCourseAccess` already handles gracefully.
 *   - On signature failure → 400 (so Razorpay does NOT retry a tampered body).
 *   - On any other internal error AFTER signature verify → 200 + log; the
 *     Payment is already persisted (idempotent) and the user is the loser
 *     only of a cache invalidation, which the next read fixes.
 */
export async function paymentWebhook(req: Request, res: Response): Promise<void> {
  // `express.raw()` puts the body on req.body as a Buffer.
  const raw = (req.body as Buffer)?.toString("utf8") ?? "";
  const signature = req.headers["x-razorpay-signature"];

  if (typeof signature !== "string" || !signature) {
    res.status(400).json({ success: false, message: "Missing signature" });
    return;
  }
  if (!verifyWebhookSignature(raw, signature)) {
    res.status(400).json({ success: false, message: "Invalid webhook signature" });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    res.status(400).json({ success: false, message: "Invalid JSON body" });
    return;
  }

  // Narrow defensively without trusting any field — webhook payloads have a
  // stable shape but Razorpay does occasionally evolve the structure.
  const event = (parsed as { event?: unknown })?.event;
  if (event === "payment.captured") {
    const entity = (parsed as { payload?: { payment?: { entity?: unknown } } })
      ?.payload?.payment?.entity;
    const e = entity as
      | {
          order_id?: unknown;
          id?: unknown;
          amount?: unknown;
          notes?: { userId?: unknown; courseId?: unknown };
        }
      | undefined;

    const orderId = typeof e?.order_id === "string" ? e.order_id : null;
    const paymentId = typeof e?.id === "string" ? e.id : null;
    const userId = typeof e?.notes?.userId === "string" ? e.notes.userId : null;
    const courseId = typeof e?.notes?.courseId === "string" ? e.notes.courseId : null;
    // amount comes back as paise; convert to rupees for our schema.
    const amountRupees =
      typeof e?.amount === "number" ? Math.round(e.amount / 100) : 0;

    if (!orderId || !paymentId || !userId || !courseId) {
      logger.warn({ event, orderId, paymentId, userId, courseId }, "webhook missing fields");
      res.status(200).json({ success: true, ignored: "missing fields" });
      return;
    }

    await grantCourseAccess({
      orderId,
      paymentId,
      signature,
      userId,
      courseId,
      amount: amountRupees,
    });

    logger.info({ orderId, paymentId, userId, courseId }, "webhook payment.captured");
    res.status(200).json({ success: true });
    return;
  }

  if (event === "order.paid") {
    // The actual record arrives on `payment.captured`. Ack and move on.
    logger.info({ event }, "webhook order.paid (acked, no DB action)");
    res.status(200).json({ success: true });
    return;
  }

  // Unhandled event types: log and ack. Razorpay should never retry these,
  // and acking beats the alternative of retrying into a log storm.
  logger.info({ event }, "webhook unhandled event (acked)");
  res.status(200).json({ success: true });
}