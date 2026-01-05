import mongoose, { Document, Schema } from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

export interface IEvent extends Document {
  eventId: string;
  instituteId: string;
  name: string;
  mobile: string;
  email?: string;
  location?: string;
  eventName: string;
  enrolledDate?: string;
  createdBy: mongoose.Types.ObjectId;
}

const EventSchema = new Schema<IEvent>(
  {
    eventId: { type: String, unique: true, index: true },

    instituteId: { type: String, required: true },

    name: { type: String, required: true },
    mobile: { type: String, required: true },
    email: { type: String },
    location: { type: String },
    eventName: { type: String, required: true },
    enrolledDate: { type: String },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  {
    timestamps: true,
    strict: true,              // 🔒 blocks unknown fields
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Populate creator info
EventSchema.virtual("creator", {
  ref: "User",
  localField: "createdBy",
  foreignField: "_id",
  justOne: true,
});

// Populate institute info
EventSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

// Auto-generate sequential eventId per institute
EventSchema.pre<IEvent>("save", async function (next) {
  if (!this.eventId) {
    const lastRecord = await mongoose.models.Event
      .find({ instituteId: this.instituteId })
      .sort({ createdAt: -1 })
      .limit(1)
      .lean();

    let nextNumber = 1;

    if (lastRecord.length > 0 && lastRecord[0].eventId) {
      const parts = lastRecord[0].eventId.split("-eve-");
      const lastNum = parseInt(parts[1], 10);
      if (!isNaN(lastNum)) nextNumber = lastNum + 1;
    }

    this.eventId = `${this.instituteId}-eve-${nextNumber}`;
  }
  next();
});

// Pagination
EventSchema.plugin(mongoosePaginate);

export default mongoose.model<IEvent, mongoose.PaginateModel<IEvent>>(
  "Event",
  EventSchema
);
