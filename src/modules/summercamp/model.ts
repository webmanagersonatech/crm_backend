import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";

/* =========================
   Interface
========================= */
export interface ISummerCamp extends Document {
  regId: string; // ✅ Auto-generated ID (SC-XXXXXX)
  regno: string; // ✅ User provided

  name: string;
  mobile_no: string;
  email_id: string;

  gender: string;
  dob: Date;
  age: number;

  street_address: string;
  city: string;
  state_province: string;
  zip_postal: string;
  paymentStatus: "paid" | "unpaid";
  allergies: string;
  allergyDetails?: string;

  medicalConditions: string;
  medicalConditionsDetails?: string;
  medicalsCurrentlyTaking?: string;

  sports: string;

  sportsData: {
    sport_name: string;
    skill_level: string;
    duration: string;
    price: string;
    timing: string;
  }[];

  rollNumber?: string;
  totalAmt: number;
  registrar: string;

  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================
   Sub Schema
========================= */
const SportsSchema = new Schema(
  {
    sport_name: { type: String },
    skill_level: { type: String },
    duration: { type: String },
    price: { type: String },
    timing: { type: String },
  },
  { _id: false }
);

/* =========================
   Main Schema
========================= */
const SummerCampSchema = new Schema<ISummerCamp>(
  {
    regId: { type: String, unique: true, index: true }, // ✅ Auto ID

    regno: { type: String, required: true, trim: true }, // ✅ User input

    name: { type: String, required: true, trim: true },
    mobile_no: { type: String, required: true },
    email_id: { type: String, lowercase: true, trim: true },

    gender: { type: String },
    dob: { type: Date },
    age: { type: Number },
    
    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid"],
      default: "unpaid",
    },
    street_address: { type: String },
    city: { type: String },
    state_province: { type: String },
    zip_postal: { type: String },

    allergies: { type: String },
    allergyDetails: { type: String },

    medicalConditions: { type: String },
    medicalConditionsDetails: { type: String },
    medicalsCurrentlyTaking: { type: String },

    sports: { type: String },
    sportsData: { type: [SportsSchema], default: [] },

    rollNumber: { type: String },
    totalAmt: { type: Number, default: 0 },
    registrar: { type: String },
  },
  {
    timestamps: true,
  }
);

/* =========================
   Auto RegId Generator
========================= */
SummerCampSchema.pre<ISummerCamp>("save", async function (next) {
  if (!this.regId) {
    let isUnique = false;

    while (!isUnique) {
      const randomStr = crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase(); // e.g. A1B2C3

      const newRegId = `SC-${randomStr}`;

      const existing = await mongoose.models.SummerCamp?.findOne({
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
SummerCampSchema.plugin(mongoosePaginate);

/* =========================
   Pagination Type
========================= */
export interface SummerCampModel<T extends Document>
  extends mongoose.PaginateModel<T> { }

/* =========================
   Export Model
========================= */
export default mongoose.model<ISummerCamp, SummerCampModel<ISummerCamp>>(
  "SummerCamp",
  SummerCampSchema
);