import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";

// ========================
// Application Interface
// ========================
export interface IApplication extends Document {
  applicationId: string;
  instituteId: string;
  studentId: string;
  program: string;
  userId?: string;
  leadId?: string;
  academicYear: string;
  personalDetails: Array<{ sectionName: string; fields: Record<string, any> }>;
  educationDetails: Array<{ sectionName: string; fields: Record<string, any> }>;
  applicantName: string;
  courseCode?: string;
  paymentStatus: "Paid" | "Unpaid" | "Partially";
  status: "Pending" | "Approved" | "Rejected";
  submittedAt: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

// ========================
// Schema
// ========================
const SectionSchema = new Schema(
  {
    sectionName: { type: String, required: true },
    fields: { type: Schema.Types.Mixed, default: {} },
  },
  { _id: false } // no separate _id for sections
);

const ApplicationSchema = new Schema<IApplication>(
  {
    applicationId: { type: String, unique: true, index: true },
    instituteId: { type: String, required: true },
    studentId: { type: String },
    program: { type: String, required: true },
    userId: { type: String },
    leadId: { type: String },
    academicYear: { type: String, required: true },
    personalDetails: { type: [SectionSchema], default: [] },
    educationDetails: { type: [SectionSchema], default: [] },
    applicantName: { type: String, required: true },
    courseCode: { type: String },
    paymentStatus: {
      type: String,
      enum: ["Paid", "Unpaid", "Partially"],
      default: "Unpaid",
    },
    status: {
      type: String,
      enum: ["Pending", "Approved", "Rejected"],
      default: "Pending",
    },
    submittedAt: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual populate: Institute info
ApplicationSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

// Pre-save: generate unique applicationId
ApplicationSchema.pre<IApplication>("save", async function (next) {
  if (!this.applicationId) {
    const randomStr = crypto.randomBytes(3).toString("hex").toUpperCase();
    this.applicationId = `${this.instituteId}-APP-${randomStr}`;
    const existing = await mongoose.models.Application.findOne({
      applicationId: this.applicationId,
    });
    if (existing) {
      this.applicationId = `${this.instituteId}-APP-${crypto
        .randomBytes(4)
        .toString("hex")
        .toUpperCase()}`;
    }
  }
  next();
});

// Pagination plugin
ApplicationSchema.plugin(mongoosePaginate);

export interface IApplicationModel extends mongoose.PaginateModel<IApplication> {}

const Application = mongoose.model<IApplication, IApplicationModel>(
  "Application",
  ApplicationSchema
);

export default Application;
