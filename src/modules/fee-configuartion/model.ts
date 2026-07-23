import mongoose, { Document, Schema } from "mongoose";

export interface IFeeConfiguration extends Document {
  instituteId: string;

  courseFeeStructure: {
    courseId: string;
    name: string;

    years: {
      yearId: string;
      year: string;

      amount: number;
      tuitionFee: number;
      otherFee: number;

      paymentOptions: {
        paymentOptionId: string;
        name: string;
        type: "full_payment" | "installment";

        installments: {
          number: number;
          amount: number;
          tuitionFee: number;
          otherFee: number;
          dueDate: Date;
        }[];
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

            tuitionFee: {
              type: Number,
              required: true,
              min: 0,
            },

            otherFee: {
              type: Number,
              required: true,
              min: 0,
            },

            paymentOptions: [
              {
                _id: false,

                paymentOptionId: {
                  type: String,
                  required: true,
                },

                name: {
                  type: String,
                  required: true,
                },

                type: {
                  type: String,
                  enum: ["full_payment", "installment"],
                  required: true,
                },

                installments: [
                  {
                    _id: false,

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

                    tuitionFee: {
                      type: Number,
                      required: true,
                      min: 0,
                    },

                    otherFee: {
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