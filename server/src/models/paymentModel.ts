import { Schema, model, type Document, type Model, type Types } from "mongoose";

/**
 * Records a successful Razorpay one-time payment for a course.
 *
 * One row per captured payment. `user` + `course` makes the record queryable
 * for "has this user paid for this course?" without scanning by Razorpay id.
 * `razorpay_order_id` is unique — duplicate verifications of the same order
 * are blocked at the DB layer (idempotency).
 */
export interface IPayment extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  course: Types.ObjectId;
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  amount: number; // in INR (rupees)
  currency: string;
  status: "captured" | "failed" | "refunded";
  createdAt: Date;
}

export interface IPaymentModel extends Model<IPayment> {}

const paymentSchema = new Schema<IPayment, IPaymentModel>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    razorpay_order_id: { type: String, required: true, unique: true },
    razorpay_payment_id: { type: String, required: true },
    razorpay_signature: { type: String, required: true },
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "INR" },
    status: {
      type: String,
      enum: ["captured", "failed", "refunded"],
      default: "captured",
    },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false },
);

paymentSchema.index({ user: 1, course: 1 });
paymentSchema.index({ razorpay_order_id: 1 }, { unique: true });

export const Payment = model<IPayment, IPaymentModel>("Payment", paymentSchema);