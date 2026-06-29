import { z } from "zod";

import { objectIdSchema } from "./course.schema.js";

/**
 * Zod request schemas for /api/v1/payment/*.
 *
 * `objectIdSchema` is re-imported from `course.schema.ts` — the file's own
 * JSDoc already documents that it's reused wherever a route takes a raw
 * `:id` / `courseId`, so duplicating it here would just create two truths.
 */

/**
 * POST /payment/create-order   (auth required)
 *
 * Body: `{ courseId }`. Server-side: looks up the course, multiplies its
 * `price` by 100 to get paise, and hands that to Razorpay.
 */
export const createOrderSchema = z.object({
  courseId: objectIdSchema,
});

/**
 * POST /payment/verify   (auth required)
 *
 * Body: Razorpay's Checkout response + the `courseId` so the server can
 * confirm the order belongs to the course the user thinks they're buying.
 *
 * `razorpay_*` fields are all opaque strings from Razorpay — we don't care
 * about shape, only that they're present. The signature is HMAC-SHA256 of
 * `${orderId}|${paymentId}` keyed by `RAZORPAY_API_SECRET`.
 */
export const paymentVerificationSchema = z.object({
  razorpay_order_id: z.string().min(1, "razorpay_order_id is required"),
  razorpay_payment_id: z.string().min(1, "razorpay_payment_id is required"),
  razorpay_signature: z.string().min(1, "razorpay_signature is required"),
  courseId: objectIdSchema,
});

/** Inferred shapes — used as `req.validated!.body as CreateOrderBody` etc. */
export type CreateOrderBody = z.infer<typeof createOrderSchema>;
export type PaymentVerificationBody = z.infer<typeof paymentVerificationSchema>;