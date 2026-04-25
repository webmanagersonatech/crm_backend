import { Request, Response } from "express";
import MatTraining from "./model";
import { AuthRequest } from "../auth";
import { matTrainingSchema } from "./matcoaching.sanitize";
import Permission from "../permissions/model";
/* =========================
   CREATE REGISTRATION
========================= */


const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();


export const sendMatTrainingEmail = async (
  email: string,
  name: string,
  regId: string
) => {
  const htmlContent = `
    <h2>Welcome ${name},</h2>

    <p>Thank you for registering for the <b>MAT Coaching Program</b> at 
    <b>Sona Business School, Salem</b>.</p>

    <p><strong>Your Registration ID:</strong> ${regId}</p>

    <p>Our team will contact you shortly regarding the next steps.</p>

    <br/>


     <p>Best Regards,<br/>
     MAT Training Centre,<br/>
    Sona College of Technology,<br/>Salem - 636 005.</p>
  `;

  await emailApi.sendTransacEmail({
    sender: { email: "no-reply@sonatech.ac.in", name: "Sona Business School" },
    to: [{ email, name }],
    subject: "MAT Coaching Registration Successful",
    htmlContent,
  });
};
export const sendPaymentReceivedEmail = async (
  email: string,
  name: string,
  regId: string
) => {
  const htmlContent = `
    <h2>Hello ${name},</h2>

    <p>We have received your <b>payment screenshot</b> for the MAT Coaching Program.</p>

    <p><strong>Registration ID:</strong> ${regId}</p>

    <p>Our team will verify your payment shortly.</p>

    <br/>

    <p><b>Need help?</b><br/>
    📞 +91 8190041151<br/>
    📞 +91 7550357301</p>

    <br/>

    <p>Regards,<br/>
     MAT Training Centre,<br/>
    Sona College of Technology,<br/>Salem - 636 005.</p>
  `;


  await emailApi.sendTransacEmail({
    sender: { email: "no-reply@sonatech.ac.in", name: "Sona Business School" },
    to: [{ email, name }],
    subject: "Payment Screenshot Received - MAT Coaching",
    htmlContent,
  });
};
export const sendPaymentVerifiedEmail = async (
  email: string,
  name: string,
  regId: string
) => {
  const htmlContent = `
    <h2>Hi ${name},</h2>

    <p>🎉 Your payment has been <b>successfully verified</b> for the MAT Coaching Program.</p>

    <p><strong>Registration ID:</strong> ${regId}</p>

    <p>You are now officially enrolled. Our team will contact you with further details regarding classes and schedule.</p>

    <br/>

    <p><b>Need help?</b><br/>
    📞 +91 8190041151<br/>
    📞 +91 7550357301</p>

    <br/>

    <p>Best Regards,<br/>
    MAT Training Centre,<br/>
    Sona College of Technology,<br/>Salem - 636 005.</p>
  `;

  await emailApi.sendTransacEmail({
    sender: { email: "no-reply@sonatech.ac.in", name: "Sona Business School" },
    to: [{ email, name }],
    subject: "Payment Verified - MAT Coaching",
    htmlContent,
  });
};

export const createMatTraining = async (req: Request, res: Response) => {
  try {
    /* =========================
       ✅ VALIDATION
    ========================= */
    const { error, value } = matTrainingSchema.validate(req.body);

    if (error) {
      return res.status(400).json({

        message: error.details.map((e) => e.message),
      });
    }

    const { mobile, email, name } = value;

    /* =========================
       🔒 DUPLICATE CHECK (ONE QUERY)
    ========================= */
    const existing = await MatTraining.findOne({
      $or: [
        { mobile },
        { email: email.toLowerCase() },
      ],
    });

    if (existing) {
      return res.status(400).json({
        message:
          existing.mobile === mobile
            ? "Mobile number already registered"
            : "Email already registered",
      });
    }

    /* =========================
       💾 CREATE
    ========================= */


    const data = await MatTraining.create({
      ...value,
      email: email.toLowerCase(),
    });

    try {
      await sendMatTrainingEmail(email, name, data.regId);
    } catch (err) {
      console.error("Email failed:", err);
    }

    res.status(201).json({
      status: "success",
      message: "Registration successful",
      regId: data.regId,
    });
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};

export const uploadPaymentScreenshot = async (req: Request, res: Response) => {
  try {
    const { regId, screenshot } = req.body;


    if (!regId || !screenshot || screenshot.trim() === "") {
      return res.status(400).json({
        message: "Valid regId and screenshot are required",
      });
    }


    const record = await MatTraining.findOne({ regId });

    if (!record) {
      return res.status(404).json({
        message: "Invalid Registration ID",
      });
    }


    if (record.paymentScreenshot && record.paymentScreenshot.trim() !== "") {
      return res.status(400).json({
        message: "Payment screenshot already uploaded",
      });
    }


    record.paymentScreenshot = screenshot;
    await record.save();

    try {
      if (record.email) {
        await sendPaymentReceivedEmail(
          record.email,
          record.name,
          record.regId
        );
      }
    } catch (err) {
      console.error("Payment email failed:", err);
    }


    res.json({
      message: "Payment screenshot uploaded successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};
/* =========================
   LIST (PAGINATION + SEARCH)
========================= */
export const listMatTraining = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      city,
      studentWorking,
      startDate,
      endDate,
      paymentStatus,
      verificationStatus,
    } = req.query;


    const user = req.user;

    // 🔐 Auth check
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const modulePermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "MAT Registration"
      );

      if (!modulePermission?.view) {
        return res.status(403).json({
          message: "No permission to view data",
        });
      }
    }

    let filter: any = {};

    // 🔍 Search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { regId: { $regex: search, $options: "i" } },
      ];
    }

    // 📅 Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    // 📍 City filter
    if (city && city !== "all") {
      filter.city = city;
    }

    // 💰 Payment Screenshot Filter
    if (paymentStatus && paymentStatus !== "all") {
      if (paymentStatus === "submitted") {
        filter.paymentScreenshot = { $ne: null };
      } else if (paymentStatus === "not_submitted") {
        filter.$or = [
          { paymentScreenshot: { $exists: false } },
          { paymentScreenshot: null },
          { paymentScreenshot: "" },
        ];
      }
    }

    // ✅ Verification Filter
    if (verificationStatus && verificationStatus !== "all") {
      if (verificationStatus === "verified") {
        filter.paymentVerified = true;
      } else if (verificationStatus === "not_verified") {
        filter.paymentVerified = false;
      }
    }

    // 👨‍💼 Student / Working filter
    if (studentWorking && studentWorking !== "all") {
      filter.studentWorking = studentWorking;
    }

    // 📄 Pagination
    const result = await (MatTraining as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    // 📍 Distinct cities (for dropdown)
    const cities = await MatTraining.distinct("city");

    const studentsCount = await MatTraining.countDocuments({
      ...filter,
      studentWorking: "Student"
    });

    const workingCount = await MatTraining.countDocuments({
      ...filter,
      studentWorking: "Working"
    });

    res.json({
      ...result,
      cityOptions: cities.filter((c) => c && c !== ""),
      statistics: {
        totalRegistrations: result.totalDocs,
        totalCities: cities.filter((c) => c && c !== "").length,
        totalStudents: studentsCount,
        totalWorking: workingCount,
      }
    });
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};


