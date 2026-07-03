import mongoose, { Document, Schema } from "mongoose";

export interface IFeeConfiguration extends Document {
  instituteId: string;

  courseFeeStructure: {
    courseId: string;
    name: string;
    years: {
      year: string;
      amount: number;
      installments: {
        number: number;
        amount: number;
        dueDate: Date;
      }[];
    }[];
  }[];

  referrals: {
    referralId: string;
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

            yearId: {
              type: String,
              required: true,
            },

            year: {
              type: String,
              required: true,
            },

            amount: {
              type: Number,
              required: true,
              min: 0,
            },

            installments: [
              {
                _id: false,

                installmentId: {
                  type: String,
                  required: true,
                },

                number: {
                  type: Number,
                  required: true,
                  min: 1,
                },

                amount: {
                  type: Number,
                  required: true,
                  min: 0,
                },

                dueDate: {
                  type: Date,
                  required: true,
                },
              },
            ],
          },
        ],
      },
    ],

    referrals: [
      {
        _id: false,

        referralId: {
          type: String,
          required: true,
        },

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
  "FeeConfiguration",
  FeeConfigurationSchema
);