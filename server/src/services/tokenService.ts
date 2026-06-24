import crypto from "node:crypto";
// `jsonwebtoken` is CommonJS — under NodeNext the default import is the
// module itself, exposing `sign` / `verify`.
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

/** Access-token payload — read by `isAuthenticated` on every protected route. */
export interface AccessTokenPayload {
  userId: string;
}

/** Refresh-token payload — read only by `/refresh` and `/logout`. */
export interface RefreshTokenPayload {
  userId: string;
  /** Session family id — inherited through rotation; scopes theft response. */
  family: string;
}

/** SHA-256 hex of any string. Used to derive the session lookup key from the raw JWT. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Signs a short-lived access token. Stateless — no DB write. */
export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { userId };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions["expiresIn"] });
}

/** Signs a long-lived refresh token. Caller is responsible for hashing + storing. */
export function signRefreshToken(userId: string, family: string): string {
  const payload: RefreshTokenPayload = { userId, family };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` as jwt.SignOptions["expiresIn"],
  });
}

/** Verifies an access token. Throws on invalid/expired — caller wraps in try/catch. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/** Verifies a refresh token. Throws on invalid/expired. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** Generates a new family id (one per login session). */
export function newFamily(): string {
  return crypto.randomUUID();
}