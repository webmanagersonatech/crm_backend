import mongoose, { Document, Schema } from "mongoose";

export interface IAdditionalFeeConfiguration extends Document {
  instituteId: string;
  hostelFeeStructure: {
    year: string;
    dueDate: Date;
    roomTypes: {
      id: string;
      name: string;
      amount: number;
      description: string;
    }[];
  }[];
}

const AdditionalFeeConfigurationSchema = new Schema<IAdditionalFeeConfiguration>(
  {
    instituteId: {
      type: String,
      required: true,
      unique: true,
    },
    hostelFeeStructure: [
      {
        _id: false,
        year: {
          type: String,
          required: true,
        },
        dueDate: {
          type: Date,
          required: true,
        },
        roomTypes: [
          {
            _id: false,
            id: {
              type: String,
              required: true,
            },
            name: {
              type: String,
              required: true,
              enum: ["Common Room", "AC Attached", "Single Room", "Deluxe Room"],
            },
            amount: {
              type: Number,
              required: true,
              min: 0,
            },
            description: {
              type: String,
              required: true,
            },
          },
        ],
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IAdditionalFeeConfiguration>(
  "AdditionalFeeConfiguration",
  AdditionalFeeConfigurationSchema
);