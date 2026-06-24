import { Session } from "../models/sessionModel.js";
import { sha256 } from "./tokenService.js";
import type { RefreshTokenPayload } from "./tokenService.js";
import { env } from "../config/env.js";

/** Returns `expiresAt` = now + REFRESH_TOKEN_TTL_DAYS. */
function computeExpiry(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return d;
}

export const sessionService = {
  /** Persist a new session after login/refresh. */
  async create(opts: {
    payload: RefreshTokenPayload;
    rawToken: string;
    userAgent?: string;
    ip?: string;
  }) {
    await Session.create({
      tokenHash: sha256(opts.rawToken),
      user: opts.payload.userId,
      family: opts.payload.family,
      userAgent: opts.userAgent,
      ip: opts.ip,
      expiresAt: computeExpiry(),
    });
  },

  /** Look up a session by its raw JWT (after verification). null if revoked/expired. */
  async findByRawToken(rawToken: string) {
    return Session.findOne({ tokenHash: sha256(rawToken) });
  },

  /** Delete a single session — used by /logout. */
  async deleteByRawToken(rawToken: string) {
    await Session.deleteOne({ tokenHash: sha256(rawToken) });
  },

  /**
   * Rotate: delete the current row. Returns the deleted-row count —
   * 0 means it was already gone (caller should treat as reuse-detection).
   */
  async rotate(rawToken: string): Promise<number> {
    const res = await Session.deleteOne({ tokenHash: sha256(rawToken) });
    return res.deletedCount ?? 0;
  },

  /** Reuse-detection: delete every session in the family. Returns the kill count. */
  async revokeFamily(family: string): Promise<number> {
    const res = await Session.deleteMany({ family });
    return res.deletedCount ?? 0;
  },

  /** List active sessions for a user — powers the future admin/UI endpoint. */
  async listForUser(userId: string) {
    return Session.find({ user: userId }).sort({ createdAt: -1 }).lean();
  },
};