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