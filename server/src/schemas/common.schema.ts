import { z } from "zod";

/**
 * Common Zod schemas reused across modules.
 *
 * Kept in its own file so user/course/payment modules can pull them in
 * without circular imports.
 */

/**
 * GET /courses — query-string filter. Both fields optional.
 *
 * Empty-string handling lives in the controller (we just skip empty keys
 * when building the Mongo filter). Keeping the schema pure — no `.transform`.
 */
export const paginationSchema = z.object({
  keyword: z.string().optional(),
  category: z.string().optional(),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;