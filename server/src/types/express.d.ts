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
    }
  }
}

// Required for this file to be treated as a module (so the `declare global`
// block is valid) and to make the IUser import non-removable.
export {};