import { Schema, model, type Document, type Model, type Types } from "mongoose";

/**
 * One row per active login session.
 *
 * The raw refresh-token JWT is NEVER stored — only its SHA-256 hash. If the
 * `sessions` collection leaks, an attacker still can't mint new access
 * tokens because they don't have the JWT signing secret.
 *
 * `family` ties together every row created from a single login. Rotation
 * preserves the family; reuse-detection kills the whole family.
 */
export interface ISession extends Document {
  _id: Types.ObjectId;
  tokenHash: string;
  user: Types.ObjectId;
  family: string;
  userAgent?: string;
  ip?: string;
  expiresAt: Date;
  createdAt: Date;
}

export interface ISessionModel extends Model<ISession> {}

const sessionSchema = new Schema<ISession, ISessionModel>(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    family: { type: String, required: true },
    userAgent: { type: String },
    ip: { type: String },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

// Indexes — keep them all in one place so they're obvious.
sessionSchema.index({ tokenHash: 1 }, { unique: true });
sessionSchema.index({ user: 1 });
sessionSchema.index({ family: 1 });
// Mongo TTL: row is auto-removed once `expiresAt` passes. No cron needed.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<ISession, ISessionModel>("Session", sessionSchema);