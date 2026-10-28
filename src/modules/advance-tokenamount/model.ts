import mongoose, { Schema, Document } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IAdvanceTokenPayment extends Document {
  studentId: string;
  instituteId: string;
  applicationId: string;
  programId: string;
  academicYear: string;

  amount: number;
  gstAmount?: number;
  totalAmount?: number;

  orderId: string;
  paymentId?: string;

  status: "pending" | "paid" | "failed";
  gateway: "razorpay" | "instamojo" | "ccavenue";

  adjusted: boolean;
  adjustedAt?: Date | null;
  adjustedIntoYear?: number | null;

  createdAt: Date;
  updatedAt: Date;
}

const AdvanceTokenPaymentSchema: Schema = new Schema(
  {
    studentId: { type: String, required: true },
    instituteId: { type: String, required: true },
    applicationId: { type: String, required: true },
    programId: { type: String, required: true },
    academicYear: { type: String, required: true },

    amount: { type: Number, required: true },
    gstAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, required: true },

    orderId: { type: String, required: true, unique: true },
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

    adjusted: { type: Boolean, default: false },
    adjustedAt: { type: Date, default: null },
    adjustedIntoYear: { type: Number, default: null },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

AdvanceTokenPaymentSchema.virtual("student", {
  ref: "Student",
  localField: "studentId",
  foreignField: "studentId",
  justOne: true,
});

AdvanceTokenPaymentSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

AdvanceTokenPaymentSchema.plugin(mongoosePaginate);

AdvanceTokenPaymentSchema.index({ status: 1, createdAt: -1 });
AdvanceTokenPaymentSchema.index({ instituteId: 1, status: 1 });
AdvanceTokenPaymentSchema.index({ studentId: 1, academicYear: 1 });
AdvanceTokenPaymentSchema.index({ applicationId: 1 });
AdvanceTokenPaymentSchema.index({ gateway: 1 });

export default mongoose.model<IAdvanceTokenPayment>(
  "AdvanceTokenPayment",
  AdvanceTokenPaymentSchema
) as mongoose.PaginateModel<IAdvanceTokenPayment>;