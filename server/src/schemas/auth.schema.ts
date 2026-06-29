import { z } from "zod";

/**
 * Zod request schemas for /api/v1/auth/*.
 *
 * `validate(schema)` middleware replaces `req.body` with the parsed result,
 * so downstream controllers get the typed shape automatically. The inferred
 * types below are exported for the controllers' annotations.
 *
 * Avatar is intentionally NOT accepted on `/register` — uploads go through
 * presigned R2 URLs in a later phase as a separate endpoint pair.
 */

/** POST /register — name + email + password. */
export const registerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(80),
  email: z.email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

/** POST /login — email + password. */
export const loginSchema = z.object({
  email: z.email("Invalid email address"),
  // min(1) (not 6) so wrong-password surfaces as 401, not 400.
  password: z.string().min(1, "Password is required"),
});

/** Inferred body shapes — used as `req.body as RegisterBody` in controllers. */
export type RegisterBody = z.infer<typeof registerSchema>;
export type LoginBody = z.infer<typeof loginSchema>;
