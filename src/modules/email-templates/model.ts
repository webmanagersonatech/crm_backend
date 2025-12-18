import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IEmailTemplate extends Document {
  instituteId: string;
  title: string;
  description: string; // Rich text (HTML)
  createdBy: mongoose.Types.ObjectId;
}

const EmailTemplateSchema = new Schema<IEmailTemplate>(
  {
    instituteId: {
      type: String,
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    description: {
      type: String, // HTML from rich text editor
      required: true,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/* ===============================
   Virtuals
================================ */

EmailTemplateSchema.virtual("creator", {
  ref: "User",
  localField: "createdBy",
  foreignField: "_id",
  justOne: true,
});

EmailTemplateSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

/* ===============================
   Plugins
================================ */

EmailTemplateSchema.plugin(mongoosePaginate);

export default mongoose.model<
  IEmailTemplate,
  mongoose.PaginateModel<IEmailTemplate>
>("EmailTemplate", EmailTemplateSchema);
