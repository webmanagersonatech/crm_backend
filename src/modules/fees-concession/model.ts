import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IFeeConcession extends Document {
  studentId: mongoose.Types.ObjectId;
  instituteId: string;

  reason: string;
  referralIds: string[];
  counsellorName: string;


  status: "pending" | "approved" | "rejected" | "cancelled";

  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;

  rejectedBy?: mongoose.Types.ObjectId;
  rejectedAt?: Date;

  cancelledBy?: mongoose.Types.ObjectId;
  cancelledAt?: Date;

  createdBy: mongoose.Types.ObjectId;
}

const FeeConcessionSchema = new Schema<IFeeConcession>(
  {
    studentId: {
      type: Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },

    instituteId: {
          required: true,
      type: String,
    },

    reason: {
      type: String,
      required: true,
    },

    referralIds: [
      {
        type: String,
      },
    ],

    counsellorName: {
      type: String,
      required: true,
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

    rejectedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    rejectedAt: {
      type: Date,
    },

    cancelledBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
    },

    cancelledAt: {
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
  }
);

FeeConcessionSchema.plugin(mongoosePaginate);

export default mongoose.model<
  IFeeConcession,
  mongoose.PaginateModel<IFeeConcession>
>("FeeConcession", FeeConcessionSchema);