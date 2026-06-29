import { Router } from "express";

import { validate } from "../middlewares/validate.js";
import { isAuthenticated } from "../middlewares/auth.js";
import { registerSchema, loginSchema } from "../schemas/auth.schema.js";
import {
  register,
  login,
  refresh,
  logout,
  getMyProfile,
} from "../controllers/authController.js";

/**
 * Mounted under `/api/v1/auth`. The refresh cookie is scoped to that path
 * (`REFRESH_COOKIE_PATH` in utils/constants), so it is sent automatically on
 * /register, /login, /refresh, /logout — and NOT sent on /me (which is the
 * one protected endpoint here, using the access token in the header).
 */
export const authRouter = Router();

// Public — body validated by Zod before reaching the controller.
authRouter.post("/register", validate(registerSchema), register);
authRouter.post("/login", validate(loginSchema), login);

// Cookie-only endpoints — no body, no middleware.
// The refresh cookie is attached automatically by the browser.
authRouter.post("/refresh", refresh);
authRouter.post("/logout", logout);

// Protected — access token required in `Authorization: Bearer …`.
authRouter.get("/me", isAuthenticated, getMyProfile);
