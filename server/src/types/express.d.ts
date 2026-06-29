import type { IUser } from "../models/userModel.js";

/**
 * Express request augmentation.
 *
 * After `isAuthenticated` middleware runs, `req.user` is the loaded Mongoose
 * User document. Without this file, every controller would need `as any` to
 * read it.
 *
 * Side-effect import: this file augments the global `Express.Request` type.
 * Add `import "./types/express.js";` once in app.ts.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/no-empty-interface
    interface Request {
      user?: IUser;
      /**
       * Typed/parsed values produced by the `validate(schema, source)` middleware.
       * Populated per-source as validators run. Read with
       * `req.validated!.body` / `.query` / `.params` and cast to the inferred
       * schema type (e.g. `PaginationQuery`, `CreateCourseBody`).
       *
       * We don't reuse `req.body` / `req.query` / `req.params` for the parsed
       * result — Express 5 makes `req.query` a getter-only property, and the
       * other two are also bad targets (they're plain objects, but reassigning
       * them works only by accident).
       */
      validated?: { body?: unknown; query?: unknown; params?: unknown };
    }
  }
}

// Required for this file to be treated as a module (so the `declare global`
// block is valid) and to make the IUser import non-removable.
export {};