import { Router } from "express";

import { isAuthenticated } from "../middlewares/auth.js";
import { validate } from "../middlewares/validate.js";
import {
  createOrderSchema,
  paymentVerificationSchema,
} from "../schemas/payment.schema.js";
import {
  createCourseOrder,
  paymentVerification,
  paymentWebhook,
} from "../controllers/paymentController.js";

/**
 * Mounted at `/api/v1` in `app.ts`. Route map:
 *
 *   POST /payment/create-order    — auth, validates { courseId }
 *   POST /payment/verify          — auth, validates Razorpay Checkout response
 *   POST /payment/webhook         — NO auth — HMAC-signed by Razorpay
 *
 * The Razorpay public key is returned IN the `/create-order` response
 * (and not on its own endpoint). Razorpay's key is public by design — the
 * browser sees it in Checkout's HTML anyway — so a separate `/razorpay-key`
 * endpoint adds an attack surface for nothing.
 *
 * The webhook route has no `isAuthenticated` and no `validate(...)`. The body
 * is the raw Buffer set by the path-scoped `express.raw()` registered in
 * `app.ts` BEFORE the global `express.json()` — see `app.ts` for the
 * ordering. The handler reads `req.body.toString("utf8")` and verifies the
 * signature against `RAZORPAY_WEBHOOK_SECRET`.
 */
export const paymentRouter = Router();

/* ---- Browser-facing (auth required) ---- */

paymentRouter.post(
  "/payment/create-order",
  isAuthenticated,
  validate(createOrderSchema),
  createCourseOrder,
);

paymentRouter.post(
  "/payment/verify",
  isAuthenticated,
  validate(paymentVerificationSchema),
  paymentVerification,
);

/* ---- Webhook (server-to-server, HMAC-auth) ---- */

paymentRouter.post(
  "/payment/webhook",
  paymentWebhook,
);