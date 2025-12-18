import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

/* ===============================
   FIELD INTERFACE
================================ */
export interface IFormField {
  label: string;
  type: "text" | "number" | "email" | "select" | "radio" | "checkbox" | "date" | "file";
  required: boolean;
  options?: string[];
}

/* ===============================
   FORM INTERFACE
================================ */
export interface IDynamicFormManager extends Document {
  formId: string;
  instituteId: string;
  title: string;
  description?: string;
  academicYear?: string;
  fields: IFormField[];
  createdBy: mongoose.Types.ObjectId;
  status: "Active" | "Inactive";
  published: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/* ===============================
   FIELD SCHEMA
================================ */
const FieldSchema = new Schema<IFormField>(
  {
    label: { type: String, required: true, trim: true },
    type: {
      type: String,
      enum: ["text", "number", "email", "select", "radio", "checkbox", "date", "file"],
      required: true
    },
    required: { type: Boolean, default: false },
    options: { type: [String], default: [] }
  },
  { _id: false }
);

/* ===============================
   DYNAMIC FORM SCHEMA
================================ */
const DynamicFormManagerSchema = new Schema<IDynamicFormManager>(
  {
    formId: { type: String, unique: true, index: true },
    academicYear: {
      type: String,
      trim: true,
      index: true,
    },


    instituteId: { type: String, required: true, index: true },

    title: { type: String, required: true, trim: true },

    description: { type: String, trim: true },

    fields: {
      type: [FieldSchema],
      required: true,
      validate: {
        validator: (v: IFormField[]) => v.length > 0,
        message: "At least one field is required"
      }
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },

    status: {
      type: String,
      enum: ["Active", "Inactive"],
      default: "Active"
    },

    published: {
      type: Boolean,
      default: false
    }
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

/* ===============================
   AUTO FORM ID GENERATION
   Format: INSTITUTEID-FORM-XXXXX
================================ */
DynamicFormManagerSchema.pre<IDynamicFormManager>("save", async function (next) {
  if (!this.formId) {
    const random = Math.random().toString(36).substring(2, 7).toUpperCase(); // 5 chars
    this.formId = `${this.instituteId}-FORM-${random}`;

    // Ensure uniqueness
    const exists = await mongoose.models.DynamicFormManager.findOne({ formId: this.formId });
    if (exists) {
      const retry = Math.random().toString(36).substring(2, 7).toUpperCase();
      this.formId = `${this.instituteId}-FORM-${retry}`;
    }
  }
  next();
});

/* ===============================
   VIRTUALS
================================ */
DynamicFormManagerSchema.virtual("creator", {
  ref: "User",
  localField: "createdBy",
  foreignField: "_id",
  justOne: true
});

DynamicFormManagerSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true
});

/* ===============================
   PAGINATION
================================ */
DynamicFormManagerSchema.plugin(mongoosePaginate);

/* ===============================
   EXPORT
================================ */
export default mongoose.model<
  IDynamicFormManager,
  mongoose.PaginateModel<IDynamicFormManager>
>("DynamicFormManager", DynamicFormManagerSchema);
