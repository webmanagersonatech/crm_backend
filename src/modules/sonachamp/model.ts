import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";

/* =========================
   Interface
========================= */
export interface ISonaChamps extends Document {
  regId: string; // ✅ Auto-generated (SNC-XXXXXXXX)

  // Student
  studentName: string;
  class: string;
  gender: "Male" | "Female" | "Other";

  // School
  schoolName: string;
  schoolLocation: string;

  // Teacher Coordinator (Optional)
  teacherCoordinatorName?: string;
  teacherCoordinatorMobile?: string;

  // Parent / Guardian (Name is Optional, Mobile is Required)
  parentGuardianName?: string;
  parentGuardianMobile: string;

  // Event
  category: "Junior" | "Senior";
  event: string;

  // Status
  present: boolean; // ✅ default false
  presentAt?: Date; // ✅ attendance timestamp
  markedBy?: string; // ✅ who marked attendance

  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================
   Main Schema
========================= */
const SonaChampsSchema = new Schema<ISonaChamps>(
  {
    regId: { type: String, unique: true, index: true },

    studentName: { type: String, required: true, trim: true },
    class: { type: String, required: true, trim: true },
    gender: {
      type: String,
      required: true,
      enum: ["Male", "Female", "Other"],
      trim: true,
    },

    schoolName: { type: String, required: true, trim: true },
    schoolLocation: { type: String, required: true, trim: true },

    // ✅ Teacher fields are now optional
    teacherCoordinatorName: { type: String, trim: true, default: "" },
    teacherCoordinatorMobile: { type: String, trim: true, default: "" },

    // ✅ Parent Name optional, Parent Mobile required
    parentGuardianName: { type: String, trim: true, default: "" },
    parentGuardianMobile: { type: String, required: true, trim: true },

    category: {
      type: String,
      required: true,
      enum: ["Junior", "Senior"],
      trim: true,
    },
    event: { type: String, required: true, trim: true },

    present: { type: Boolean, default: false },
    presentAt: { type: Date },
    markedBy: { type: String, trim: true },
  },
  { timestamps: true }
);

/* =========================
   Auto Generator: regId ONLY
   (atomic-safe with retry on collision)
========================= */
SonaChampsSchema.pre<ISonaChamps>("save", async function (next) {
  if (this.regId) return next();

  const MAX_RETRIES = 5;
  const Model = mongoose.models.SonaChamps;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const candidate = `SNC-${crypto
      .randomBytes(4)
      .toString("hex")
      .toUpperCase()}`;

    const exists = Model ? await Model.findOne({ regId: candidate }).lean() : null;

    if (!exists) {
      this.regId = candidate;
      return next();
    }
  }

  return next(new Error("Failed to generate unique regId after retries"));
});

/* =========================
   Plugin
========================= */
SonaChampsSchema.plugin(mongoosePaginate);

/* =========================
   Pagination Type
========================= */
export interface SonaChampsModel<T extends Document>
  extends mongoose.PaginateModel<T> {}

/* =========================
   Export Model
========================= */
export default mongoose.model<ISonaChamps, SonaChampsModel<ISonaChamps>>(
  "SonaChamps",
  SonaChampsSchema
);