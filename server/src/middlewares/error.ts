import type { ErrorRequestHandler } from "express";
import { AppError } from "../utils/AppError.js";

/**
 * Global error handler. Express recognises the 4-arg signature and routes
 * any error (thrown, `next(err)`, or async-rejection) here.
 *
 * Serialises as `{ success: false, message }` so the frontend always gets a
 * predictable shape.
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";

  // Don't leak stack traces to the client, but do log them server-side.
  console.error("❌ Unhandled error:", err);

  res.status(statusCode).json({ success: false, message });
};