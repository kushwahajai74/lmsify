import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "../config/r2.js";
import type { R2Folder } from "../utils/constants.js";
// Side-effect import: augments the global Express namespace with `Multer.File`.
import "multer";

/**
 * R2 (S3-compatible) wrapper for avatar / poster / video uploads.
 *
 * Returns the same `{ public_id, url }` shape controllers already consume,
 * so swapping Cloudinary for R2 doesn't ripple through the codebase.
 */
export const storage = {
  async put(folder: R2Folder, file: Express.Multer.File) {
    const ext = file.originalname.split(".").pop() ?? "";
    const key = `${folder}/${randomUUID()}.${ext}`;

    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    return { public_id: key, url: `${R2_PUBLIC_URL}/${key}` };
  },

  /** Delete is best-effort — we never want a 500 because R2 cleanup failed. */
  async delete(publicId?: string | null): Promise<void> {
    if (!publicId) return;
    try {
      await r2.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: publicId }));
    } catch (err) {
      console.warn(`⚠️ R2 delete failed for ${publicId}:`, err);
    }
  },
};
