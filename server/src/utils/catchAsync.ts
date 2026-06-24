import type { NextFunction, Request, RequestHandler, Response } from "express";

/**
 * Wraps an async route handler so rejected promises forward to `next()` and
 * land in the global error handler — instead of crashing the process.
 *
 * Note: Express 5 forwards async rejections automatically, but we keep this
 * wrapper for portability with Express 4 and for explicit, consistent typing.
 */
export const catchAsync =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
