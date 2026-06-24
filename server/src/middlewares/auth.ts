import type { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../services/tokenService.js";
import { User } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";

/**
 * Reads the access token from the `Authorization: Bearer …` header, verifies
 * it, loads the user, and attaches it to `req.user`.
 *
 * Refresh tokens live in cookies and are NOT used by this middleware — they
 * are handled by the /refresh endpoint only.
 */
export async function isAuthenticated(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Please login to access this resource", 401));
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return next(new AppError("Please login to access this resource", 401));

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.userId);
    if (!user) return next(new AppError("User not found", 404));
    req.user = user;
    next();
  } catch {
    next(new AppError("Invalid or expired access token", 401));
  }
}

/** Allow only admins. Use after `isAuthenticated`. */
export function authorizeAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "admin") return next(new AppError("Admin access denied", 403));
  next();
}

/**
 * Gate course-content endpoints on payment. Admins always pass.
 *
 * Logic: the user has paid for this course OR they're an admin.
 * The middleware checks `req.params.id` against `req.user.purchasedCourses`.
 */
export function authorizeCourseAccess(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role === "admin") return next();
  const courseId = req.params.id;
  const owns = req.user?.purchasedCourses?.some((c) => c.toString() === courseId);
  if (!owns) return next(new AppError("Please purchase this course to access its content", 403));
  next();
}