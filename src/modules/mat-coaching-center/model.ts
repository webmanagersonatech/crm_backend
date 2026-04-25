import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";

/* =========================
   Interface
========================= */
export interface IMatTraining extends Document {
  regId: string;

  name: string;
  mobile: string;
  email: string;

  city: string;

  ugDegree: string;
  ugCollege: string;

  studentWorking: string;

  paymentScreenshot?: string;
  paymentVerified?: boolean;
  verifiedBy?: mongoose.Types.ObjectId;
  paymentVerifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================
   Paginate Type
========================= */
export interface MatTrainingModel<T extends Document>
  extends mongoose.PaginateModel<T> { }

/* =========================
   Schema
========================= */
const MatTrainingSchema = new Schema<IMatTraining>(
  {
    regId: { type: String, unique: true, index: true },

    name: { type: String, required: true, trim: true },
    mobile: { type: String, required: true },
    email: { type: String, trim: true, lowercase: true },

    city: { type: String },

    ugDegree: { type: String },
    ugCollege: { type: String },

    studentWorking: { type: String },

    paymentScreenshot: { type: String },
    paymentVerified: {
      type: Boolean,
      default: false,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    paymentVerifiedAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   Auto RegId Generator
========================= */
MatTrainingSchema.pre<IMatTraining>("save", async function (next) {
  if (!this.regId) {
    let isUnique = false;

    while (!isUnique) {
      const randomStr = crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase();

      const newRegId = `MAT-${randomStr}`;

      const existing = await mongoose.models.MatTraining?.findOne({
        regId: newRegId,
      });

      if (!existing) {
        this.regId = newRegId;
        isUnique = true;
      }
    }
  }
  next();
});

/* =========================
   Plugin
========================= */
MatTrainingSchema.plugin(mongoosePaginate);

/* =========================
   Export Model
========================= */
export default mongoose.model<IMatTraining, MatTrainingModel<IMatTraining>>(
  "MatTraining",
  MatTrainingSchema
);