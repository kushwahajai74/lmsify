import { redis } from "../config/redis.js";

/**
 * Thin read-through cache helpers. Controllers use these directly; the
 * `cacheMiddleware` in `middlewares/cache.ts` is sugar over them.
 *
 * `del` uses SCAN, not KEYS — KEYS blocks the server on large keyspaces.
 */
export const cache = {
  async getJSON<T>(key: string): Promise<T | null> {
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  },

  async setJSON(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  },

  async del(prefix: string): Promise<void> {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  },
};
