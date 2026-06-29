import pino from "pino";
import { env } from "../config/env.js";

/**
 * Shared application logger.
 *
 * One instance — used by:
 *   - `pinoHttp({ logger })` in `app.ts` for per-request HTTP logs
 *   - Controllers / services via `import { logger } from "../utils/logger.js"`
 *
 * Output: raw JSON, one object per line, written to stdout.
 *
 * This is the production-standard approach. Log aggregators (Datadog,
 * CloudWatch Logs, ELK, Loki, etc.) ingest JSON natively and parse it
 * downstream. Pretty-printing belongs at the aggregator or in a separate
 * dev tool — never in the app's stdout, where it just adds CPU cost and
 * breaks log shipping.
 *
 * Levels (Pino convention, ascending severity):
 *   trace → debug → info → warn → error → fatal
 *
 * Set `LOG_LEVEL=debug` in `.env` to surface debug logs in dev.
 */
export const logger = pino({
  level: env.LOG_LEVEL ?? (env.NODE_ENV === "production" ? "info" : "debug"),
});