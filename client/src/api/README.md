# `src/api/`

All HTTP plumbing.

## FE-1

- `client.ts` — single axios instance + 401 → /auth/refresh interceptor.
- `schemas/.gitkeep` — empty; populated in FE-2.

## FE-2+

- `schemas/` — Zod schemas **copied** from `server/src/schemas/`. Sync manually.
- `auth.ts`, `courses.ts`, `payments.ts`, `users.ts` — typed query/mutation
  hooks per feature, all built on `api`.
- `endpoints.ts` — single source of truth for URL paths.

## Auth model

- Access token: returned by /register and /login, kept in `authStore` (Zustand,
  in-memory only — never localStorage).
- Refresh token: set by backend as an httpOnly cookie scoped to `/api/v1/auth`.
  Browser sends it automatically; the JS layer never reads it.
- The interceptor in `client.ts` is the **only** place that ever calls
  `/auth/refresh`. Do not call it from feature code.
