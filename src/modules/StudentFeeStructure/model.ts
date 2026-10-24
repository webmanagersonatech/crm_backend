import mongoose, { Document, Schema } from "mongoose";

/* -------------------- Installment -------------------- */

export interface IFeeInstallment {
  number: number;
  amount: number;
  tuitionFee: number;
  otherFee: number;
  dueDate: Date;
  status: "pending" | "paid" | "partial" | "overdue";
  paidAmount?: number;
  paidDate?: Date;
  paymentId?: string;

  // 🔹 Concession fields (per installment)
  concessionPercentage?: number;
  tuitionConcession?: number;
  otherFeeConcession?: number;
  payableAmount?: number;

  // 🆕 Given-amount tracking
  appliedNow?: number;
}

/* -------------------- Referral snapshot -------------------- */

export interface IAppliedReferral {
  referralId: string;
  name: string;
  percentage: number;
}

/* -------------------- Given amount entry -------------------- */

export interface IGivenAmountEntry {
  date: Date;
  amount: number;
  description?: string;
}

/* -------------------- StudentFeeStructure -------------------- */

export interface IStudentFeeStructure extends Document {
  studentId: mongoose.Types.ObjectId;
  studentCode?: string;
  instituteId: string;

  programId?: string;
  courseName: string;

  year: number;
  academicYear: string;

  totalAmount: number;
  tuitionFee: number;
  otherFee: number;
  otherFeeDescription?: string;

  // 🔹 Concession summary
  concessionPercentage?: number;
  tuitionConcession?: number;
  otherFeeConcession?: number;
  concessionAmount?: number;
  concessionName?: string;
  appliedReferrals?: IAppliedReferral[];

  paymentOption: {
    paymentOptionId: string;
    type: "full_payment" | "installment";
    name: string;
    installments: IFeeInstallment[];
  };

  // 🆕 Given amount summary + raw entries
  givenAmount?: number;
  givenEntries?: IGivenAmountEntry[];
  offer?: boolean;
  feeStructureVersion?: string;

  createdAt: Date;
  updatedAt: Date;
}

/* -------------------- Schemas -------------------- */

const FeeInstallmentSchema = new Schema<IFeeInstallment>(
  {
    number: { type: Number, required: true },
    amount: { type: Number, required: true },
    tuitionFee: { type: Number, required: true },
    otherFee: { type: Number, required: true },
    dueDate: { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending", "paid", "partial", "overdue"],
      default: "pending",
    },

    paidAmount: { type: Number, default: 0 },
    paidDate: { type: Date },
    paymentId: { type: String },

    // 🔹 Concession fields per installment
    concessionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    tuitionConcession: { type: Number, default: 0 },
    otherFeeConcession: { type: Number, default: 0 },
    payableAmount: { type: Number, default: 0 },

    // 🆕 Given-amount tracking
    appliedNow: { type: Number, default: 0 },
  },
  { _id: false }
);

const AppliedReferralSchema = new Schema<IAppliedReferral>(
  {
    referralId: { type: String, required: true },
    name: { type: String, required: true },
    percentage: { type: Number, required: true, min: 0, max: 100 },
  },
  { _id: false }
);

// 🆕 Given-amount entry schema
const GivenAmountEntrySchema = new Schema<IGivenAmountEntry>(
  {
    date: { type: Date, required: true },
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, default: "" },
  },
  { _id: false }
);

const StudentFeeStructureSchema = new Schema<IStudentFeeStructure>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    studentCode: { type: String, index: true },

    instituteId: {
      type: String,
      required: true,
      index: true,
    },

    programId: { type: String, index: true },

    courseName: { type: String, required: true },

    year: { type: Number, required: true },

    academicYear: { type: String },

    totalAmount: { type: Number, required: true },
    tuitionFee: { type: Number, required: true },
    otherFee: { type: Number, required: true },
    otherFeeDescription: { type: String, default: "" },

    // 🔹 Concession summary
    concessionPercentage: { type: Number, default: 0, min: 0, max: 100 },
    tuitionConcession: { type: Number, default: 0 },
    otherFeeConcession: { type: Number, default: 0 },
    concessionAmount: { type: Number, default: 0 },
    concessionName: { type: String, default: "" },
    appliedReferrals: {
      type: [AppliedReferralSchema],
      default: [],
    },

    paymentOption: {
      paymentOptionId: { type: String, required: true },

      type: {
        type: String,
        enum: ["full_payment", "installment"],
        required: true,
      },

      name: { type: String, required: true },

      installments: {
        type: [FeeInstallmentSchema],
        required: true,
      },
    },

    // 🆕 Given amount summary + entries
    givenAmount: { type: Number, default: 0 },
    givenEntries: {
      type: [GivenAmountEntrySchema],
      default: [],
    },

    offer: { type: Boolean, default: false },

    feeStructureVersion: { type: String },
  },
  { timestamps: true }
);

/**
 * One fee structure per student + year.
 */
StudentFeeStructureSchema.index(
  { studentId: 1, programId: 1, year: 1, academicYear: 1 },
  { unique: true }
);

const StudentFeeStructure = mongoose.model<IStudentFeeStructure>(
  "StudentFeeStructure",
  StudentFeeStructureSchema
);

export default StudentFeeStructure;