import mongoose, { Document, Schema } from 'mongoose';

export interface IFeeConfiguration extends Document {
  instituteId: string;

  courseFeeStructure: {
    courseId: string;
    name: string;
    years: {
      year: string;
      amount: number;
    }[];
  }[];

  referrals: {
    name: string;
    percentage: number;
  }[];
}

const FeeConfigurationSchema = new Schema<IFeeConfiguration>(
  {
    instituteId: {
      type: String,
      required: true,
      unique: true,
    },

    courseFeeStructure: [
      {
        _id: false,
        courseId: {
          type: String,
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        years: [
          {
            _id: false,
            year: {
              type: String,
              required: true,
            },
            amount: {
              type: Number,
              required: true,
              min: 0,
            },
          },
        ],
      },
    ],

    referrals: [
      {
        _id: false,
        name: {
          type: String,
          required: true,
        },
        percentage: {
          type: Number,
          required: true,
          min: 0,
          max: 100,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

export default mongoose.model<IFeeConfiguration>(
  'FeeConfiguration',
  FeeConfigurationSchema
);