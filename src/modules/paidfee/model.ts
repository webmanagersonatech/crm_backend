import mongoose, { Document, Schema } from "mongoose";

export interface IPaidFeeEntry {
  amount: number;
  description?: string;
}

export interface IPaidFee extends Document {
  studentId: string;       // ref to Student._id
  studentCode?: string;    // student's studentId like "INS-..-stud-1"
  instituteId: string;
  programId?: string;
  year: number;
  entries: IPaidFeeEntry[];   // array of { amount, description }
  totalAmount: number;        // auto-calculated
  createdAt: Date;
  updatedAt: Date;
}

const PaidFeeEntrySchema = new Schema<IPaidFeeEntry>(
  {
    amount: { type: Number, required: true, min: 0 },
    description: { type: String, trim: true, default: "" },
  },
  { _id: false }
);

const PaidFeeSchema = new Schema<IPaidFee>(
  {
    studentId: {
      type: String,
      required: true,
      index: true,
    },
    studentCode: { type: String, index: true },
    instituteId: { type: String, required: true, index: true },
    programId: { type: String, index: true },
    year: { type: Number, required: true },
    entries: {
      type: [PaidFeeEntrySchema],
      default: [],
    },
    totalAmount: { type: Number, default: 0, min: 0 },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Prevent duplicate year entry per student+program
PaidFeeSchema.index(
  { studentId: 1, programId: 1, year: 1 },
  { unique: true }
);

// Auto-calculate totalAmount before save
PaidFeeSchema.pre("save", function (next) {
  if (this.entries && this.entries.length > 0) {
    this.totalAmount = this.entries.reduce(
      (sum, e) => sum + (Number(e.amount) || 0),
      0
    );
  } else {
    this.totalAmount = 0;
  }
  next();
});

const PaidFee = mongoose.model<IPaidFee>("PaidFee", PaidFeeSchema);

export default PaidFee;