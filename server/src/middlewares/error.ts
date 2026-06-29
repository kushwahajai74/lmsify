import type { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import { AppError } from "../utils/AppError.js";

/**
 * Global error handler. Express recognises the 4-arg signature and routes
 * any error (thrown, `next(err)`, or async-rejection) here.
 *
 * Serialises as `{ success: false, message }` so the frontend always gets a
 * predictable shape.
 *
 * Special cases mapped here (defense in depth — controllers/middlewares
 * should prevent these from reaching us, but if any slip through we still
 * return a clean 4xx instead of a 500):
 *   - `AppError`                 → its own statusCode + message
 *   - `mongoose.Error.CastError` → 400 (e.g. a raw :id that isn't an ObjectId
 *                                   reaches `Model.findById(...)` anyway)
 *   - `mongoose.Error.ValidationError` → 400 with the first issue's message
 *   - anything else              → 500
 */
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let statusCode: number;
  let message: string;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    const first = Object.values(err.errors)[0];
    message = first?.message ?? err.message;
  } else {
    statusCode = 500;
    message = err.message || "Internal Server Error";
  }

  // Don't leak stack traces to the client, but do log them server-side.
  console.error("❌ Unhandled error:", err);

  res.status(statusCode).json({ success: false, message });
};