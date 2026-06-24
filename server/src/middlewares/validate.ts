import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../utils/AppError.js";

/**
 * Zod validator factory. Parses `req[source]`, replaces it with the typed
 * result on success, or forwards a 400 `AppError` on failure.
 *
 * Usage:
 *   router.post("/login", validate(loginSchema), login);
 *   router.get ("/courses", validate(paginationSchema, "query"), getCourses);
 */
export const validate =
  (schema: ZodTypeAny, source: "body" | "query" | "params" = "body") =>
  (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return next(new AppError(message, 400));
    }
    // Replace with parsed (coerced) value so downstream code gets the typed shape.
    (req as unknown as Record<string, unknown>)[source] = result.data;
    next();
  };