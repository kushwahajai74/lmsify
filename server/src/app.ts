import express from "express";
import { env } from "./config/env.js";

/**
 * Phase 1 app: just the root HTML ping so we can verify boot.
 * Middleware, routes, and the error handler land in later phases.
 */
export const app = express();

app.get("/", (_req, res) => {
  res.send(
    `<h1>Site is Working. click <a href="${env.FRONTEND_URL}">here</a> to visit frontend.</h1>`,
  );
});
