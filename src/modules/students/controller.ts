import { Request, Response } from "express";
import Student from "./model";
import { studentSchema } from "./student.sanitize";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from 'joi';
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import CryptoJS from "crypto-js";
import Settings from "../settings/model";
import FormManage from "../form-manage/model";
import { AuthRequest } from "../auth";
import path from 'path';
import fs from 'fs';

const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
const SECRET_KEY = "sonacassecretkey@2025";

// Generate random password
const generatePassword = (length = 8) => {
  return Math.random().toString(36).slice(-length);
};

// Send password email
const sendPasswordEmail = async (email: string, firstname: string, password: string) => {
  const emailData = {
    sender: { email: "no-reply@sonatech.ac.in", name: "HIKA" },
    to: [{ email, name: firstname || "Student" }],
    subject: "Your Account Password",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Welcome to Sona Institute</h2>
        <p>Hello <b>${firstname || "Student"}</b>,</p>
        <p>Your account has been created successfully. Here is your password:</p>
        <h3 style="color:#2563eb;">${password}</h3>
        <p>Please change your password after logging in for security.</p>
        <hr />
        <p style="font-size: 12px; color: #555;">Sona Institute — Secure Account</p>
      </div>
    `,
  };

  await emailApi.sendTransacEmail(emailData);
};

// Create a new student
export const createStudent = async (req: Request, res: Response) => {
  try {
    const { error, value } = studentSchema.validate(req.body);

    if (error) {
      return res.status(400).json({ message: error.details[0].message });
    }

    const { email, firstname, mobileNo, instituteId } = value;
    const existing = await Student.findOne({ instituteId, email });
    if (existing) {
      return res.status(400).json({ message: "Student already exists" });
    }
    // Check if mobile number already exists
    const existingMobile = await Student.findOne({ instituteId, mobileNo });
    if (existingMobile) {
      return res.status(400).json({ message: "Mobile number already exists" });
    }

    // ✅ Generate plain password ONLY
    const plainPassword = generatePassword();

    // ❌ DO NOT hash here
    const student = await Student.create({
      ...value,
      password: plainPassword
    });

    // Send password to email
    await sendPasswordEmail(email, firstname, plainPassword);

    res.status(201).json({
      success: true,
      message: "Student created successfully. Password sent to email.",
      data: student,
    });
  } catch (err) {
    console.error("Error creating student:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const studentLogin = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password are required" });

    const student = await Student.findOne({ email });
    if (!student) return res.status(404).json({ message: "Student not found" });
    if (student.status !== "active") return res.status(403).json({ message: "Student is inactive" });

    const isMatch = await bcrypt.compare(password, student.password);
    if (!isMatch) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: student._id, studentId: student.studentId, instituteId: student.instituteId, email: student.email },
      process.env.JWT_SECRET || "secret",
      { expiresIn: "7d" }
    );

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production", // only HTTPS in production
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: "/",
    });
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        studentId: student.studentId,
        firstname: student.firstname,
        lastname: student.lastname,
        email: student.email,

      },
    });
  } catch (err) {
    console.error("Student login error:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
// Get a single student by ID
export const getStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const student = await Student.findById(id).populate({
      path: "application",
      select: "personalDetails",
    });
    if (!student) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({ success: true, data: student });
  } catch (err) {
    console.error("Error getting student:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all students
export const listStudents = async (req: AuthRequest, res: Response) => {
  try {
    // Pagination
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;

    // Search
    const search = (req.query.search as string) || "";

    // Status filter
    const status = (req.query.status as string) || "all";

    // Filters from frontend
    const bloodGroup = (req.query.bloodGroup as string) || "all";
    const bloodDonate = (req.query.bloodDonate as string) || "all"; // "true" | "false" | "all"
    const hostelWilling = (req.query.hostelWilling as string) || "all"; // "yes" | "no" | "all"
    const quota = (req.query.quota as string) || "all";
    const feedbackRating = (req.query.feedbackRating as string) || "all";
    const familyOccupation = (req.query.familyOccupation as string) || "all";
    const academicYear = (req.query.academicYear as string) || "all";


    // Location filters
    const country = (req.query.country as string) || "all";
    const state = (req.query.state as string) || "all";
    const city = req.query.city || "all";

    // Role-based access
    const userRole = req.user.role;
    const query: any = {};

    if (userRole === "superadmin") {
      const instituteId = (req.query.instituteId as string) || "all";
      if (instituteId !== "all") query.instituteId = instituteId;
    } else if (userRole === "admin") {
      query.instituteId = req.user.instituteId;
    } else {
      return res.status(403).json({
        status: false,
        message: "You are not authorized to view students",
      });
    }

    // Text search
    if (search.trim()) {
      query.$or = [
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { studentId: { $regex: search, $options: "i" } },
        { admissionUniversityRegNo: { $regex: search, $options: "i" } },
      ];
    }

    // Status filter
    if (status !== "all") query.status = status;

    // Corrected Filters (matching your MongoDB schema)
    if (bloodGroup !== "all") query.bloodGroup = bloodGroup;
    if (bloodDonate !== "all") query.bloodWilling = bloodDonate === "true";
    if (hostelWilling !== "all") query.hostelWilling = hostelWilling === "yes";
    if (quota !== "all") query.admissionQuota = quota;
    if (feedbackRating !== "all") query.feedbackRating = feedbackRating;
    if (familyOccupation !== "all") query.familyOccupation = familyOccupation;
    if (academicYear !== "all") query.academicYear = academicYear;

    // Location filters
    if (country !== "all") query.country = country;
    if (state !== "all") query.state = state;

    if (city !== "all") {
      if (Array.isArray(city)) {
        query.city = { $in: city };
      } else {
        query.city = city;
      }
    }

    query.interactions = "Admitted";
    // Pagination + populate
    const students = await (Student as any).paginate(query, {
      page,
      limit,
      select: "-password",
      sort: { createdAt: -1 },
      populate: [
        { path: "application", select: "_id" }, // only _id from application
        { path: "institute", select: "name" }  // only name from institute
      ],
    });
    const Filter: any = {}

    if (query.instituteId) {
      Filter.instituteId = query.instituteId
    }

    const academicYears = await Student.distinct("academicYear", Filter)

    return res.status(200).json({ status: true, students, academicYears });
  } catch (err: any) {
    console.error("List Students Error:", err);
    return res.status(500).json({
      status: false,
      message: err.message || "Server error",
    });
  }
};

export const uploadStudentImageByAdmin = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;

    // Check if file was uploaded
    const files = req.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No image file uploaded'
      });
    }

    const file = files[0];

    // ✅ Validate file type - Only PNG, WebP, JPEG allowed
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];

    const fileExtension = path.extname(file.originalname).toLowerCase();
    const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
    const isValidExtension = allowedExtensions.includes(fileExtension);

    if (!isValidMimeType || !isValidExtension) {
      // Delete the uploaded file if it's invalid
      if (fs.existsSync(file.path)) {
        fs.unlinkSync(file.path);
      }

      return res.status(400).json({
        success: false,
        message: 'Invalid file type. Only PNG, WebP, and JPEG images are allowed.'
      });
    }

    // ✅ Just return the filename - NO database save!
    return res.status(200).json({
      success: true,
      message: 'Student image uploaded successfully',
      data: {
        filename: file.filename 
      }
    });

  } catch (error: any) {
    console.error('Error uploading student image by admin:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Internal server error'
    });
  }
};

// Edit student details
export const updateStudent = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);

      // Optionally send updated password to email
      const student = await Student.findById(id);

      if (student) await sendPasswordEmail(student.email, student.firstname, req.body.password);
    }

    const updatedStudent = await Student.findByIdAndUpdate(id, updates, { new: true });
    if (!updatedStudent) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({ success: true, data: updatedStudent });
  } catch (err) {
    console.error("Error updating student:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};
// Update ONLY cleanup data
export const updateStudentCleanupData = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    console.log(updates,"updates")

    // Remove empty enum values to avoid validation errors
    if (updates.feedbackRating === "") delete updates.feedbackRating;

    const updatedStudent = await Student.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updatedStudent) {
      return res.status(404).json({ message: "Student not found" });
    }

    res.status(200).json({
      success: true,
      message: "Student cleanup data updated successfully",
      data: updatedStudent,
    });
  } catch (err: any) {
    console.error("Error updating student cleanup data:", err);
    res.status(500).json({ message: err.message || "Internal server error" });
  }
};



export const changePasswordwithotpverfiedstudent = async (req: any, res: Response) => {
  try {
    // ----------------- Validate -----------------
    const schema = Joi.object({
      email: Joi.string().email().required(),
      newPassword: Joi.string().required(),
      confirmPassword: Joi.string().required(),
    });

    const { error, value } = schema.validate(req.body);
    if (error)
      return res.status(400).json({ message: error.details[0].message });

    const { email, newPassword, confirmPassword } = value;

    // ----------------- Find User -----------------
    const user = await Student.findOne({ email });
    if (!user)
      return res.status(404).json({ message: "User not found" });

    // ----------------- Decrypt Passwords -----------------
    let decryptedNewPassword = CryptoJS.AES.decrypt(newPassword, SECRET_KEY).toString(CryptoJS.enc.Utf8);
    let decryptedConfirmPassword = CryptoJS.AES.decrypt(confirmPassword, SECRET_KEY).toString(CryptoJS.enc.Utf8);

    if (!decryptedNewPassword || !decryptedConfirmPassword) {
      return res.status(400).json({ message: "Invalid password encryption" });
    }

    // ----------------- Match Check -----------------
    if (decryptedNewPassword !== decryptedConfirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password do not match",
      });
    }

    // ----------------- HASH Manually (because update used) -----------------
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(decryptedNewPassword, salt);

    // ----------------- UPDATE (NO SAVE USED) -----------------
    await Student.findOneAndUpdate(
      { email },
      { password: hashedPassword },
      { new: true }
    );

    return res.status(200).json({
      message: "Password changed successfully!",
    });

  } catch (err) {
    console.error("Change Password Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};

export const getLoggedInStudent = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const studentId = req.student?.id;

    if (!studentId) {
      return res.status(401).json({ success: false });
    }

    const student = await Student.findById(studentId).select(
      "_id firstname lastname email instituteId status mobileNo applicationId"
    );

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }


    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("-__v -logo");



    const formManagerDoc = await FormManage.findOne({
      instituteId: student.instituteId,
    }).select("-__v");

    return res.status(200).json({
      success: true,
      data: {
        student,
        settings: settingsDoc || {},
        formManager: formManagerDoc || {},
      },
    });
  } catch (err) {
    console.error("getLoggedInStudent error:", err);
    return res.status(500).json({ success: false });
  }
};

export const changePassword = async (req: StudentAuthRequest, res: Response) => {
  try {
    // ---------- Validation ----------
    const schema = Joi.object({
      oldPassword: Joi.string().allow(null, ""),
      newPassword: Joi.string().min(6).required(),
      confirmPassword: Joi.string().required(),
    });


    const { error, value } = schema.validate(req.body);
    if (error) return res.status(400).json({ message: error.message });

    const { oldPassword, newPassword, confirmPassword } = value;

    // ---------- Find User ----------
    const userId = req.student?.id;
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const user = await Student.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // ---------- Verify Old Password ----------
    if (oldPassword) {
      let decryptedOldPassword: string;
      try {
        decryptedOldPassword = CryptoJS.AES.decrypt(oldPassword, SECRET_KEY).toString(CryptoJS.enc.Utf8);
        if (!decryptedOldPassword) throw new Error();
      } catch {
        return res.status(400).json({ message: "Invalid old password encryption" });
      }

      const isOldMatch = await user.comparePassword(decryptedOldPassword);
      if (!isOldMatch) return res.status(400).json({ message: "Old password is incorrect" });
    }

    // ---------- Decrypt New + Confirm Password ----------
    let decryptedNewPassword: string;
    let decryptedConfirmPassword: string;

    try {
      decryptedNewPassword = CryptoJS.AES.decrypt(newPassword, SECRET_KEY).toString(CryptoJS.enc.Utf8);
      decryptedConfirmPassword = CryptoJS.AES.decrypt(confirmPassword, SECRET_KEY).toString(CryptoJS.enc.Utf8);

      if (!decryptedNewPassword || !decryptedConfirmPassword) {
        return res.status(400).json({ message: "Invalid password encryption" });
      }
    } catch {
      return res.status(400).json({ message: "Invalid password encryption" });
    }

    // ---------- Check match ----------
    if (decryptedNewPassword !== decryptedConfirmPassword) {
      return res.status(400).json({ message: "New password and confirm password do not match" });
    }

    // ---------- Prevent same as old ----------
    if (oldPassword) {
      const isSameAsOld = await user.comparePassword(decryptedNewPassword);
      if (isSameAsOld) {
        return res.status(400).json({ message: "New password must be different from old password" });
      }
    }

    // ---------- Hash the new password ----------
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(decryptedNewPassword, salt);

    // ---------- Update password only ----------
    await Student.findByIdAndUpdate(
      user._id,
      { password: hashedPassword },
      { new: true } // optional, returns the updated doc if needed
    );

    return res.status(200).json({ message: "Password changed successfully!" });

  } catch (err: any) {
    console.error("Change Password Error:", err);
    return res.status(500).json({ message: "Server error" });
  }
};
export const deleteStudent = async (req: Request, res: Response) => {
  const { id } = req.params;
  await Student.findByIdAndDelete(id);
  res.status(200).json({ success: true });
};

