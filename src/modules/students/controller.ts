import { Request, Response } from "express";
import Student from "./model";
import { studentSchema } from "./student.sanitize";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Joi from 'joi';
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import CryptoJS from "crypto-js";

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
    sender: { email: "vinor1213@gmail.com", name: "Vinoth" },
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

    const { email, firstname } = value;

    const existing = await Student.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "Student already exists" });
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

    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        studentId: student.studentId,
        firstname: student.firstname,
        lastname: student.lastname,
        email: student.email,
        token,
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
    const student = await Student.findById(id);
    if (!student) return res.status(404).json({ message: "Student not found" });

    res.status(200).json({ success: true, data: student });
  } catch (err) {
    console.error("Error getting student:", err);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Get all students
export const getAllStudents = async (_req: Request, res: Response) => {
  try {
    const students = await Student.find();
    res.status(200).json({ success: true, data: students });
  } catch (err) {
    console.error("Error getting students:", err);
    res.status(500).json({ message: "Internal server error" });
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

export const changePassword = async (req: StudentAuthRequest, res: Response) => {
  try {
    // ---------- Validation ----------
    const schema = Joi.object({
      oldPassword: Joi.string().allow(null, ""),
      newPassword: Joi.string().min(6).required(),
      confirmPassword: Joi.string().required(),
    });
    console.log(req.student, "req");

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
