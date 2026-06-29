import { S3Client } from "@aws-sdk/client-s3";
import { env } from "./env.js";

/**
 * S3-compatible client pointed at Cloudflare R2.
 * `region: "auto"` is the value R2 expects — it routes by account ID.
 *
 * `requestChecksumCalculation: "WHEN_REQUIRED"` and
 * `responseChecksumValidation: "WHEN_REQUIRED"` opt out of the CRC32
 * checksums that newer AWS SDK versions (≥3.700) add by default. R2 doesn't
 * fully support those headers on presigned PUTs, which produced a
 * `SignatureDoesNotMatch` error when the SDK signed with one checksum
 * value but the browser PUT didn't send a matching header.
 */
export const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
  requestChecksumCalculation: "WHEN_REQUIRED",
  responseChecksumValidation: "WHEN_REQUIRED",
});

/** Strip a trailing slash so `PUBLIC_URL + "/" + key` is always valid. */
export const R2_PUBLIC_URL = env.R2_PUBLIC_URL.replace(/\/$/, "");
export const R2_BUCKET = env.R2_BUCKET;
