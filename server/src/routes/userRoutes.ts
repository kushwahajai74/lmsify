import { Router } from "express";

import { validate } from "../middlewares/validate.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { updateProfileSchema } from "../schemas/user.schema.js";
import { updateProfile } from "../controllers/userController.js";

/**
 * Mounted under `/api/v1`. All routes here require an access token in
 * `Authorization: Bearer …` (the refresh cookie is path-scoped to
 * `/api/v1/auth` and is NOT sent on these requests).
 */
export const userRouter = Router();

userRouter.put("/updateprofile", isAuthenticated, validate(updateProfileSchema), updateProfile);