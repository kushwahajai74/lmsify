# CourseHub — TypeScript Implemetation Plan (Express + Node + MongoDB + R2 + Redis)

---

## 0. Scope decisions (locked 2026-06-24)

- **No email** — no `nodemailer`, no SMTP, no `sendEmail` service. Forgot/reset
  password and contact/request-course flows are removed (or stubbed if needed).
- **Per-course one-time payment** (was: site-wide subscription). Razorpay
  **Orders API** for one-time charges; user gets lifetime access on verified
  payment. No subscription entities, no recurring billing.
- **Admin sets the price per course** — `price` field on the Course document,
  set at create time. Stored in INR (₹), converted to paise on the way to
  Razorpay.
- **No refund flow** — `cancelSubscription` and `refundPayment` are removed.
  Admin can refund manually via the Razorpay dashboard. We still record
  successful payments.
- **Dependency policy** — use the latest stable at install time (Express 5,
  Mongoose 9, Zod 4, pino 10, multer 2, TypeScript 6). Plan snippets may need
  minor adjustments to match newer APIs (documented inline at the point of use).

- **Access token** — JWT, 15-minute lifetime, sent by the frontend as
  `Authorization: Bearer <token>` on every API request. Returned in the JSON
  body of `/login`, `/register`, and `/refresh`. Frontend holds it in memory
  (NOT localStorage — that would defeat XSS protection). Stateless — no DB
  hit on the hot path.
- **Refresh token** — JWT, 30-day lifetime, sent ONLY as an httpOnly cookie
  (`refreshToken`). The raw token is **never** in the response body and
  **never** in localStorage. The server stores a SHA-256 hash of the token
  in a `sessions` Mongo collection along with the user, a session
  `family` id, user-agent, and IP. Sessions are entirely in MongoDB — no
  Redis involvement for auth.
- **Rotation + reuse detection** — every `/refresh` issues a new access token
  AND a new refresh-token pair (new JWT, new `sessions` row, same `family`).
  The old `sessions` row is deleted. If a *deleted* refresh token is ever
  presented again, the server treats it as a stolen-token signal: it walks
  the `family` and deletes every row in it, forcing logout on every device
  the user logged in on.
- **Multi-device sessions** — each login (or refresh) creates a new row in
  `sessions` (same `family`). Users can have many active sessions. `/logout`
  deletes only the current cookie's row; the access token expires on its own
  within 15 min.
- **CORS** — `credentials: true` and `origin: env.FRONTEND_URL` so the
  refresh cookie rides along on cross-origin requests in dev.

---

## 1. Stack & rationale

| Concern | Choice | Why |
|---|---|---|
| Runtime | Node.js 20+ (LTS) | Familiar; `jsonwebtoken`, `multer`, `razorpay` all work |
| Language | **TypeScript** (strict) | The whole point of this migration |
| HTTP framework | **Express 5** | Matches existing skillset; the existing app is already Express |
| Database | **MongoDB** via **Mongoose 9** | Existing data lives here; no migration needed |
| File storage | **Cloudflare R2** via **AWS SDK v3 (`@aws-sdk/client-s3`)** | R2 is S3-compatible — drop-in for `cloudinary` |
| Cache / rate limit | **Redis** via **ioredis** | `coursehub-cache` for `GET /courses` list, `GET /courses/:id` |
| Auth | `jsonwebtoken` (HS256, 15d) + bcrypt (10 rounds) | Same as today |
| File upload | `multer` (memory storage) → R2 stream | No base64; just `PutObjectCommand` with `Body: file.buffer` |
| Validation | **Zod 4** + `express` adapter | Type-safe request bodies |
| Logging | `pino` + `pino-http` | Structured JSON logs |
| CORS | `cors` | Same as today |
| Process manager | `tsx` for dev, `tsc` for prod build | Vite-style DX for the API |

