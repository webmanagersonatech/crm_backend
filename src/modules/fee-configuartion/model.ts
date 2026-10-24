import mongoose, { Document, Schema } from "mongoose";

export interface IFeeConfiguration extends Document {
  instituteId: string;
  academicYear: string;

  courseFeeStructure: {
    courseId: string;
    name: string;

    years: {
     
      year: string;

      amount: number;
      tuitionFee: number;
      otherFee: number;
      otherFeeDescription?: string;

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
      // ❌ removed unique: true — now handled by compound index below
    },

    academicYear: {
      type: String,
      required: true,
      trim: true,
      match: [
        /^\d{4}-\d{4}$/,
        "Academic year must be in format YYYY-YYYY (e.g. 2023-2024)",
      ],
      validate: {
        validator: (v: string) => {
          const [start, end] = v.split("-").map(Number);
          return end === start + 1;
        },
        message: "Academic year end must be start year + 1 (e.g. 2023-2024)",
      },
    },

    courseFeeStructure: [
      {
        _id: false,

        courseId: { type: String, required: true },

        name: { type: String, required: true },

        years: [
          {
            _id: false,

            
            year: { type: String, required: true },

            amount: { type: Number, required: true, min: 0 },

            tuitionFee: { type: Number, required: true, min: 0 },

            otherFee: { type: Number, required: true, min: 0 },

            otherFeeDescription: { type: String },

            paymentOptions: [
              {
                _id: false,

                paymentOptionId: { type: String, required: true },

                name: { type: String, required: true },

                type: {
                  type: String,
                  enum: ["full_payment", "installment"],
                  required: true,
                },

                installments: [
                  {
                    _id: false,

                    number: { type: Number, required: true, min: 1 },

                    amount: { type: Number, required: true, min: 0 },

                    tuitionFee: { type: Number, required: true, min: 0 },

                    otherFee: { type: Number, required: true, min: 0 },

                    dueDate: { type: Date, required: true },
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

        referralId: { type: String, required: true },

        name: { type: String, required: true },

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

// ✅ Compound unique index: one fee config per institute per academic year
FeeConfigurationSchema.index(
  { instituteId: 1, academicYear: 1 },
  { unique: true }
);

// ✅ Optional: fast lookup by academic year
FeeConfigurationSchema.index({ "academicYear": 1 });

export default mongoose.model<IFeeConfiguration>(
  "FeeConfiguration",
  FeeConfigurationSchema
);