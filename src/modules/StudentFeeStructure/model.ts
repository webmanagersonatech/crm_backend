import mongoose, { Document, Schema } from "mongoose";

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
}

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

  paymentOption: {
    paymentOptionId: string;
    type: "full_payment" | "installment";
    name: string;
    installments: IFeeInstallment[];
  };

  feeStructureVersion?: string;

  createdAt: Date;
  updatedAt: Date;
}

const FeeInstallmentSchema = new Schema<IFeeInstallment>(
  {
    number: {
      type: Number,
      required: true,
    },

    amount: {
      type: Number,
      required: true,
    },

    tuitionFee: {
      type: Number,
      required: true,
    },

    otherFee: {
      type: Number,
      required: true,
    },

    dueDate: {
      type: Date,
      required: true,
    },

    status: {
      type: String,
      enum: ["pending", "paid", "partial", "overdue"],
      default: "pending",
    },

    paidAmount: {
      type: Number,
      default: 0,
    },

    paidDate: {
      type: Date,
    },

    paymentId: {
      type: String,
    },
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


    studentCode: {
      type: String,
      index: true,
    },

    instituteId: {
      type: String,
      required: true,
      index: true,
    },

    programId: {
      type: String,
      index: true,
    },

    courseName: {
      type: String,
      required: true,
    },

    year: {
      type: Number,
      required: true,
    },

    academicYear: {
      type: String,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    tuitionFee: {
      type: Number,
      required: true,
    },

    otherFee: {
      type: Number,
      required: true,
    },

    otherFeeDescription: {
      type: String,
      default: "",
    },

    paymentOption: {
      paymentOptionId: {
        type: String,
        required: true,
      },

      type: {
        type: String,
        enum: ["full_payment", "installment"],
        required: true,
      },

      name: {
        type: String,
        required: true,
      },

      installments: {
        type: [FeeInstallmentSchema],
        required: true,
      },
    },

    feeStructureVersion: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

/**
 * One fee structure per student + academic year + year.
 */
StudentFeeStructureSchema.index(
  {
    studentId: 1,
    year: 1,
  },
  {
    unique: true,
  }
);

const StudentFeeStructure = mongoose.model<IStudentFeeStructure>(
  "StudentFeeStructure",
  StudentFeeStructureSchema
);

export default StudentFeeStructure;