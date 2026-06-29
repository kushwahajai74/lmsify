import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";
import { AppError } from "../utils/AppError.js";

/**
 * Zod validator factory. Parses `req[source]` and stashes the typed result
 * on `req.validated[source]`, or forwards a 400 `AppError` on failure.
 *
 * Why not reassign `req[source]` directly?
 *   - `req.query` is a getter-only property in Express 5 / Node 20+.
 *     Assigning to it throws `Cannot set property query of #<IncomingMessage>`.
 *   - `req.body` and `req.params` are settable but doing so silently drops any
 *     extra keys the client sent. Stashing on `req.validated` keeps the raw
 *     `req.*` intact for diagnostics.
 *
 * Usage:
 *   router.post("/login",   validate(loginSchema),                   login);
 *   router.get ("/courses", validate(paginationSchema, "query"),     getCourses);
 *
 * Read in controllers as:
 *   const { keyword } = req.validated!.query as PaginationQuery;
 *   const { title  } = req.validated!.body  as CreateCourseBody;
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
    // Spread preserves values from any prior `validate(..., other-source)` run
    // on the same request (uncommon, but free to support).
    req.validated = { ...req.validated, [source]: result.data };
    next();
  };