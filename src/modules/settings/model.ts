import mongoose, { Document, Schema } from 'mongoose';

export interface ISettings extends Document {
  instituteId: string;
  logo?: string; // Base64 string for institute logo
  courses?: {
    name: string;
    courseId?: string; // ✅ optional
  }[];
  paymentMethod: 'razorpay' | 'instamojo';
  paymentCredentials: {
    keyId?: string;
    keySecret?: string;
    apiKey?: string;
    authToken?: string;
  };
  merchantId?: string;
  apiKey?: string;
  authToken?: string;
  contactEmail?: string;
  contactNumber?: string;
  gstPercentage?: number;
  address?: string;
  applicationFee: number;
  academicYear: string;
  applicantAge: number;
  batchName?: string;
  isApplicationOpen?: boolean;
}

const SettingsSchema = new Schema<ISettings>(
  {
    instituteId: { type: String, required: true, unique: true },
    logo: { type: String }, // Base64 encoded logo
    courses: [
      {
        _id: false, // ✅ disable auto _id
        name: { type: String, required: true },
        courseId: { type: String }, // optional
      }
    ],
    paymentMethod: {
      type: String,
      enum: ['razorpay', 'instamojo'],
      required: true,
    },

    paymentCredentials: {
      type: Schema.Types.Mixed,
      required: true,
    },
    merchantId: { type: String },
    applicationFee: {
      type: Number,
      required: true,
      min: 0,
    },
    gstPercentage: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    applicantAge: {
      type: Number,
      required: true,
      min: 1,
      max: 100,
    },
    batchName: {
      type: String,
      default: '',
    },

    isApplicationOpen: {
      type: Boolean,
      default: false,
    },

    apiKey: { type: String },
    authToken: { type: String },
    contactEmail: { type: String },
    contactNumber: { type: String },
    address: { type: String },
    academicYear: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

const Settings = mongoose.model<ISettings>('Settings', SettingsSchema);

export default Settings;
