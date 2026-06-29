import type { Request, Response } from "express";

import { User } from "../models/userModel.js";
import { Session } from "../models/sessionModel.js";
import {
  signAccessToken,
  signRefreshToken,
  newFamily,
  verifyRefreshToken,
} from "../services/tokenService.js";
import type { RefreshTokenPayload } from "../services/tokenService.js";
import { sessionService } from "../services/sessionService.js";
import { env } from "../config/env.js";
import { AppError } from "../utils/AppError.js";
import { REFRESH_COOKIE, REFRESH_COOKIE_PATH } from "../utils/constants.js";
import { toClient, toClientSummary } from "../utils/toClient.js";
import type { RegisterBody, LoginBody } from "../schemas/auth.schema.js";

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Set the httpOnly refresh-token cookie. Path-scoped to /api/v1/auth so the
 * browser only sends it on auth endpoints — non-auth endpoints cannot
 * exfiltrate it even if they suffer an XSS.
 */
function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Clear the refresh-token cookie. Must mirror `setRefreshCookie` options exactly. */
function clearRefreshCookie(res: Response): void {
  res.cookie(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: REFRESH_COOKIE_PATH,
    expires: new Date(0),
  });
}

/**
 * Mint a fresh access + refresh token pair, persist the session row, set the
 * cookie, and return the tokens. Caller decides what goes in the response body.
 *
 * `family` is optional: omit for a fresh login (a new family is generated);
 * pass the existing family on /refresh so the rotated session stays in the
 * same family — reuse-detection still works against that family.
 */
async function issueSession(
  res: Response,
  userId: string,
  meta: { userAgent?: string; ip?: string; family?: string },
): Promise<{ accessToken: string; refreshToken: string }> {
  const family = meta.family ?? newFamily();
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId, family);

  // NOTE: payload uses `userId` (per our naming convention), NOT `_id`.
  // RefreshTokenPayload = { userId, family } — see services/tokenService.ts.
  const payload: RefreshTokenPayload = { userId, family };
  await sessionService.create({
    payload,
    rawToken: refreshToken,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

/* ------------------------------------------------------------------ *
 * Controllers
 * ------------------------------------------------------------------ */

/**
 * POST /register
 *   Body: { name, email, password }
 *   201 → { success, message, accessToken, user }
 *   Sets refresh cookie. Password is hashed by the pre-save hook in userModel.ts.
 */
export async function register(req: Request, res: Response): Promise<void> {
  const { name, email, password } = req.validated!.body as RegisterBody;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError("User already exists with this email", 400);

  const user = await User.create({ name, email, password });

  const { accessToken } = await issueSession(res, user._id.toString(), {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: "Registered successfully",
    accessToken,
    user: toClientSummary(user),
  });
}

/**
 * POST /login
 *   Body: { email, password }
 *   200 → { success, message, accessToken, user }
 *   Sets refresh cookie.
 */
export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.validated!.body as LoginBody;

  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new AppError("Invalid email or password", 401);

  const ok = await user.comparePassword(password);
  if (!ok) throw new AppError("Invalid email or password", 401);

  const { accessToken } = await issueSession(res, user._id.toString(), {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  res.status(200).json({
    success: true,
    message: `Welcome back, ${user.name}`,
    accessToken,
    user: toClientSummary(user),
  });
}

/**
 * POST /refresh   (cookie-only — no middleware reads the body)
 *
 * Reuse-detection flow:
 *   1. Verify the refresh JWT. If tampered/expired → 401 + clear cookie.
 *   2. Look up the session row by tokenHash.
 *        - Found: happy path → rotate (delete old row), issue fresh pair
 *          with the SAME family, 200 + new accessToken.
 *        - Missing AND family still has live sessions: REUSE — kill the
 *          entire family (theft response), 401 + clear cookie.
 *        - Missing AND family empty: just clear cookie, 401 (normal expiry).
 */
export async function refresh(req: Request, res: Response): Promise<void> {
  const raw = req.cookies?.[REFRESH_COOKIE];
  if (!raw) throw new AppError("No refresh token provided", 401);

  let payload: RefreshTokenPayload;
  try {
    payload = verifyRefreshToken(raw);
  } catch {
    clearRefreshCookie(res);
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const existing = await sessionService.findByRawToken(raw);
  if (!existing) {
    // Session row missing — token was either already rotated (reuse) or expired.
    const liveInFamily = await Session.countDocuments({ family: payload.family });
    if (liveInFamily > 0) {
      await sessionService.revokeFamily(payload.family);
      console.warn(
        `🚨 Refresh-token reuse detected for family ${payload.family} — revoked ${liveInFamily} session(s)`,
      );
      clearRefreshCookie(res);
      throw new AppError("Refresh token reuse detected — all sessions revoked", 401);
    }
    clearRefreshCookie(res);
    throw new AppError("Refresh token revoked or expired", 401);
  }

  // Happy path: delete the old row, issue fresh pair with the SAME family.
  await sessionService.rotate(raw);

  const { accessToken } = await issueSession(res, payload.userId, {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    family: payload.family,
  });

  res.status(200).json({ success: true, accessToken });
}

/**
 * POST /logout   (cookie-only — idempotent: 200 even if cookie is absent)
 *
 * Single-device logout: deletes the refresh cookie's session row (if any) and
 * clears the cookie. The access token is stateless and naturally expires
 * within 15 min — the client is expected to drop it from memory immediately.
 */
export async function logout(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) {
    await sessionService.deleteByRawToken(token);
  }
  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: "Logged out successfully" });
}

/**
 * GET /me   (behind isAuthenticated)
 *
 * Re-fetches from DB so out-of-band changes (admin role flips, profile
 * updates) are picked up immediately.
 */
export async function getMyProfile(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.user!._id);
  if (!user) throw new AppError("User not found", 404);

  res.status(200).json({ success: true, user: toClient(user) });
}
