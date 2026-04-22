import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";

/* =========================
   Interface
========================= */
export interface ICIICP extends Document {
  registrationId: string;

  name: string;
  fatherName: string;

  gender: "Male" | "Female" | "Other";
  dob: Date;

  paymentStatus: "paid" | "unpaid";

  address: string;
  district: string;

  phone: string;
  aadhaar: string;

  qualification: string;

  courses: string[];
  batch: "FN" | "AN" | "EVE" | "WK";

  createdAt?: Date;
  updatedAt?: Date;
}

/* =========================
   Schema
========================= */
const CIICPSchema = new Schema<ICIICP>(
  {
    registrationId: {
      type: String,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
    },

    fatherName: {
      type: String,
      required: true,
      trim: true,
    },

    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true,
    },

    paymentStatus: {
      type: String,
      enum: ["paid", "unpaid"],
      default: "unpaid",
    },

    dob: {
      type: Date,
      required: true,
      validate: {
        validator: function (value: Date) {
          return value <= new Date();
        },
        message: "DOB cannot be in the future",
      },
    },

    address: {
      type: String,
      required: true,
    },

    district: {
      type: String,
      required: true,
    },

    phone: {
      type: String,
      required: true,
      match: [/^\d{10}$/, "Phone must be exactly 10 digits"],
      // optional:
      // unique: true,
    },

    aadhaar: {
      type: String,
    },

    qualification: {
      type: String,
      required: true,
    },

    courses: {
      type: [String],
      required: true,
      validate: {
        validator: (arr: string[]) => arr.length > 0,
        message: "At least 1 course is required",
      },
    },

    batch: {
      type: String,
      enum: ["FN", "AN", "EVE", "WK"],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

/* =========================
   Auto Registration ID (CRYPTO)
========================= */
CIICPSchema.pre<ICIICP>("save", async function (next) {
  if (!this.registrationId) {
    let isUnique = false;

    while (!isUnique) {
      // Generate secure random HEX (6 chars)
      const randomStr = crypto
        .randomBytes(3)
        .toString("hex")
        .toUpperCase(); // e.g. A1B2C3

      const newId = `CIICP-${randomStr}`;

      const existing = await mongoose.models.CIICP?.findOne({
        registrationId: newId,
      });

      if (!existing) {
        this.registrationId = newId;
        isUnique = true;
      }
    }
  }
  next();
});

/* =========================
   Plugin
========================= */
CIICPSchema.plugin(mongoosePaginate);

/* =========================
   Pagination Type
========================= */
export interface CIICPModel<T extends Document>
  extends mongoose.PaginateModel<T> { }

/* =========================
   Export Model
========================= */
export default mongoose.model<ICIICP, CIICPModel<ICIICP>>(
  "CIICP",
  CIICPSchema
);