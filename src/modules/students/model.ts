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
    country: { type: String,  },
    state: { type: String,  },
    city: { type: String, },
    status: { type: String, enum: ["active", "inactive"], default: "inactive" },
  },
  { timestamps: true }
);

StudentSchema.plugin(mongoosePaginate);

// Auto-generate studentId and hash password
StudentSchema.pre("save", async function (next) {
  // Auto-generate studentId if not exists
  if (!this.studentId) {
    const count = await mongoose.models.Student.countDocuments({ instituteId: this.instituteId });
    this.studentId = `${this.instituteId}-stud-${count + 1}`; // e.g., INST1-stud-1
  }

  // Hash password if modified
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
