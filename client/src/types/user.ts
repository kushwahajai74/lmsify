/**
 * Mirrors `server/src/utils/toClient.ts`. FE-2 will replace this with
 * Zod-inferred types from `src/api/schemas/`; until then, this is the
 * hand-written contract and can drift. Any change to the backend
 * `toClient` / `toClientSummary` must be reflected here.
 */

export type UserRole = "user" | "admin";

export interface UserSummary {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface PlaylistEntry {
  course: string;
  poster: string;
}

export interface User extends UserSummary {
  purchasedCourses: string[];
  playlist: PlaylistEntry[];
  createdAt: string;
}