export const verifyPayment = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { paymentVerified } = req.body;

    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    /* 🔒 Permission check */
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const modulePermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "MAT Registration"
      );

      if (!modulePermission?.edit) {
        return res.status(403).json({
          message: "No permission to verify payment",
        });
      }
    }

    /* ❗ Validate */
    if (typeof paymentVerified !== "boolean") {
      return res.status(400).json({
        message: "paymentVerified must be true or false",
      });
    }

    const record = await MatTraining.findById(id);

    if (!record) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    if (!record.paymentScreenshot) {
      return res.status(400).json({
        message: "Upload payment screenshot first",
      });
    }
    const wasVerified = record.paymentVerified;
    /* ✅ Update */
    record.paymentVerified = paymentVerified;

    if (paymentVerified) {
      record.verifiedBy = user.id;              // 🔥 store who verified
      record.paymentVerifiedAt = new Date();    // 🔥 timestamp
    } else {
      record.verifiedBy = undefined;            // reset
      record.paymentVerifiedAt = undefined;
    }

    await record.save();
    try {
      if (paymentVerified && !wasVerified && record.email) {
        await sendPaymentVerifiedEmail(
          record.email,
          record.name,
          record.regId
        );
      }
    } catch (err) {
      console.error("Verification email failed:", err);
    }

    res.json({
      message: paymentVerified
        ? "Payment verified successfully"
        : "Payment verification removed",
      data: record,
    });

  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};

/* =========================
   EXPORT (NO PAGINATION)
========================= */
export const exportMatTraining = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { search, city, studentWorking, startDate, endDate, paymentStatus,
      verificationStatus, } = req.query;
    const user = req.user;
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    // 🔐 Permission check
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const modulePermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "MAT Registration"
      );

      if (!modulePermission?.filter) {
        return res.status(403).json({
          message: "No permission to export data",
        });
      }
    }

    let filter: any = {};

    // 🔍 Search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { mobile: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
        { regId: { $regex: search, $options: "i" } },
      ];
    }

    // 📅 Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    if (city && city !== "all") {
      filter.city = city;
    }

    // 💰 Payment Screenshot Filter
    if (paymentStatus && paymentStatus !== "all") {
      if (paymentStatus === "submitted") {
        filter.paymentScreenshot = { $ne: null };
      } else if (paymentStatus === "not_submitted") {
        filter.$or = [
          { paymentScreenshot: { $exists: false } },
          { paymentScreenshot: null },
          { paymentScreenshot: "" },
        ];
      }
    }

    // ✅ Verification Filter
    if (verificationStatus && verificationStatus !== "all") {
      if (verificationStatus === "verified") {
        filter.paymentVerified = true;
      } else if (verificationStatus === "not_verified") {
        filter.paymentVerified = false;
      }
    }

    if (studentWorking && studentWorking !== "all") {
      filter.studentWorking = studentWorking;
    }

    const data = await MatTraining.find(filter).sort({ createdAt: -1 });

    res.json({
      total: data.length,
      data,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   GET SINGLE
========================= */
export const getMatTraining = async (req: Request, res: Response) => {
  try {
    const data = await MatTraining.findById(req.params.id);

    if (!data) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE
========================= */
export const updateMatTraining = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updated = await MatTraining.findByIdAndUpdate(
      id,
      { $set: req.body },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({
      message: "Updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   DELETE
========================= */
export const deleteMatTraining = async (req: Request, res: Response) => {
  try {
    const deleted = await MatTraining.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};