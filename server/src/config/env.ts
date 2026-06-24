import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

/**
 * Single source of truth for environment variables.
 *
 * Parsed at boot — any mismatch throws and the process exits.
 *
 * Scope decisions (see IMPLEMENTATION_PLAN.md §0):
 *   - No email vars (no SMTP, no nodemailer).
 *   - No subscription vars (payments are one-time per-course).
 *   - Two JWT secrets: access tokens use one, refresh tokens use the other.
 *   - Auth lifetimes are env-tunable, not hard-coded.
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url(),

  // Mongo
  MONGO_URI: z.string().min(1),

  // Redis (course/lecture cache only — not used for auth)
  REDIS_URL: z.string().min(1),

  // JWT (separate secrets for access vs refresh)
  JWT_SECRET: z.string().min(16, "JWT_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),

  // Auth lifetimes
  ACCESS_TOKEN_TTL: z.string().default("15m"), // e.g. "15m", "1h"
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),

  // Cloudflare R2 (S3-compatible)
  R2_ACCOUNT_ID: z.string().min(1),
  R2_ACCESS_KEY_ID: z.string().min(1),
  R2_SECRET_ACCESS_KEY: z.string().min(1),
  R2_BUCKET: z.string().min(1),
  R2_PUBLIC_URL: z.string().url(),

  // Razorpay (Orders API for one-time course payments)
  RAZORPAY_API_KEY: z.string().min(1),
  RAZORPAY_API_SECRET: z.string().min(1),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;