**Removed:** `cloudinary`, `datauri`, `validator` (replaced by Zod's `.email()`), `node-cron` (never used), `nodemailer` (no email in this build).

---

## 2. Repository layout (final)

```
server/
├── package.json
├── tsconfig.json
├── .env.example
├── .gitignore
├── src/
│   ├── index.ts                     # boot: connect DB + Redis, listen
│   ├── app.ts                       # express app: middleware + routes + error handler
│   ├── config/
│   │   ├── env.ts                   # zod-parsed process.env (single source of truth)
│   │   ├── db.ts                    # mongoose.connect
│   │   ├── redis.ts                 # ioredis client
│   │   └── r2.ts                    # S3Client pointed at R2
│   ├── models/
│   │   ├── userModel.ts             # mongoose schema
│   │   ├── courseModel.ts
│   │   └── paymentModel.ts
│   ├── middlewares/
│   │   ├── auth.ts                  # isAuthenticated, authorizeAdmin, authorizeCourseAccess
│   │   ├── upload.ts                # multer memory storage (single field "file")
│   │   ├── error.ts                 # global error handler (JSON: { success, message })
│   │   ├── validate.ts              # zod request validator factory
│   │   └── cache.ts                 # redis read-through middleware
│   ├── routes/
│   │   ├── authRoutes.ts            # /api/v1/{register,login,logout,changepassword}
│   │   ├── userRoutes.ts            # /api/v1/{me,updateprofile,updateprofilepicture,addtoplaylist,removefromplaylist,admin/users}
│   │   ├── courseRoutes.ts          # /api/v1/{courses, courses/:id, lectures}
│   │   ├── paymentRoutes.ts         # /api/v1/{createorder, paymentverification, razorpaykey}
│   │   └── otherRoutes.ts           # (empty — placeholder for future non-email endpoints)
│   ├── controllers/
│   │   ├── authController.ts
│   │   ├── userController.ts
│   │   ├── courseController.ts
│   │   ├── paymentController.ts
│   │   └── otherController.ts       # empty
│   ├── services/
│   │   ├── storageService.ts        # R2 upload/delete wrapper
│   │   ├── tokenService.ts          # JWT sign + cookie set/clear
│   │   ├── cacheService.ts          # redis helpers (getJSON, setJSON, del)
│   │   └── paymentService.ts        # razorpay HMAC verify, subscription create/cancel
│   ├── schemas/                     # zod request schemas
│   │   ├── common.schema.ts
│   │   ├── user.schema.ts
│   │   ├── course.schema.ts
│   │   └── payment.schema.ts
│   ├── utils/
│   │   ├── AppError.ts              # custom Error subclass
│   │   ├── catchAsync.ts            # async handler wrapper
│   │   └── constants.ts             # cookie names, TTLs, R2 folder names
│   └── types/
│       └── express.d.ts             # augments Request with `user`, `file`
└── README.md
```

---

## 3. Environment variables

```ini
# .env.example
NODE_ENV=development
PORT=4000
FRONTEND_URL=http://localhost:5173

# Mongo
MONGO_URI=mongodb://localhost:27017/coursehub

# Redis
REDIS_URL=redis://localhost:6379

# JWT (shared by both access and refresh tokens; secrets may differ in prod)
JWT_SECRET=replace-with-32-byte-random-string
JWT_REFRESH_SECRET=replace-with-different-32-byte-random-string

# Auth lifetimes (use the units below)
ACCESS_TOKEN_TTL=15m          # access token JWT expiry
REFRESH_TOKEN_TTL_DAYS=30     # refresh token lifetime in days

# Cloudflare R2 (S3-compatible)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=coursehub-media
R2_PUBLIC_URL=https://pub-XXXX.r2.dev       # or custom domain

# Razorpay (Orders API for one-time per-course payments)
RAZORPAY_API_KEY=
RAZORPAY_API_SECRET=
```

All parsed by a single Zod schema in `config/env.ts`. Mismatch → process crashes at boot (fail fast, no surprise 500s in prod).

---

## 4. Models (Mongoose)

### `models/userModel.ts`
```ts
const userSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6, select: false },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  avatar: {
    public_id: { type: String, required: true },   // R2 object key
    url:       { type: String, required: true },
  },
  // Courses the user has bought (lifetime access). Populated by paymentController.
  purchasedCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
  playlist: [{ course: { type: Schema.Types.ObjectId, ref: "Course" }, poster: String }],
  createdAt: { type: Date, default: Date.now },
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = (p: string) => bcrypt.compare(p, this.password);

// NOTE: `getJWTToken` was REMOVED — JWT signing is the token service's job.
// The model stays a pure data shape with only auth-relevant business logic
// (password hashing, compare).

export const User = model<IUser>("User", userSchema);
```

### `models/sessionModel.ts`

```ts
/**
 * Server-side session store. One row per active (user, device) login.
 *
 * We hash the refresh JWT before storing so a DB leak doesn't let an
 * attacker forge new access tokens. The raw JWT only ever lives in:
 *   - the httpOnly cookie on the user's device
 *   - the server's response to /login, /register, /refresh
 *
 * Rotation: every /refresh deletes the current row and creates a new one
 * with the same `family` id. Reuse-detection: presenting a deleted row's
 * token is treated as theft → every row in the family is deleted.
 */
const sessionSchema = new Schema({
  // SHA-256 of the raw refresh-token JWT (hex). Unique because one token
  // can only authorise one active session.
  tokenHash: { type: String, required: true, unique: true, index: true },

  user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },

  // Family identifier — shared across rotations of the same login.
  // Scopes reuse-detection: when a rotated token is replayed, every token
  // in the same family is revoked.
  family: { type: String, required: true, index: true },

  // Diagnostics + future "active sessions" UI.
  userAgent: String,
  ip: String,

  expiresAt: { type: Date, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

// Mongo TTL index: row is auto-removed once `expiresAt` passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession>("Session", sessionSchema);
```

### `models/courseModel.ts`
```ts
const lectureSchema = new Schema({
  title:       { type: String, required: true },
  description: { type: String, required: true },
  video:       { public_id: { type: String, required: true }, url: { type: String, required: true } },
}, { _id: true });

const courseSchema = new Schema({
  title:       { type: String, required: true, minlength: 5, maxlength: 50 },
  description: { type: String, required: true, minlength: 5 },
  category:    { type: String, required: true },
  createdBy:   { type: String, required: true },
  // Price in INR (rupees, not paise). Multiply by 100 when handing to Razorpay.
  // `0` means free.
  price:       { type: Number, required: true, min: 0, default: 0 },
  poster:      { public_id: { type: String, required: true }, url: { type: String, required: true } },
  lectures:    [lectureSchema],
  views:       { type: Number, default: 0 },
  numberOfVideos: { type: Number, default: 0 },
}, { timestamps: true });

courseSchema.index({ title: "text", category: "text" });   // for /courses search

export const Course = model<ICourse>("Course", courseSchema);
```

**Why embedded lectures:** the legacy model embedded them; preserving this means no data migration for the Mongo collection.

### `models/paymentModel.ts`
```ts
const paymentSchema = new Schema({
  razorpay_payment_id:      { type: String, required: true },
  razorpay_subscription_id: { type: String, required: true, index: true },
  razorpay_signature:       { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});
export const Payment = model<IPayment>("Payment", paymentSchema);
```

---

## 5. Services (business logic)

### `services/storageService.ts` — R2 wrapper

R2 is S3-compatible. The AWS SDK v3 (`@aws-sdk/client-s3`) streams buffers and provides a presigned `GetObjectCommand` for private reads.

```ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { randomUUID } from "node:crypto";

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

const PUBLIC_URL = env.R2_PUBLIC_URL.replace(/\/$/, "");

export const storage = {
  async put(folder: "avatars" | "posters" | "videos", file: Express.Multer.File) {
    const ext = file.originalname.split(".").pop() ?? "";
    const key = `${folder}/${randomUUID()}.${ext}`;
    await r2.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    }));
    return { public_id: key, url: `${PUBLIC_URL}/${key}` };
  },

  async delete(publicId?: string | null) {
    if (!publicId) return;
    try { await r2.send(new DeleteObjectCommand({ Bucket: env.R2_BUCKET, Key: publicId })); }
    catch (e) { console.warn("R2 delete failed", publicId, e); }
  },
};
```

**Why this replaces Cloudinary cleanly:** the existing controllers already pass `public_id` + `url` pairs around — we keep that shape. No `datauri`, no base64.

### `services/tokenService.ts`

```ts
import type { Response } from "express";
// `jsonwebtoken` is CommonJS — default import under NodeNext is the module itself.
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { env } from "../config/env.js";

/** Access-token payload — read by `isAuthenticated` on every protected route. */
export interface AccessTokenPayload {
  userId: string;
}

/** Refresh-token payload — read only by `/refresh` and `/logout`. */
export interface RefreshTokenPayload {
  userId: string;
  /** Session family id — reused through rotation, used to scope theft response. */
  family: string;
}

/** SHA-256 hex of any string. Used to derive the session lookup key from the raw JWT. */
export function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/** Signs a 15-minute access token. Stateless — no DB write. */
export function signAccessToken(userId: string): string {
  const payload: AccessTokenPayload = { userId };
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: env.ACCESS_TOKEN_TTL });
}

/** Signs a 30-day refresh token. Caller is responsible for hashing + storing. */
export function signRefreshToken(userId: string, family: string): string {
  const payload: RefreshTokenPayload = { userId, family };
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: `${env.REFRESH_TOKEN_TTL_DAYS}d` });
}

/** Verifies an access token. Throws on invalid/expired — caller wraps in try/catch. */
export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_SECRET) as AccessTokenPayload;
}

/** Verifies a refresh token. Throws on invalid/expired. */
export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** Generates a new family id (one per login session). */
export function newFamily(): string {
  return crypto.randomUUID();
}
```

### `services/sessionService.ts`

```ts
import { Session } from "../models/sessionModel.js";
import { sha256 } from "./tokenService.js";
import type { RefreshTokenPayload } from "./tokenService.js";
import { env } from "../config/env.js";

/** TTL for `expiresAt` on every new session row. */
function expiresAt(): Date {
  const d = new Date();
  d.setDate(d.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return d;
}

export const sessionService = {
  /** Persist a new session after login/refresh. */
  async create(opts: {
    payload: RefreshTokenPayload;
    rawToken: string;
    userAgent?: string;
    ip?: string;
  }) {
    await Session.create({
      tokenHash: sha256(opts.rawToken),
      user: opts.payload.userId,
      family: opts.payload.family,
      userAgent: opts.userAgent,
      ip: opts.ip,
      expiresAt: expiresAt(),
    });
  },

  /** Look up a session by its raw JWT (after verification). Returns null if expired/revoked. */
  async findByRawToken(rawToken: string) {
    return Session.findOne({ tokenHash: sha256(rawToken) });
  },

  /** Delete a single session — used by /logout. */
  async deleteByRawToken(rawToken: string) {
    await Session.deleteOne({ tokenHash: sha256(rawToken) });
  },

  /** Rotate: delete the old row, return the row count (0 = already gone → reuse). */
  async rotate(rawToken: string): Promise<number> {
    const res = await Session.deleteOne({ tokenHash: sha256(rawToken) });
    return res.deletedCount ?? 0;
  },

  /**
   * Reuse-detection: delete every session in the family. Returns how many
   * were killed (for logging). Called when a deleted token is presented.
   */
  async revokeFamily(family: string): Promise<number> {
    const res = await Session.deleteMany({ family });
    return res.deletedCount ?? 0;
  },

  /** List active sessions for a user — powers the future admin/UI endpoint. */
  async listForUser(userId: string) {
    return Session.find({ user: userId }).sort({ createdAt: -1 }).lean();
  },
};
```

### `services/emailService.ts`

> **Removed** — no email in this build. If we add transactional email later
> (password reset, receipts, etc.), create this file fresh and re-add
> `nodemailer` to the dependency list.

### `services/cacheService.ts`
```ts
import Redis from "ioredis";
export const redis = new Redis(env.REDIS_URL, { lazyConnect: false });

export const cache = {
  async getJSON<T>(key: string): Promise<T | null> {
    const v = await redis.get(key);
    return v ? (JSON.parse(v) as T) : null;
  },
  async setJSON(key: string, value: unknown, ttlSeconds: number) {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds);
  },
  async del(prefix: string) {
    // Use SCAN to delete by prefix without blocking the server.
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
  },
};
```

**Cache strategy (same as the Workers plan):**
| Endpoint | Key pattern | TTL | Invalidated by |
|---|---|---|---|
| `GET /courses` | `cache:courses:{keyword}:{category}` | 5 min | course create/delete |
| `GET /courses/:id` | `cache:course:{id}` | 1 hour | lecture add/delete |
| `GET /admin/users` | `cache:admin:users` | 2 min | user role change / delete |
| `GET /me` | — | — | never (user-specific) |

### `services/paymentService.ts`
```ts
import crypto from "node:crypto";
import Razorpay from "razorpay";
import { env } from "../config/env.js";

/**
 * Single Razorpay client. Re-used across all payment operations.
 */
export const razorpay = new Razorpay({
  key_id: env.RAZORPAY_API_KEY,
  key_secret: env.RAZORPAY_API_SECRET,
});

/**
 * Verifies the HMAC-SHA256 signature Razorpay sends back after a payment.
 *
 * For Orders API the signed string is `${orderId}|${paymentId}`.
 * Returns `true` only if the computed digest matches the signature byte-for-byte.
 */
export function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
): boolean {
  const expected = crypto
    .createHmac("sha256", env.RAZORPAY_API_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected, "hex");
  const signatureBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== signatureBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, signatureBuf);
}

/** Create a one-time order for a course purchase. Amount is in paise. */
export async function createOrder(opts: {
  amountPaise: number;
  courseId: string;
  userId: string;
}) {
  return razorpay.orders.create({
    amount: opts.amountPaise,
    currency: "INR",
    notes: { courseId: opts.courseId, userId: opts.userId },
  });
}

/** Look up a payment record (used after verification to confirm capture). */
export async function fetchPayment(paymentId: string) {
  return razorpay.payments.fetch(paymentId);
}
```

---

## 6. Middleware

### `middlewares/auth.ts`

```ts
import { verifyAccessToken } from "../services/tokenService.js";

/**
 * Reads the access token from the `Authorization: Bearer …` header, verifies
 * it, loads the user, and attaches it to `req.user`. Refresh tokens live in
 * cookies and are NOT used by this middleware — they are handled by the
 * /refresh endpoint only.
 */
export async function isAuthenticated(req, _res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return next(new AppError("Please login to access this resource", 401));
  }
  const token = header.slice("Bearer ".length).trim();
  if (!token) return next(new AppError("Please login to access this resource", 401));

  try {
    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.userId);
    if (!user) return next(new AppError("User not found", 404));
    req.user = user;
    next();
  } catch {
    next(new AppError("Invalid or expired access token", 401));
  }
}

export function authorizeAdmin(req, _res, next) {
  if (req.user?.role !== "admin") return next(new AppError("Admin access denied", 403));
  next();
}

/**
 * Gate course-content endpoints on payment. Admins always pass.
 * Logic: the user has paid for this course OR they're an admin.
 * The middleware checks `req.params.id` against `req.user.purchasedCourses`.
 */
export function authorizeCourseAccess(req, _res, next) {
  if (req.user?.role === "admin") return next();
  const courseId = req.params.id;
  const owns = req.user?.purchasedCourses?.some((c) => c.toString() === courseId);
  if (!owns) return next(new AppError("Please purchase this course to access its content", 403));
  next();
}
```

### `middlewares/upload.ts`
```ts
import multer from "multer";
export const singleUpload = multer({ storage: multer.memoryStorage() }).single("file");
```

### `middlewares/validate.ts` — Zod factory
```ts
import { AnyZodObject } from "zod";
export const validate =
  (schema: AnyZodObject, source: "body" | "query" | "params" = "body") =>
  (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const message = result.error.issues
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; ");
      return next(new AppError(message, 400));
    }
    // Replace with parsed (coerced) value
    (req as any)[source] = result.data;
    next();
  };
```

### `middlewares/cache.ts` — Redis read-through
```ts
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
    // Intercept res.json to cache on the way out
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      cache.setJSON(key, body, ttlSeconds).catch(() => {});
      return originalJson(body);
    };
    next();
  };
```

### `middlewares/error.ts` — global error handler
```ts
export function errorHandler(err, _req, res, _next) {
  const statusCode = err instanceof AppError ? err.statusCode : 500;
  const message = err.message || "Internal Server Error";
  if (statusCode >= 500) console.error(err);
  res.status(statusCode).json({ success: false, message });
}
```

**Bug fix:** the legacy code put `app.use(errorHandler)` *after* `export default app`, so the handler never ran. New code wires it before `app.listen`.

---

## 7. Zod request schemas

### `schemas/user.schema.ts`
```ts
export const registerSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
});
export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export const changePasswordSchema = z.object({
  oldPassword: z.string().min(1),
  newPassword: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine(d => d.newPassword === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
export const updateProfileSchema = z.object({
  name: z.string().min(2).optional(),
  email: z.string().email().optional(),
});
export const forgetPasswordSchema = z.object({ email: z.string().email() });
export const resetPasswordSchema = z.object({
  password: z.string().min(6),
  confirmPassword: z.string().min(6),
}).refine(d => d.password === d.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });
export const addToPlaylistSchema = z.object({ id: z.string().min(1) });
export const removeFromPlaylistQuerySchema = z.object({ id: z.string().min(1) });
```

### `schemas/course.schema.ts`
```ts
export const createCourseSchema = z.object({
  title: z.string().min(5).max(50),
  description: z.string().min(5),
  category: z.string().min(1),
  createdBy: z.string().min(1),
});
export const addLectureSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
});
export const deleteLectureQuerySchema = z.object({
  courseId: z.string().min(1),
  lectureId: z.string().min(1),
});
```

### `schemas/payment.schema.ts`
```ts
export const paymentVerificationSchema = z.object({
  razorpay_payment_id: z.string().min(1),
  razorpay_subscription_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});
```

### `schemas/common.schema.ts`
```ts
export const paginationSchema = z.object({
  keyword: z.string().optional(),
  category: z.string().optional(),
});
```

---

## 8. Controllers — full logic

Every controller below is wrapped by `catchAsync` so thrown `AppError`s land in the global error handler.

### `controllers/authController.ts`

```ts
import {
  signAccessToken,
  signRefreshToken,
  newFamily,
  verifyRefreshToken,
} from "../services/tokenService.js";
import { sessionService } from "../services/sessionService.js";
import { env } from "../config/env.js";
import { REFRESH_COOKIE } from "../utils/constants.js";

/**
 * Helper: issue an access + refresh token pair, persist the session, and
 * set the refresh cookie. Returns the access token (caller puts it in body).
 */
async function issueSession(
  res: Response,
  userId: string,
  meta: { userAgent?: string; ip?: string; family?: string },
) {
  const family = meta.family ?? newFamily();
  const accessToken = signAccessToken(userId);
  const refreshToken = signRefreshToken(userId, family);

  await sessionService.create({
    payload: { _id: userId, family },
    rawToken: refreshToken,
    userAgent: meta.userAgent,
    ip: meta.ip,
  });

  setRefreshCookie(res, refreshToken);
  return { accessToken, refreshToken };
}

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/v1/auth", // cookie only sent to /auth endpoints
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

function clearRefreshCookie(res: Response) {
  res.cookie(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax",
    path: "/api/v1/auth",
    expires: new Date(0),
  });
}

export const register = catchAsync(async (req, res) => {
  const { name, email, password } = req.body as RegisterBody;
  const existing = await User.findOne({ email });
  if (existing) throw new AppError("User already exists with this email", 400);
  if (!req.file) throw new AppError("Avatar image is required", 400);

  const avatar = await storage.put("avatars", req.file);
  const user = await User.create({ name, email, password, avatar });

  const { accessToken } = await issueSession(res, user._id.toString(), {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  res.status(201).json({
    success: true,
    message: "Registered successfully",
    accessToken,
    user: toClient(user),
  });
});

export const login = catchAsync(async (req, res) => {
  const { email, password } = req.body as LoginBody;
  const user = await User.findOne({ email }).select("+password");
  if (!user) throw new AppError("Invalid email or password", 401);
  const ok = await user.comparePassword(password);
  if (!ok) throw new AppError("Invalid email or password", 401);

  const { accessToken } = await issueSession(res, user._id.toString(), {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
  });

  res.status(200).json({
    success: true,
    message: `Welcome back, ${user.name}`,
    accessToken,
    user: toClient(user),
  });
});

/**
 * Single-device logout. Reads the refresh cookie, deletes its session row,
 * clears the cookie. The access token naturally expires within 15 min —
 * the client should drop it from memory immediately.
 */
export const logout = catchAsync(async (req, res) => {
  const token = req.cookies[REFRESH_COOKIE];
  if (token) await sessionService.deleteByRawToken(token);
  clearRefreshCookie(res);
  res.json({ success: true, message: "Logged out successfully" });
});

/**
 * Silent refresh. Reads the refresh cookie, verifies it, rotates the session,
 * issues a fresh access + refresh pair. Reuse-detection: if the token's
 * session row is missing, the JWT is still valid, AND the family has other
 * live sessions → revoke the family (theft response) and 401.
 */
export const refresh = catchAsync(async (req, res) => {
  const raw = req.cookies[REFRESH_COOKIE];
  if (!raw) throw new AppError("No refresh token", 401);

  let payload;
  try {
    payload = verifyRefreshToken(raw);
  } catch {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const existing = await sessionService.findByRawToken(raw);
  if (!existing) {
    // Token was already rotated OR never existed. If the JWT itself is
    // valid (we got here) and the family still has other sessions, treat
    // it as theft. Otherwise it's a normal expiry.
    const stolen = await Session.countDocuments({ family: payload.family });
    if (stolen > 0) {
      await sessionService.revokeFamily(payload.family);
      console.warn(`🚨 Refresh-token reuse detected for family ${payload.family} — revoked`);
    }
    clearRefreshCookie(res);
    throw new AppError("Refresh token revoked", 401);
  }

  // Happy path: rotate.
  await sessionService.rotate(raw);

  const { accessToken } = await issueSession(res, payload.userId, {
    userAgent: req.headers["user-agent"],
    ip: req.ip,
    family: payload.family,
  });

  res.json({ success: true, accessToken });
});

export const changePassword = catchAsync(async (req, res) => {
  const { oldPassword, newPassword } = req.body;
  const user = await User.findById(req.user._id).select("+password");
  if (!user) throw new AppError("User not found", 404);
  const ok = await user.comparePassword(oldPassword);
  if (!ok) throw new AppError("Old password is incorrect", 400);
  user.password = newPassword;
  await user.save();   // pre-save hook hashes it
  res.json({ success: true, message: "Password changed successfully" });
});

// `forgetPassword` and `resetPassword` were REMOVED because we have no email
// service. Users who lose their password must contact the admin to reset it
// out-of-band (or we add a password-recovery channel in a future build).
```

### `controllers/userController.ts`

```ts
export const getMyProfile = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  res.json({ success: true, user: toClient(user!) });
});

export const deleteAccount = catchAsync(async (req, res) => {
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);
  await storage.delete(user.avatar.public_id);
  await user.deleteOne();
  clearToken(res);
  res.json({ success: true, message: "Account deleted successfully" });
});

export const updateProfile = catchAsync(async (req, res) => {
  const { name, email } = req.body;
  const user = await User.findByIdAndUpdate(req.user._id, { name, email }, { new: true });
  if (!user) throw new AppError("User not found", 404);
  res.json({ success: true, message: "Profile updated successfully" });
});

export const updateProfilePicture = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Avatar image is required", 400);
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);

  await storage.delete(user.avatar.public_id);
  const avatar = await storage.put("avatars", req.file);
  user.avatar = avatar;
  await user.save();
  res.json({ success: true, message: "Profile picture updated successfully" });
});

export const addToPlaylist = catchAsync(async (req, res) => {
  const { id } = req.body as { id: string };
  const course = await Course.findById(id);
  if (!course) throw new AppError("Course not found", 404);
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);
  if (user.playlist.some((p) => p.course?.toString() === course._id.toString())) {
    return res.json({ success: true, message: "Already in playlist" });
  }
  user.playlist.push({ course: course._id, poster: course.poster.url });
  await user.save();
  res.json({ success: true, message: "Added to playlist" });
});

export const removeFromPlaylist = catchAsync(async (req, res) => {
  const { id } = req.query as { id: string };
  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);
  user.playlist = user.playlist.filter((p) => p.course?.toString() !== id);
  await user.save();
  res.json({ success: true, message: "Removed from playlist" });
});

export const getAllUsers = catchAsync(async (_req, res) => {
  const users = await User.find();
  res.json({ success: true, users: users.map(toClient) });
});

export const updateUserRole = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  user.role = user.role === "admin" ? "user" : "admin";
  await user.save();
  await cache.del("cache:admin:users");
  res.json({ success: true, message: `Role updated to ${user.role}` });
});

export const deleteUser = catchAsync(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404);
  await storage.delete(user.avatar.public_id);
  await user.deleteOne();
  await cache.del("cache:admin:users");
  res.json({ success: true, message: `User ${user.name} deleted` });
});
```

### `controllers/courseController.ts`

```ts
export const getCourses = catchAsync(async (req, res) => {
  const { keyword, category } = req.query as { keyword?: string; category?: string };
  const filter: FilterQuery<ICourse> = {};
  if (keyword)  filter.$or  = [{ title: { $regex: keyword, $options: "i" } }, { category: { $regex: keyword, $options: "i" } }];
  if (category) filter.category = { $regex: category, $options: "i" };
  const courses = await Course.find(filter).select("-lectures");
  res.json({ success: true, courses });
});

export const createCourse = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Poster image is required", 400);
  const { title, description, category, createdBy } = req.body;
  const poster = await storage.put("posters", req.file);
  await Course.create({ title, description, category, createdBy, poster });
  await cache.del("cache:courses:");        // invalidate list cache
  res.json({ success: true, message: "Course created successfully" });
});

export const getCourseLectures = catchAsync(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new AppError("Course not found", 404);
  course.views += 1;
  await course.save();
  res.json({ success: true, lectures: course.lectures });
});

export const addLectures = catchAsync(async (req, res) => {
  if (!req.file) throw new AppError("Video file is required", 400);
  const course = await Course.findById(req.params.id);
  if (!course) throw new AppError("Course not found", 404);
  const { title, description } = req.body;
  const video = await storage.put("videos", req.file);
  course.lectures.push({ title, description, video });
  course.numberOfVideos = course.lectures.length;
  await course.save();
  await cache.del(`cache:course:${course._id}`);
  res.json({ success: true, message: "Lecture added successfully" });
});

export const deleteCourse = catchAsync(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) throw new AppError("Course not found", 404);
  await storage.delete(course.poster.public_id);
  await Promise.all(course.lectures.map((l) => storage.delete(l.video.public_id)));
  await course.deleteOne();
  await cache.del("cache:courses:");
  await cache.del(`cache:course:${course._id}`);
  res.json({ success: true, message: "Course deleted successfully" });
});

export const deleteLectures = catchAsync(async (req, res) => {
  const { courseId, lectureId } = req.query as { courseId: string; lectureId: string };
  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);
  const lecture = course.lectures.id(lectureId);
  if (!lecture) throw new AppError("Lecture not found", 404);
  await storage.delete(lecture.video.public_id);
  lecture.deleteOne();
  course.numberOfVideos = course.lectures.length;
  await course.save();
  await cache.del(`cache:course:${courseId}`);
  res.json({ success: true, message: "Lecture deleted successfully" });
});
```

### `controllers/paymentController.ts`

```ts
/**
 * User clicks "Buy" on a course → server creates a Razorpay order and returns
 * `{ orderId, amount, currency, key }` to the frontend. Frontend opens the
 * Razorpay Checkout widget with those values.
 *
 * On success the frontend posts the payment details to /paymentverification.
 */
export const createCourseOrder = catchAsync(async (req, res) => {
  const { courseId } = req.body as { courseId: string };

  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);
  if (course.price <= 0) throw new AppError("This course is free — no payment needed", 400);

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);

  // Idempotency: if user already paid for this course, return success.
  const alreadyPaid = await Payment.findOne({
    user: user._id,
    course: course._id,
    status: "captured",
  });
  if (alreadyPaid) {
    return res.status(200).json({
      success: true,
      message: "You already own this course",
      alreadyPaid: true,
    });
  }

  const amountPaise = course.price * 100; // INR → paise
  const order = await createOrder({
    amountPaise,
    courseId: course._id.toString(),
    userId: user._id.toString(),
  });

  res.status(201).json({
    success: true,
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: env.RAZORPAY_API_KEY,
    course: { id: course._id, title: course.title, price: course.price },
  });
});

/**
 * Frontend posts the Razorpay response here after Checkout closes.
 * We verify the HMAC signature, then either record the payment + grant access
 * (push course into user.purchasedCourses) or redirect to /paymentfail.
 */
export const paymentVerification = catchAsync(async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    courseId,
  } = req.body as {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    courseId: string;
  };

  const isAuthentic = verifyRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
  );
  if (!isAuthentic) return res.redirect(`${env.FRONTEND_URL}/paymentfail`);

  const user = await User.findById(req.user._id);
  if (!user) throw new AppError("User not found", 404);
  const course = await Course.findById(courseId);
  if (!course) throw new AppError("Course not found", 404);

  // Idempotent re-verification: if Payment already exists, just redirect.
  const existing = await Payment.findOne({ razorpay_order_id });
  if (existing) {
    return res.redirect(`${env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`);
  }

  await Payment.create({
    user: user._id,
    course: course._id,
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    amount: course.price,
    currency: "INR",
    status: "captured",
  });

  if (!user.purchasedCourses.some((id) => id.toString() === course._id.toString())) {
    user.purchasedCourses.push(course._id);
    await user.save();
  }

  return res.redirect(`${env.FRONTEND_URL}/paymentsuccess?reference=${razorpay_payment_id}`);
});

export const getRazorpayKey = catchAsync(async (_req, res) => {
  res.status(200).json({ success: true, key: env.RAZORPAY_API_KEY });
});
```

### `controllers/otherController.ts`

> Email-based contact / course-request endpoints are **removed** (no email
> service). If we need a non-email contact channel later (e.g. an in-app inbox),
> we can add it back as a Mongoose model + simple CRUD.

```ts
// Currently empty — `otherRoutes.ts` is mounted for future expansion but
// exposes no endpoints.
export {};

---

## 9. Routes (final wiring)

### `routes/authRoutes.ts`

> All `/auth/*` endpoints receive the refresh cookie (cookie was set with
> `path: "/api/v1/auth"`). Other endpoints never see the refresh token.

```ts
router.post("/register",        singleUpload, validate(registerSchema), register);
router.post("/login",                     validate(loginSchema),    login);
router.post("/refresh",                                                   refresh); // uses cookie
router.post("/logout",                                                   logout);  // uses cookie
router.put ("/changepassword", isAuthenticated, validate(changePasswordSchema), changePassword);
// /forgetpassword and /resetpassword/:token removed — no email service.
```

### `routes/userRoutes.ts`
```ts
router.get   ("/me",                    isAuthenticated,                                  getMyProfile);
router.delete("/me",                    isAuthenticated,                                  deleteAccount);
router.put   ("/updateprofile",         isAuthenticated, validate(updateProfileSchema),   updateProfile);
router.put   ("/updateprofilepicture",  isAuthenticated, singleUpload,                   updateProfilePicture);
router.post  ("/addtoplaylist",         isAuthenticated, validate(addToPlaylistSchema),   addToPlaylist);
router.delete("/removefromplaylist",    isAuthenticated, validate(removeFromPlaylistQuerySchema, "query"), removeFromPlaylist);

router.get   ("/admin/users",           isAuthenticated, authorizeAdmin,                  getAllUsers);
router.put   ("/admin/users/:id",       isAuthenticated, authorizeAdmin,                  updateUserRole);
router.delete("/admin/users/:id",       isAuthenticated, authorizeAdmin,                  deleteUser);
```

### `routes/courseRoutes.ts`
```ts
router.get   ("/courses",
  validate(paginationSchema, "query"),
  cacheMiddleware(req => `courses:${req.query.keyword ?? ""}:${req.query.category ?? ""}`, 300),
  getCourses);

router.post  ("/courses",               isAuthenticated, authorizeAdmin, singleUpload, validate(createCourseSchema), createCourse);
router.get   ("/courses/:id",           isAuthenticated, authorizeCourseAccess,
  cacheMiddleware(req => `course:${req.params.id}`, 3600),
  getCourseLectures);
router.post  ("/courses/:id",           isAuthenticated, authorizeAdmin, singleUpload, validate(addLectureSchema), addLectures);
router.delete("/courses/:id",           isAuthenticated, authorizeAdmin, deleteCourse);

router.delete("/lectures",              isAuthenticated, authorizeAdmin,
  validate(deleteLectureQuerySchema, "query"),
  deleteLectures);
```

### `routes/paymentRoutes.ts`
```ts
router.post("/createorder",           isAuthenticated, validate(createOrderSchema),        createCourseOrder);
router.post("/paymentverification",   isAuthenticated, validate(paymentVerificationSchema), paymentVerification);
router.get ("/razorpaykey",           isAuthenticated,                                    getRazorpayKey);
```

### `routes/otherRoutes.ts`
```ts
// Intentionally empty — contact / request-course endpoints removed with the
// email service. Mount this router anyway so adding non-email endpoints later
// is a one-line change.
```

### `app.ts`
```ts
import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import pinoHttp from "pino-http";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/error";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import courseRoutes from "./routes/courseRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import otherRoutes from "./routes/otherRoutes";

export const app = express();

app.use(pinoHttp());
app.use(express.json({ limit: "5mb" }));     // R2 PUT body — videos can be large
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true, methods: ["GET","POST","PUT","DELETE"] }));

app.get("/", (_req, res) => res.send(`<h1>Site is Working. click <a href="${env.FRONTEND_URL}">here</a> to visit frontend.</h1>`));

app.use("/api/v1", authRoutes);
app.use("/api/v1", userRoutes);
app.use("/api/v1", courseRoutes);
app.use("/api/v1", paymentRoutes);
app.use("/api/v1", otherRoutes);

app.use(errorHandler);     // <-- registered BEFORE listen, fixing legacy bug
```

### `index.ts`
```ts
import { app } from "./app";
import { connectDB } from "./config/db";
import { redis } from "./services/cacheService";
import { env } from "./config/env";

(async () => {
  await connectDB();
  await redis.ping();       // fail fast if Redis is down
  app.listen(env.PORT, () => console.log(`API on :${env.PORT} 🚀`));
})();
```
```

`tsconfig.json` (strict, ESM, NodeNext):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

---

## 11. Verification plan

After every slice:
```bash
cd server
npm install
npm run typecheck
npm run dev                              # localhost:4000
curl http://localhost:4000/              # HTML ping
curl http://localhost:4000/api/v1/courses
# Login flow:
curl -c /tmp/c.txt -X POST localhost:4000/api/v1/login \
  -H 'content-type: application/json' \
  -d '{"email":"x@x.com","password":"secret123"}'
curl -b /tmp/c.txt localhost:4000/api/v1/me
```

End-to-end smoke test (matches the migration plan §"Verification"):
1. Register with avatar → cookie set → 201 + user body
2. Login → cookie set → 201 + user body
3. `GET /me` returns the user
4. Browse `/courses` → keyword/category filter works
5. **Purchase flow**: create order → Razorpay test card → verify → `/paymentsuccess?reference=...`
6. Open a purchased course → lectures returned (denied before purchase)
7. Admin: create course (poster + price) → add lecture (video upload) → delete course → R2 objects cleaned up
8. Admin: list users → toggle role → delete user
9. Logout → cookie cleared
10. Change password while logged in → log in with new password works

---

## 12. Order of operations

1. **Phase 1 — Scaffold**: package.json, tsconfig.json, .env.example, src/index.ts + app.ts boot. Verify `npm run dev` starts and `curl /` returns HTML.
2. **Phase 2 — Config + services**: env, db, redis, r2, token, cache, payment. No routes yet. (No email service.)
3. **Phase 3 — Models**: User, Course, Payment Mongoose schemas. No controllers.
4. **Phase 4 — Middleware**: auth, upload, validate, error, cache. No routes yet.
5. **Phase 5 — Zod schemas + auth controllers + auth routes**: register/login/logout/changePassword work end-to-end. (No forget/reset — those need email.)
6. **Phase 6 — User controllers + user routes**: profile, avatar, playlist, admin user mgmt.
7. **Phase 7 — Course controllers + course routes**: posters, videos, R2 cascade delete, Redis cache, price field.
8. **Phase 8 — Payment controllers + payment routes**: Razorpay Orders API, HMAC verify, idempotent grant of access.
9. **Phase 9 — (Skipped)** — was contact/request-course, removed with the email service.
10. **Phase 10 — Final wiring + tests**: app.use(errorHandler) before listen, end-to-end smoke test.

Each phase is a reviewable diff. The app stays bootable between phases (errors return clean JSON, no crash) thanks to the global error handler from Phase 4 onwards.

---

## 13. Frontend migration (separate, after backend is done)


