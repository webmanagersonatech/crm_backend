import mongoose, { Schema, Document } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IPayment extends Document {
  studentId: string;
  instituteId: string;
  applicationId: string;
  gstAmount?: number;
  totalAmount?: number;
  amount: number;
  orderId: string;
  paymentId?: string;
  status: "pending" | "paid" | "failed";
  gateway: "razorpay" | "instamojo" | "ccavenue";
  createdAt: Date;
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

    amount: { type: Number, required: true },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    orderId: { type: String, required: true },
    paymentId: { type: String },

    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },

    gateway: {
      type: String,
      enum: ["razorpay", "instamojo", "ccavenue"],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ============================================================
   VIRTUALS — populate without changing stored `studentId`
============================================================ */

// Payment.student → Student (via Payment.studentId === Student._id)
// Works because Payment.studentId stores the ObjectId string of Student._id
PaymentSchema.virtual("student", {
  ref: "Student",
  localField: "studentId",
  foreignField: "studentId",
  justOne: true,
});

// Payment.institute → Institution (via Payment.instituteId === Institution.instituteId)
PaymentSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});



/* ============================================================
   PLUGINS + INDEXES
============================================================ */
PaymentSchema.plugin(mongoosePaginate);

PaymentSchema.index({ status: 1, createdAt: -1 });
PaymentSchema.index({ instituteId: 1, status: 1 });
PaymentSchema.index({ gateway: 1 });

export default mongoose.model<IPayment>(
  "Payment",
  PaymentSchema
) as mongoose.PaginateModel<IPayment>;