import bcrypt from "bcrypt";
import { Schema, model, type Document, type Model, type Types } from "mongoose";

interface PlaylistEntry {
  course: Types.ObjectId;
  poster: string;
}

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  role: "user" | "admin";
  purchasedCourses: Types.ObjectId[];
  playlist: PlaylistEntry[];
  createdAt: Date;

  comparePassword(candidate: string): Promise<boolean>;
}

export interface IUserModel extends Model<IUser> {
  // (No statics for now — placeholder for future helpers.)
}

const userSchema = new Schema<IUser, IUserModel>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 6, select: false },
    role: { type: String, enum: ["user", "admin"], default: "user" },
    // Courses the user has bought (lifetime access). Populated by paymentController.
    purchasedCourses: [{ type: Schema.Types.ObjectId, ref: "Course" }],
    playlist: [{ course: { type: Schema.Types.ObjectId, ref: "Course" }, poster: String }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: false }, // createdAt is explicit; no updatedAt needed for users.
);

/**
 * Hash the password whenever it's set/changed. Select:false keeps it out of
 * default reads.
 *
 * Mongoose 9 pre-middleware: no `next` callback — the function returns a
 * promise or undefined. Throwing (or returning a rejected promise) aborts
 * the save with that error.
 */
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  this.password = await bcrypt.hash(this.password, 10);
});

userSchema.methods.comparePassword = function (this: IUser, candidate: string): Promise<boolean> {
  return bcrypt.compare(candidate, this.password);
};

export const User = model<IUser, IUserModel>("User", userSchema);