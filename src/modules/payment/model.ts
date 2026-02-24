import mongoose, { Schema, Document } from "mongoose";

export interface IPayment extends Document {
  studentId: string;
  applicationId: string; // you are using string APP ID
  amount: number;
  orderId: string;       // Razorpay Order ID
  paymentId?: string;    // Razorpay Payment ID
  status: "pending" | "paid" | "failed";
  gateway: "razorpay";
  createdAt: Date;   // ✅ add this
  updatedAt: Date;
}

const PaymentSchema: Schema = new Schema(
  {
    studentId: {
      type: String,
      required: true,
    },
    instituteId: {
      type: String,
      required: true,
    },
    applicationId: {
      type: String,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    orderId: {
      type: String,
      required: true,
    },

    paymentId: {
      type: String,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    gateway: {
      type: String,
      default: "razorpay",
    },
  },
  { timestamps: true }
);

export default mongoose.model<IPayment>("Payment", PaymentSchema);