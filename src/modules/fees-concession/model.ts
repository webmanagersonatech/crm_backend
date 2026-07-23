import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IFeeConcession extends Document {
  studentId: mongoose.Types.ObjectId;
  instituteId: string;

  reason: string;
  referralIds: string[];
  counsellorName: string;
  paymentOptionId?: string;
  status: "pending" | "approved" | "rejected" | "cancelled";

  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;

  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeConcessionSchema = new Schema<IFeeConcession>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    instituteId: {
      type: String,
      required: true,
      index: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
    },

    paymentOptionId: {
      type: String,
    },

    referralIds: [
      {
        type: String,
      },
    ],

    counsellorName: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "cancelled"],
      default: "pending",
    },

    approvedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    approvedAt: {
      type: Date,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

/**
 * Student Virtual
 */
FeeConcessionSchema.virtual("student", {
  ref: "Student",
  localField: "studentId",
  foreignField: "_id",
  justOne: true,
});

/**
 * Creator Virtual
 */
FeeConcessionSchema.virtual("creator", {
  ref: "User",
  localField: "createdBy",
  foreignField: "_id",
  justOne: true,
});

/**
 * Approver Virtual
 */
FeeConcessionSchema.virtual("approver", {
  ref: "User",
  localField: "approvedBy",
  foreignField: "_id",
  justOne: true,
});

FeeConcessionSchema.plugin(mongoosePaginate);

const FeeConcession = mongoose.model<
  IFeeConcession,
  mongoose.PaginateModel<IFeeConcession>
>("FeeConcession", FeeConcessionSchema);

export default FeeConcession;