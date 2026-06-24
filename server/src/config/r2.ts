import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

/**
 * S3-compatible client pointed at Cloudflare R2.
 * `region: "auto"` is the value R2 expects — it routes by account ID.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

/** Strip a trailing slash so `PUBLIC_URL + "/" + key` is always valid. */
export const R2_PUBLIC_URL = env.R2_PUBLIC_URL.replace(/\/$/, "");
export const R2_BUCKET = env.R2_BUCKET;
