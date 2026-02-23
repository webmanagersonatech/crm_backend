import mongoose, { Document, Schema } from "mongoose";
import bcrypt from "bcryptjs";
import mongoosePaginate from "mongoose-paginate-v2";
import crypto from "crypto";




export interface IStudent extends Document {
  studentId: string;
  firstname: string;
  lastname: string;
  email: string;
  country?: string;
  applicationId?: string;
  password: string;
  mobileNo: string;
  instituteId: string;
  state: string;
  city: string;
  status: "active" | "inactive";
  academicYear?: string;
  interactions?: string;
  admissionQuota?: string;
  admissionUniversityRegNo?: string;
  internshipType?: string;
  internshipCompany?: string;
  internshipDuration?: string;
  internshipRemarks?: string;
  hostelWilling?: boolean;
  hostelReason?: string;
  bloodGroup?: string;
  bloodWilling?: boolean;
  familyOccupation?: string;
  studentImage?: string;
  familyOtherOccupation?: string;
  siblingsCount?: number;
  siblingsDetails?: { name: string; age: number; status: "studying" | "working" | "both" | "none" }[];
  feedbackRating?: "good" | "bad" | "worst";
  feedbackReason?: string;
  comparePassword(candidate: string): Promise<boolean>;
}

const StudentSchema = new Schema<IStudent>(
  {
    studentId: { type: String, unique: true }, // auto-generated
    firstname: { type: String, required: true },
    lastname: { type: String, },
    applicationId: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobileNo: { type: String, required: true, unique: true },
    instituteId: { type: String, required: true },
    academicYear: { type: String },   // ✅ added
    interactions: { type: String },
    country: { type: String, },
    state: { type: String, },
    city: { type: String, },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    admissionQuota: { type: String },
    admissionUniversityRegNo: { type: String, unique: true },
    internshipType: { type: String },
    internshipCompany: { type: String },
    internshipDuration: { type: String },
    internshipRemarks: { type: String },
    hostelWilling: { type: Boolean, default: false },
    hostelReason: { type: String },
    bloodGroup: { type: String },
    bloodWilling: { type: Boolean, default: false },
    studentImage: { type: String },
    familyOccupation: { type: String },
    familyOtherOccupation: { type: String },
    siblingsCount: { type: Number, default: 0 },
    siblingsDetails: [
      {
        name: { type: String },
        age: { type: Number },
        status: { type: String, enum: ["studying", "working", "both", "none"] },
      },
    ],
    feedbackRating: { type: String, enum: ["good", "bad", "worst"] },
    feedbackReason: { type: String },

  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }

);

StudentSchema.virtual("institute", {
  ref: "Institution",
  localField: "instituteId",
  foreignField: "instituteId",
  justOne: true,
});

StudentSchema.virtual("application", {
  ref: "Application",
  localField: "applicationId",
  foreignField: "applicationId",
  justOne: true,
});


StudentSchema.plugin(mongoosePaginate);

// Auto-generate studentId and hash password
StudentSchema.pre("save", async function (next) {
  if (!this.studentId) {
    const lastStudent = await mongoose.models.Student
      .findOne({ instituteId: this.instituteId })
      .sort({ createdAt: -1 })
      .select("studentId");

    let nextNumber = 1;

    if (lastStudent?.studentId) {
      const lastNum = Number(lastStudent.studentId.split("-").pop());
      nextNumber = lastNum + 1;
    }

    this.studentId = `${this.instituteId}-stud-${nextNumber}`;
  }

  if (this.isModified("password")) {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
  }

  next();
});


// Compare password method
StudentSchema.methods.comparePassword = async function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

const Student = mongoose.model<IStudent, mongoose.PaginateModel<IStudent>>(
  "Student",
  StudentSchema
);

export default Student;
