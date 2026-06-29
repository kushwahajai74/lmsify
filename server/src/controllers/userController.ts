import type { Request, Response } from "express";

import { User } from "../models/userModel.js";
import { AppError } from "../utils/AppError.js";
import { toClient } from "../utils/toClient.js";
import type { UpdateProfileBody } from "../schemas/user.schema.js";

/**
 * PUT /api/v1/updateprofile   (behind isAuthenticated)
 *
 * Updates name and/or email on the currently authenticated user. Returns the
 * full user shape (via `toClient`) so the frontend can refresh its cached
 * user object in one round-trip.
 *
 * `runValidators: true` is critical — by default Mongoose skips schema
 * validators on `findByIdAndUpdate`, so without it the schema-level
 * `minlength` / `trim` etc. would be bypassed.
 */
export async function updateProfile(req: Request, res: Response): Promise<void> {
  const { name, email } = req.validated!.body as UpdateProfileBody;

  // Strip undefined keys so we only `$set` what was actually provided.
  // Without this, `{ name: undefined, email: undefined }` would be a no-op
  // (good) but `{ name: undefined, email: "x@y.com" }` would also be a no-op
  // for name (fine), AND we couldn't tell from `keys` what was sent.
  const update: { name?: string; email?: string } = {};
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;

  const user = await User.findByIdAndUpdate(req.user!._id, { $set: update }, {
    new: true,
    runValidators: true,
  });
  if (!user) throw new AppError("User not found", 404);

  res.status(200).json({
    success: true,
    message: "Profile updated successfully",
    user: toClient(user),
  });
}