import { z } from "zod";

/**
 * Zod request schemas for /api/v1/* (user-facing).
 *
 * `validate(schema)` middleware replaces `req.body` with the parsed result,
 * so downstream controllers get the typed shape automatically. The inferred
 * types below are exported for the controllers' annotations.
 */

/**
 * PUT /updateprofile — change name and/or email.
 *
 * Both fields are optional, but at least one must be present — an empty body
 * would be a no-op request, and the `.refine` short-circuits it with a 400.
 */
export const updateProfileSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(80).optional(),
    email: z.string().email("Invalid email address").optional(),
  })
  .refine((d) => Boolean(d.name) || Boolean(d.email), {
    message: "Provide at least one of `name` or `email`",
  });

/** Inferred body shape — used as `req.body as UpdateProfileBody` in controllers. */
export type UpdateProfileBody = z.infer<typeof updateProfileSchema>;