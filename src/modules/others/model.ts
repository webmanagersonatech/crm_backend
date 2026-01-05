import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IOther extends Document {
  recordId: string;
  instituteId: string;
  dataSource: string;
  name: string;
  phone: string;
  date?: string;
  email?: string;
  country?: string;
  state?: string;
  city?: string;
  description?: string;
  extraFields?: Record<string, any>;
  leadId?: mongoose.Types.ObjectId;
  createdBy: mongoose.Types.ObjectId;
}

const OtherSchema = new Schema<IOther>(
  {
    recordId: { type: String, unique: true, index: true },
    instituteId: { type: String, required: true },
    dataSource: { type: String, required: true },
    name: { type: String, required: true },
    phone: { type: String, required: true },
    date: { type: String },
    email: { type: String },
    country: { type: String },
    state: { type: String },
    city: { type: String },
    description: { type: String },
    extraFields: {
      type: Schema.Types.Mixed,
      default: {},
    },
    
    leadId: {
      type: Schema.Types.ObjectId,
      ref: "Lead",
      default: null,
    },

    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Populate creator
OtherSchema.virtual("creator", {
  ref: "User",
  localField: "createdBy",
  foreignField: "_id",
  justOne: true,
});

// Populate institute info
OtherSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

// Auto-generate sequential recordId per institute
OtherSchema.pre<IOther>("save", async function (next) {
  if (!this.recordId) {
    const lastRecord = await mongoose.models.Other
      .find({ instituteId: this.instituteId })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();

    let nextNumber = 1;
    if (lastRecord.length > 0) {
      const lastId = lastRecord[0].recordId; // e.g. INST1-rec-5
      const parts = lastId.split("-rec-");
      if (parts.length === 2) {
        const lastNum = parseInt(parts[1], 10);
        if (!isNaN(lastNum)) nextNumber = lastNum + 1;
      }
    }

    this.recordId = `${this.instituteId}-rec-${nextNumber}`;
  }
  next();
});

OtherSchema.plugin(mongoosePaginate);

export default mongoose.model<IOther, mongoose.PaginateModel<IOther>>("Other", OtherSchema);
