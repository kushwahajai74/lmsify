import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { R2_BUCKET, R2_PUBLIC_URL, r2 } from "../config/r2.js";
import { MIME_TO_EXT, type R2Folder } from "../utils/constants.js";

/**
 * Default URL expiry for presigned uploads — 10 minutes.
 * Frontend must `PUT` the file within this window or the URL 403s.
 */
const PRESIGN_EXPIRES_SECONDS = 10 * 60;

/**
 * Computes the R2 object key for a new upload.
 *
 * Ext resolution order:
 *   1. Explicit `ext` argument (server-driven `put` from a filename).
 *   2. MIME-type → extension lookup (browser-driven `presignPut` when the
 *      caller told us the content type upfront).
 *   3. `bin` fallback (shouldn't happen in practice — controllers validate
 *      the content type before reaching here).
 */
function makeKey(folder: R2Folder, ext: string): string {
  return `${folder}/${randomUUID()}.${ext}`;
}

export const storage = {
  /**
   * Presign a `PUT` URL for the browser to upload directly to R2.
   *
   * This is the only upload path — used for ALL file types (avatar, poster,
   * video). The server never holds the bytes, no matter the file size.
   *
   * Returns:
   *   - `uploadUrl`: one-time URL valid for `PRESIGN_EXPIRES_SECONDS`
   *   - `publicId`:  the R2 object key the upload will create
   *   - `url`:       the public read URL for the file after upload
   *   - `expiresIn`: seconds until `uploadUrl` 403s
   *
   * Frontend flow:
   *   1. Hit the presign endpoint, get back `{ uploadUrl, publicId, url }`
   *   2. `await fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })`
   *   3. Hit the create-record endpoint with `{ publicId, url }` to register
   *      the asset in Mongo.
   */
  async presignPut(
    folder: R2Folder,
    opts: { contentType?: string } = {},
  ): Promise<{ uploadUrl: string; publicId: string; url: string; expiresIn: number; }> {
    // Look up extension from MIME so the object key ends in `.png`/`.jpg`/etc.
    // Falls back to `bin` if the caller didn't pass a contentType or if the
    // MIME isn't in our map (defensive — controllers should have rejected it).
    const ext = (opts.contentType && MIME_TO_EXT[opts.contentType]) || "bin";
    const key = makeKey(folder, ext);
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      ContentType: opts.contentType,
    });
    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    });
    return {
      uploadUrl,
      publicId: key,
      url: `${R2_PUBLIC_URL}/${key}`,
      expiresIn: PRESIGN_EXPIRES_SECONDS,
    };
  },

  /**
   * Server-side upload for callers that already have a Buffer.
   *
   * Kept for edge cases (admin scripts, seeders, tests) — production code
   * uses `presignPut`. Same `{ publicId, url }` return shape.
   */
  async put(
    folder: R2Folder,
    body: Buffer,
    opts: { contentType?: string; filename?: string } = {},
  ) {
    const ext = opts.filename?.split(".").pop() ?? "bin";
    const key = makeKey(folder, ext);
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: opts.contentType,
      }),
    );
    return { publicId: key, url: `${R2_PUBLIC_URL}/${key}` };
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