import mongoose, { Schema, Document } from "mongoose";

// ============================================================
// TYPES & ENUMS
// ============================================================

export type TuitionFeeStatus = "pending" | "paid" | "failed";
export type PaymentGateway = "razorpay" | "instamojo" | "ccavenue" | "manual";

export interface ITuitionFee extends Document {
  // Student Information
  studentId: string;
  instituteId: string;

  // Course Information
  courseId: string;
  courseName: string;

  // Academic Information
  academicYear: string;
  year: string;

  // Installment Information
  installmentNumber: number;

  // Fee Details
  originalAmount: number;
  concessionPercentage: number;
  concessionAmount: number;

  amount: number;
  gstAmount: number;
  totalAmount: number;
  paymentOptionId?: string;
  paymentOptionName?: string;

  // Fee Breakdown
  tuitionFee?: number;
  otherFee?: number;
  tuitionConcession?: number;
  otherFeeConcession?: number;
  // Payment Gateway
  orderId: string;
  paymentId?: string;
  paymentType?: string;
  // Payment Status
  status: TuitionFeeStatus;
  gateway: PaymentGateway;
  recordedBy?: string;
  remarks?: string;
  // Dates
  paidDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================
// SCHEMA
// ============================================================

const TuitionFeeSchema = new Schema<ITuitionFee>(
  {
    // Student Information
    studentId: {
      type: String,
      required: true,
      index: true,
    },

    instituteId: {
      type: String,
      required: true,
      index: true,
    },

    // Course Information
    courseId: {
      type: String,
      required: true,
      index: true,
    },

    courseName: {
      type: String,
      required: true,
    },
    paymentType: {
      type: String,
      required: true,
    },

    // Academic Information
    academicYear: {
      type: String,
      required: true,
      index: true,
    },

    year: {
      type: String,
      required: true,
    },

    // Installment
    installmentNumber: {
      type: Number,
      required: true,
    },
    paymentOptionId: {
      type: String,
    },
    paymentOptionName: {
      type: String,
    },

    // Fee Breakdown
    tuitionFee: {
      type: Number,
      default: 0,
    },
    otherFee: {
      type: Number,
      default: 0,
    },
    tuitionConcession: {
      type: Number,
      default: 0,
    },
    otherFeeConcession: {
      type: Number,
      default: 0,
    },
    // Original Installment Amount
    originalAmount: {
      type: Number,
      required: true,
    },

    // Fee Concession
    concessionPercentage: {
      type: Number,
      default: 0,
    },

    concessionAmount: {
      type: Number,
      default: 0,
    },

    // Amount after concession
    amount: {
      type: Number,
      required: true,
    },

    // GST
    gstAmount: {
      type: Number,
      default: 0,
    },

    // Final Amount
    totalAmount: {
      type: Number,
      required: true,
    },

    // Razorpay
    orderId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    paymentId: {
      type: String,
      sparse: true,
      index: true,
    },

    // Status
    status: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
      index: true,
    },

    gateway: {
      type: String,
      enum: ["razorpay", "instamojo", "ccavenue", "manual"],
      required: true,
    },
    remarks: {
      type: String,

    },
    recordedBy: {
      type: String,

    },

    // Payment Date
    paidDate: {
      type: Date,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// ============================================================
// INDEXES
// ============================================================

TuitionFeeSchema.index({
  studentId: 1,
  status: 1,
});

TuitionFeeSchema.index(
  {
    studentId: 1,
    courseId: 1,
    academicYear: 1,
    year: 1,
    installmentNumber: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: {
      status: "paid",
    },
  }
);

export default mongoose.model<ITuitionFee>(
  "TuitionFee",
  TuitionFeeSchema,
  "tuitionfee"
);