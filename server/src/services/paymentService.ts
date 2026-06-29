import crypto from "node:crypto";
// `razorpay` ships CommonJS — under NodeNext, the default import is the
// entire `module.exports`, which is the Razorpay constructor.
import Razorpay from "razorpay";
import { env } from "../config/env.js";

/**
 * Single Razorpay client. Re-used across all payment operations.
 */
export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_API_KEY,
  key_secret: env.RAZORPAY_API_SECRET,
});

/**
 * Verifies the HMAC-SHA256 signature Razorpay sends back after a payment.
 *
 * For the Orders API the signed string is `${orderId}|${paymentId}`.
 * Returns `true` only if the computed digest matches the signature byte-for-byte.
 *
 * NOTE: this uses `RAZORPAY_API_SECRET`. The webhook (server-side) uses a
 * DIFFERENT secret — `RAZORPAY_WEBHOOK_SECRET`. Do not reuse the two.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_API_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  // Timing-safe comparison to defeat length-extension / timing side channels.
  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/**
 * Verifies a Razorpay webhook signature.
 *
 * Uses `RAZORPAY_WEBHOOK_SECRET` (NOT `RAZORPAY_API_SECRET` — they're distinct
 * keys configured in different places in the Razorpay dashboard) and signs
 * the RAW request body string. `express.raw()` is mounted on the webhook path
 * in `app.ts` so the body here is the untouched byte sequence.
 *
 * Reusing the API secret here will fail every verification. Reusing the
 * webhook secret for `/payment/verify` will also fail (different signed payload).
 */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false; // misconfiguration at deploy → fail loud upstream

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

interface CreateOrderOpts {
  amountPaise: number;
  courseId: string;
  userId: string;
}

/** Create a one-time Razorpay order for a course purchase. Amount is in paise. */
export async function createOrder(opts: CreateOrderOpts) {
  return razorpay.orders.create({
    amount: opts.amountPaise,
    currency: "INR",
    notes: { courseId: opts.courseId, userId: opts.userId },
  });
}

/** Fetch a payment record (used post-verification to confirm capture). */
export async function fetchPayment(paymentId: string) {
  return razorpay.payments.fetch(paymentId);
}
