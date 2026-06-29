import { z } from "zod";

/**
 * Zod request schemas for /api/v1/courses and /api/v1/lectures.
 *
 * `validate(schema)` replaces `req.body` / `req.query` with the parsed
 * result, so controllers get typed shapes automatically. The inferred
 * types are exported for the controllers' annotations.
 */

/**
 * Shared R2 asset shape — `{publicId, url}` from `storage.presignPut()`.
 *
 * `publicId` is the R2 object key (e.g. "posters/<uuid>.bin"); `url` is
 * the public read URL.
 */
const assetSchema = z.object({
  publicId: z.string().min(1, "publicId is required"),
  url: z.url("Invalid asset URL"),
});

/**
 * MongoDB ObjectId as a 24-char hex string. Reused wherever a route takes
 * a raw `:id` param or a `courseId` query field — without this, Mongoose's
 * `findById("sdfdzfsdf")` throws a `CastError` and surfaces as a 500.
 *
 * Lecture ids are sub-document ObjectIds, same shape.
 */
export const objectIdSchema = z
  .string()
  .regex(/^[a-fA-F0-9]{24}$/, "Invalid id (must be a 24-character hex string)");

/**
 * MIME types accepted by the presign endpoints. The frontend reads
 * `file.type` off a `<File>` and passes it here so the SDK signs the URL
 * with the matching `Content-Type` and the R2 object gets a proper
 * extension (`.png`, `.jpg`, `.mp4`, …).
 *
 * `z.enum` lists are derived from the constants in `utils/constants.ts` so
 * the schema and the storage service stay in lockstep — if you add a MIME
 * type to POSTER_MIME_TYPES, the schema picks it up automatically on next
 * build.
 */
import { POSTER_MIME_TYPES, VIDEO_MIME_TYPES } from "../utils/constants.js";

export const presignPosterSchema = z.object({
  contentType: z.enum(POSTER_MIME_TYPES, {
    message: `contentType must be one of: ${POSTER_MIME_TYPES.join(", ")}`,
  }),
});

export const presignVideoSchema = z.object({
  contentType: z.enum(VIDEO_MIME_TYPES, {
    message: `contentType must be one of: ${VIDEO_MIME_TYPES.join(", ")}`,
  }),
});

/**
 * POST /courses   (admin)
 *
 * NOTE: `createdBy` is NOT in the body — the controller stamps it from
 * `req.user.name` server-side. Never trust the client to identify the creator.
 */
export const createCourseSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(50),
  description: z.string().min(5, "Description must be at least 5 characters"),
  category: z.string().min(1, "Category is required"),
  price: z.number().min(0, "Price cannot be negative").default(0),
  poster: assetSchema,
});

/**
 * POST /courses/:id   (admin) — append a lecture to an existing course.
 */
export const addLectureSchema = z.object({
  title: z.string().min(1, "Lecture title is required"),
  description: z.string().min(1, "Lecture description is required"),
  video: assetSchema,
});

/**
 * DELETE /lectures?courseId=...&lectureId=...
 *
 * Lives on a flat endpoint (not nested under /courses/:id) to mirror the
 * `addLectures` POST pattern. Zod validates the query string before the
 * controller runs.
 *
 * Both ids are real Mongo ObjectIds (course is a top-level doc, lecture is
 * an embedded subdoc with its own _id). Strict 24-char hex check.
 */
export const deleteLectureQuerySchema = z.object({
  courseId: objectIdSchema,
  lectureId: objectIdSchema,
});

/** GET/POST/DELETE /courses/:id (and similar) — `:id` must be a valid ObjectId. */
export const courseIdParamSchema = z.object({
  id: objectIdSchema,
});

/** Inferred shapes — used as `req.body as CreateCourseBody` etc. in controllers. */
export type CreateCourseBody = z.infer<typeof createCourseSchema>;
export type AddLectureBody = z.infer<typeof addLectureSchema>;
export type DeleteLectureQuery = z.infer<typeof deleteLectureQuerySchema>;
export type PresignPosterBody = z.infer<typeof presignPosterSchema>;
export type PresignVideoBody = z.infer<typeof presignVideoSchema>;