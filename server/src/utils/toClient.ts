import type { IUser } from "../models/userModel.js";

/**
 * Strip Mongoose internals from a user document and shape it for the client.
 *
 * Two flavors:
 *   - `toClientSummary` — fields the frontend needs immediately after
 *     login/register to render the app shell (header, role-gated UI).
 *   - `toClient`        — the full shape including playlist/purchasedCourses,
 *     used by explicit reads like GET /me where the caller asked for
 *     everything.
 *
 * Both:
 *   - Convert `_id` → `userId` (string), per our naming convention.
 *   - Drop `password` (defensive — it's already `select: false`).
 *   - Drop `__v` via `toObject({ versionKey: false })`.
 *   - Stringify Mongoose ObjectIds so JSON output is plain strings.
 */

/**
 * `toObject()` returns a lean-ish POJO whose exact type Mongoose infers
 * narrowly. We treat it as `any` here because we're reshaping it explicitly
 * on the next lines — re-typing the destructured fields would add noise
 * without catching real bugs at this seam.
 */
type UserObject = ReturnType<IUser["toObject"]> & Record<string, unknown>;

/** Minimal shape — included in /register and /login responses. */
export function toClientSummary(user: IUser) {
  const obj = user.toObject({ versionKey: false }) as UserObject;
  return {
    id: String(obj._id),
    name: obj.name,
    email: obj.email,
    role: obj.role,
  };
}

/** Full shape — returned by GET /me and any future "read user" endpoint. */
export function toClient(user: IUser) {
  const obj = user.toObject({ versionKey: false }) as UserObject;
  return {
    id: String(obj._id),
    name: obj.name,
    email: obj.email,
    role: obj.role,
    purchasedCourses: ((obj.purchasedCourses as Array<{ toString(): string }> | undefined) ?? []).map(
      (c) => c.toString(),
    ),
    playlist: ((obj.playlist as Array<{ course: { toString(): string }; poster: string }> | undefined) ?? []).map(
      (p) => ({
        course: p.course.toString(),
        poster: p.poster,
      }),
    ),
    createdAt: obj.createdAt as Date,
  };
}
