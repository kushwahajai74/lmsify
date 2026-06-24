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
