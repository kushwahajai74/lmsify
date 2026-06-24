import { app } from "./app.js";
import { connectDB } from "./config/db.js";
import { redis } from "./config/redis.js";
import { env } from "./config/env.js";

/**
 * Boot order matters:
 *  1. env already parsed at import (config/env.ts)
 *  2. MongoDB must be up before routes hit it
 *  3. Redis ping — fail fast if it's unreachable
 *  4. Only then do we open the HTTP listener
 *
 * Any failure here exits the process so the orchestrator can restart us.
 */
(async () => {
  await connectDB();
  await redis.ping(); // throws on connection error → caught below
  app.listen(env.PORT, () => {
    console.log(`API on http://localhost:${env.PORT} 🚀`);
  });
})().catch((err) => {
  console.error("❌ Boot failed:", err);
  process.exit(1);
});