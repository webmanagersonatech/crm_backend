import { Request, Response } from "express";
import Student from "./model";
import { studentSchema } from "./student.sanitize";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

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
