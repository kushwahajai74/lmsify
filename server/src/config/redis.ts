import { Redis } from "ioredis";
import { env } from "./env.js";

/**
 * Shared Redis client. Imported by the cache service and middleware.
 * `lazyConnect: false` so connection failures crash boot — fail fast.
 */
export const redis = new Redis(env.REDIS_URL, { lazyConnect: false });

redis.on("connect", () => console.log("✅ Redis connected"));
redis.on("error", (err: Error) => console.error("❌ Redis error:", err.message));
