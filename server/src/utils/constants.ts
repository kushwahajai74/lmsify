/**
 * Cross-cutting constants. Centralised so a rename is one edit, not a grep.
 */

/** Name of the refresh-token httpOnly cookie. */
export const REFRESH_COOKIE = "refreshToken";

/** Path scope for the refresh cookie — only /api/v1/auth endpoints see it. */
export const REFRESH_COOKIE_PATH = "/api/v1/auth";

/** R2 folder prefixes — keeps `storage.put()` calls terse and typo-proof. */
export const R2_FOLDERS = {
  avatars: "avatars",
  posters: "posters",
  videos: "videos",
} as const;

export type R2Folder = (typeof R2_FOLDERS)[keyof typeof R2_FOLDERS];

/** Redis cache key prefixes. Kept stable so invalidation patterns stay simple. */
export const CACHE_KEYS = {
  coursesList: "cache:courses:",
  course: (id: string) => `cache:course:${id}`,
  adminUsers: "cache:admin:users",
} as const;

/** TTLs (seconds) for each cache key. */
export const CACHE_TTL = {
  coursesList: 5 * 60, // 5 minutes
  course: 60 * 60, // 1 hour
  adminUsers: 2 * 60, // 2 minutes
} as const;

/**
 * MIME → file-extension mapping for presigned uploads. Used to give uploaded
 * objects a real extension (`.png`, `.jpg`, `.mp4`) instead of `.bin`.
 *
 * The keys here are what the frontend is allowed to send via the presign
 * endpoint — keep this list narrow on purpose. If a new type is needed,
 * add it here AND in `presignAssetSchema` so validation stays in lockstep.
 *
 * Anything not in this map falls back to `.bin` (server's `presignPut` does
 * the fallback; the schema rejects unknown MIME types upfront so we never
 * actually hit the fallback in practice).
 */
export const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
};

/**
 * MIME types accepted by the poster presign endpoint. Posters are images.
 * Source of truth — `presignCoursePosterSchema` uses this exact list.
 */
export const POSTER_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
] as const;

/**
 * MIME types accepted by the lecture-video presign endpoint.
 * Videos are common browser-playable formats.
 */
export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;