import type { NextFunction, Request, Response } from "express";
import { cache } from "../services/cacheService.js";

/**
 * Redis read-through middleware.
 *
 * Builds a key from the request, returns the cached body if present (with
 * `X-Cache: HIT`), otherwise sets `X-Cache: MISS`, intercepts the controller's
 * `res.json()` to populate the cache, and forwards to the next handler.
 *
 * Cache write failures are intentionally swallowed — a slow Redis must not
 * 500 a successful response.
 */
export const cacheMiddleware =
  (keyBuilder: (req: Request) => string, ttlSeconds: number) =>
  async (req: Request, res: Response, next: NextFunction) => {
    const key = `cache:${keyBuilder(req)}`;

    const hit = await cache.getJSON(key);
    if (hit) {
      res.setHeader("X-Cache", "HIT");
      return res.status(200).json(hit);
    }

    res.setHeader("X-Cache", "MISS");

    // Intercept res.json to write through to the cache on the way out.
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      cache.setJSON(key, body, ttlSeconds).catch(() => {
        // Best-effort — never block the response on cache writes.
      });
      return originalJson(body);
    };

    next();
  };