import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from "axios";
import Payment from "./model";
import Settings from "../settings/model";
import Application from "../applications/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import qs from "querystring";
import { AuthRequest } from "../auth";
import Permission from "../permissions/model";
import moment from "moment-timezone";
import Student from "../students/model";
import mongoose from "mongoose";
// CCAvenue encrypt

const encryptCCAvenue = (
  plainText: string,
  workingKey: string
) => {

  const key = crypto
    .createHash("md5")
    .update(workingKey)
    .digest();

  const iv = Buffer.from([
    0x00, 0x01, 0x02, 0x03,
    0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f,
  ]);

  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    key,
    iv
  );

  let encrypted = cipher.update(
    plainText,
    "utf8",
    "hex"
  );

  encrypted += cipher.final("hex");

  return encrypted;
};

const merchantId = "4444425";

const accessCode =
  "AVPD92NE73BU04DPUB";

const workingKey =
  "A3E677B669EA7384BB6975849E0B6E10";
// CCAvenue Decrypt


const decryptCCAvenue = (
  encryptedText: string,
  workingKey: string
) => {

  const key = crypto
    .createHash("md5")
    .update(workingKey)
    .digest();

  const iv = Buffer.from([
    0x00, 0x01, 0x02, 0x03,
    0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b,
    0x0c, 0x0d, 0x0e, 0x0f,
  ]);

  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    key,
    iv
  );

  let decrypted = decipher.update(
    encryptedText,
    "hex",
    "utf8"
  );

  decrypted += decipher.final("utf8");

  return decrypted;
};
export const createCCAvenuePayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {

    const { applicationId } = req.body;

    const student = req.student;


    if (!student) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });

    if (!settings) {
      return res.status(400).json({
        message: "Settings not configured",
      });
    }

    const baseAmount = settings.applicationFee;

    const gstPercentage =
      settings.gstPercentage || 0;

    const gst =
      (baseAmount * gstPercentage) / 100;

    const totalAmount =
      baseAmount + gst;
    console.log("Base Amount:", baseAmount);
    console.log("GST %:", gstPercentage);
    console.log("GST Amount:", gst);
    console.log("Total Amount:", totalAmount);
    const orderId =
      `CCA_${Date.now()}`;

    // SAVE PAYMENT
    await Payment.create({
      studentId: student.studentId,
      applicationId,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount,
      instituteId: student.instituteId,
      orderId,
      status: "pending",
      gateway: "ccavenue",
    });



    // const paymentData = {
    //   merchant_id: merchantId.toString(),

    //   order_id: orderId,

    //   currency: "INR",

    //   amount: totalAmount.toString(),

    //   redirect_url:
    //     "https://hikabackend.sonastar.com/api/payments/ccavenue/success",

    //   cancel_url:
    //     "https://hikabackend.sonastar.com/api/payments/ccavenue/cancel",

    //   language: "EN",

    //   billing_name:
    //     `${student.firstname} ${student.lastname}`,

    //   billing_email:
    //     student.email,

    //   billing_tel:
    //     student.mobileNo,
    // };

    const paymentData = {
      merchant_id: merchantId,

      order_id: orderId,

      currency: "INR",

      amount: totalAmount.toFixed(2),

      redirect_url:
        "https://hikabackend.sonastar.com/api/payments/ccavenue/success",

      cancel_url:
        "https://hikabackend.sonastar.com/api/payments/ccavenue/cancel",

      language: "EN",

      billing_name:
        `${student.firstname} ${student.lastname}`,

      billing_email:
        student.email?.toLowerCase(),

      billing_tel:
        student.mobileNo,

      billing_address:
        student.address || "Salem",

      billing_city:
        student.city || "Salem",

      billing_state:
        student.state || "Tamil Nadu",

      billing_zip:
        student.pincode || "636001",

      billing_country:
        student.country || "India",
    };
    console.log("====================================");
    console.log("RAW PAYMENT DATA");
    console.log(paymentData);
    const data =
      qs.stringify(paymentData);

    console.log("====================================");
    console.log("STRINGIFIED DATA");
    console.log(data);
    console.log("====================================");

    const encryptedData =
      encryptCCAvenue(
        data,
        workingKey
      );

    console.log("====================================");
    console.log("ENCRYPTED DATA");
    console.log(encryptedData);
    console.log("====================================");

    return res.json({
      success: true,

      gateway: "ccavenue",

      accessCode: accessCode,

      merchantId: merchantId,

      encryptedData,
    });

  } catch (error) {

    console.log(
      "CCAvenue Create Error:",
      error
    );

    return res.status(500).json({
      message:
        "CCAvenue payment creation failed",
    });
  }
};

export const ccavenueSuccess = async (
  req: Request,
  res: Response
) => {

  try {

    const encResp = req.body.encResp;

    if (!encResp) {
      return res.status(400).send(
        "encResp missing"
      );
    }

    const settings =
      await Settings.findOne();

    if (!settings) {
      return res.status(400).send(
        "Settings missing"
      );
    }

    const decryptedData =
      decryptCCAvenue(
        encResp,
        workingKey
      );

    const responseData: any =
      qs.parse(decryptedData);

    const orderStatus =
      responseData.order_status;

    const orderId =
      responseData.order_id;

    const trackingId =
      responseData.tracking_id;

    // SUCCESS
    if (
      orderStatus === "Success"
    ) {

      const payment: any =
        await Payment.findOneAndUpdate(
          { orderId },
          {
            status: "paid",
            paymentId: trackingId,
          },
          { new: true }
        );

      if (payment) {

        await Application.findOneAndUpdate(
          {
            applicationId:
              payment.applicationId,
          },
          {
            paymentStatus: "Paid",
          }
        );
      }

      return res.redirect(
        `https://hikaapp.sonastar.com/payment?status=success&orderId=${orderId}`
      );
    }

    // FAILED
    return res.redirect(
      `https://hikaapp.sonastar.com/payment?status=failed&orderId=${orderId}`
    );

  } catch (error) {

    console.log(
      "CCAvenue Success Error:",
      error
    );

    return res.status(500).send(
      "CCAvenue verification failed"
    );
  }
};

export const ccavenueCancel = async (
  req: Request,
  res: Response
) => {

  return res.redirect(
    `https://hikaapp.sonastar.com/payment?status=cancelled`
  );
};

export const createRazorpayPayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { applicationId } = req.body;
    const student = req.student;
    if (!student) return res.status(401).json({ message: "Unauthorized" });

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });
    if (!settings)
      return res.status(400).json({ message: "Settings not configured" });

    const razorpay = new Razorpay({
      key_id: settings.paymentCredentials.keyId,
      key_secret: settings.paymentCredentials.keySecret,
    });

    const baseAmount = settings.applicationFee;
    const gstPercentage = settings?.gstPercentage || 0;
    const gst = (baseAmount * gstPercentage) / 100;
    const totalAmount = baseAmount + gst;

    const order = await razorpay.orders.create({
      amount: totalAmount * 100,
      currency: "INR",
      receipt: `receipt_${applicationId}`,
    });

    await Payment.create({
      studentId: student.studentId,
      applicationId,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount: totalAmount,
      instituteId: student.instituteId,
      orderId: order.id,
      status: "pending",
      gateway: "razorpay",
    });

    return res.json({
      success: true,
      orderId: order.id,
      key: settings.paymentCredentials.keyId,
      amount: totalAmount * 100,
    });
  } catch (error) {
    return res.status(500).json({ message: "Razorpay creation failed" });
  }
};

// ========================================================
// RAZORPAY VERIFY
// ========================================================
export const verifyRazorpayPayment = async (
  req: Request,
  res: Response
) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    const payment: any = await Payment.findOne({ orderId: razorpay_order_id });

    if (!payment)
      return res.status(404).json({ message: "Payment not found" });

    // ✅ Fetch institute settings
    const settings = await Settings.findOne({
      instituteId: payment.instituteId,
    });

    if (!settings?.paymentCredentials?.keySecret)
      return res.status(400).json({ message: "Payment config missing" });

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", settings.paymentCredentials.keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature)
      return res.status(400).json({ message: "Invalid signature" });

    await Payment.findOneAndUpdate(
      { orderId: razorpay_order_id },
      { status: "paid", paymentId: razorpay_payment_id }
    );

    await Application.findOneAndUpdate(
      { applicationId: payment.applicationId },
      { paymentStatus: "Paid" }
    );

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Verification failed" });
  }
};

export const razorpayWebhook = async (req: Request, res: Response) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    const signature = req.headers["x-razorpay-signature"] as string;

    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature) {
      return res.status(400).json({ message: "Invalid webhook signature" });
    }

    const event = req.body.event;

    if (event === "payment.captured") {
      const paymentData = req.body.payload.payment.entity;

      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      const payment: any = await Payment.findOne({ orderId });

      if (!payment) return res.status(404).json({ message: "Payment not found" });

      if (payment.status === "paid") {
        return res.json({ success: true });
      }

      await Payment.findOneAndUpdate(
        { orderId },
        {
          status: "paid",
          paymentId,
        }
      );

      await Application.findOneAndUpdate(
        { applicationId: payment.applicationId },
        { paymentStatus: "Paid" }
      );
    }

    return res.json({ success: true });

  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).json({ message: "Webhook failed" });
  }
};
// ========================================================
// INSTAMOJO CREATE
// ========================================================
export const createInstamojoPayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { applicationId } = req.body;
    const student = req.student;
    if (!student) return res.status(401).json({ message: "Unauthorized" });

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });

    if (!settings)
      return res.status(400).json({ message: "Settings not configured" });

    const baseAmount = settings?.applicationFee;
    const gstPercentage = settings?.gstPercentage || 0;
    const gst = (baseAmount * gstPercentage) / 100;
    const totalAmount = baseAmount + gst;

    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      {
        amount: totalAmount.toString(),
        purpose: `Application Fee - ${applicationId}`,
        buyer_name: `${student.firstname} ${student.lastname}`,
        email: student.email,
        phone: student.mobileNo,
        redirect_url:
          "https://hikabackend.sonastar.com/api/payments/instamojo/redirect",
        webhook:
          "https://hikabackend.sonastar.com/api/payments/instamojo/webhook",
      },
      {
        headers: {
          "X-Api-Key": "354258c3f2d1eda35995dae1540db4b4",
          "X-Auth-Token": "7f76729963176d6cc7169105b0cd81f4",
        },
      }
    );

    const paymentRequest = response.data.payment_request;

    await Payment.create({
      studentId: student.studentId,
      applicationId,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount: totalAmount,
      instituteId: student.instituteId,
      orderId: paymentRequest.id,
      status: "pending",
      gateway: "instamojo",
    });

    return res.json({
      success: true,
      paymentUrl: paymentRequest.longurl,
    });
  } catch (error: any) {
    console.error(error.response?.data || error);
    return res.status(500).json({ message: "Instamojo failed" });
  }
};


export const verifyInstamojoRedirect = async (
  req: Request,
  res: Response
) => {
  const { payment_status, payment_request_id } = req.query;

  return res.redirect(
    `https://hikaapp.sonastar.com/payment?status=${payment_status}&orderId=${payment_request_id}`
  );
};

// ========================================================
// INSTAMOJO WEBHOOK (REAL CONFIRMATION)
// ========================================================
export const instamojoWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    console.log("Webhook Body:", req.body);

    const { payment_id, payment_request_id, status } = req.body;

    const normalizedStatus = status?.toString().toLowerCase().trim();

    if (normalizedStatus !== "credit") {
      console.log("Payment not credit:", status);
      return res.status(200).send("Ignored");
    }

    console.log("Payment Success Webhook Triggered");

    const payment = await Payment.findOneAndUpdate(
      { orderId: payment_request_id },
      { status: "paid", paymentId: payment_id },
      { new: true }
    );

    if (payment) {
      await Application.findOneAndUpdate(
        { applicationId: payment.applicationId },
        { paymentStatus: "Paid" }
      );
      console.log("Application updated");
    } else {
      console.log("Payment not found in DB");
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.log("Webhook Error:", error);
    return res.status(500).send("Webhook failed");
  }
};


// ========================================================
// GET ALL PAID PAYMENTS (role-based + date filter)
// ========================================================
export const getAllPaidPayments = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ---------------- PAGINATION ----------------
    const page = Math.max(
      1,
      parseInt(String(req.query.page), 10) || 1
    );

    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit), 10) || 10)
    );

    const skip = (page - 1) * limit;

    // ---------------- FILTERS ----------------
    const search = String(req.query.search || "").trim();
    const startDate = req.query.startDate
      ? String(req.query.startDate)
      : "";
    const endDate = req.query.endDate
      ? String(req.query.endDate)
      : "";
    const gateway = String(req.query.gateway || "all");
    const requestedInstituteId = String(
      req.query.instituteId || "all"
    );

    const query: any = {
      status: "paid",
    };

    // ---------------- ROLE ACCESS ----------------
    if (user.role === "superadmin") {
      if (requestedInstituteId !== "all") {
        query.instituteId = requestedInstituteId;
      }
    } else if (user.role === "admin") {
      query.instituteId = user.instituteId;
    } else {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const paymentPermission =
        permissionDoc?.permissions.find(
          (p: any) => p.moduleName === "Application Payment"
        );

      if (!paymentPermission?.view) {
        return res.status(403).json({
          success: false,
          message: "You have no permission to view payments",
        });
      }

      query.instituteId = user.instituteId;
    }

    // ---------------- DATE FILTER ----------------
    const createdAt: any = {};

    if (startDate) {
      const start = moment.tz(
        startDate,
        "YYYY-MM-DD",
        true,
        "Asia/Kolkata"
      );

      if (!start.isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate. Use YYYY-MM-DD.",
        });
      }

      createdAt.$gte = start.startOf("day").toDate();
    }

    if (endDate) {
      const end = moment.tz(
        endDate,
        "YYYY-MM-DD",
        true,
        "Asia/Kolkata"
      );

      if (!end.isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate. Use YYYY-MM-DD.",
        });
      }

      createdAt.$lte = end.endOf("day").toDate();
    }

    if (
      startDate &&
      endDate &&
      createdAt.$gte > createdAt.$lte
    ) {
      return res.status(400).json({
        success: false,
        message: "startDate must be before or equal to endDate.",
      });
    }

    if (Object.keys(createdAt).length) {
      query.createdAt = createdAt;
    }

    // ---------------- GATEWAY FILTER ----------------
    if (gateway !== "all") {
      const allowedGateways = [
        "razorpay",
        "instamojo",
        "ccavenue",
      ];

      if (!allowedGateways.includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment gateway",
        });
      }

      query.gateway = gateway;
    }

    // ---------------- SEARCH ----------------
    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const regex = new RegExp(escapedSearch, "i");

      const matchingStudents = await Student.find({
        ...(query.instituteId
          ? { instituteId: query.instituteId }
          : {}),
        $or: [
          { firstname: regex },
          { lastname: regex },
          { email: regex },
          { mobileNo: regex },
          { username: regex },
          { studentId: regex },
        ],
      })
        .select("studentId")
        .lean();

      const matchingStudentIds = matchingStudents.map(
        (student: any) => student.studentId
      );

      query.$or = [
        { orderId: regex },
        { paymentId: regex },
        { applicationId: regex },
        { studentId: regex },
        ...(matchingStudentIds.length
          ? [{ studentId: { $in: matchingStudentIds } }]
          : []),
      ];
    }

    // ---------------- FETCH + COUNT ----------------
    const [payments, total] = await Promise.all([
      Payment.find(query)
        .populate({
          path: "student",
          select:
            "studentId firstname lastname email mobileNo username",
        })
        .populate({
          path: "institute",
          select: "name instituteName instituteId code",
        })
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),

      Payment.countDocuments(query),
    ]);

    // ---------------- SUMMARY ----------------
    const [summary] = await Payment.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalAmount: {
            $sum: { $ifNull: ["$totalAmount", "$amount"] },
          },
          totalBaseAmount: { $sum: "$amount" },
          totalGst: { $sum: { $ifNull: ["$gstAmount", 0] } },
          count: { $sum: 1 },
        },
      },
    ]);

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,

      data: payments,

      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },

      summary: {
        totalPaidAmount: summary?.totalAmount ?? 0,
        totalBaseAmount: summary?.totalBaseAmount ?? 0,
        totalGst: summary?.totalGst ?? 0,
        totalPaidCount: summary?.count ?? 0,
      },

      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
        gateway,
        instituteId:
          user.role === "superadmin"
            ? requestedInstituteId
            : user.instituteId,
      },
    });
  } catch (err: any) {
    console.error("getAllPaidPayments error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};
// ========================================================
// EXPORT ALL PAID PAYMENTS (no pagination)
// ========================================================
export const exportAllPaidPayments = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // ---------------- FILTERS ----------------
    const search = String(req.query.search || "").trim();
    const startDate = req.query.startDate
      ? String(req.query.startDate)
      : "";
    const endDate = req.query.endDate
      ? String(req.query.endDate)
      : "";
    const gateway = String(req.query.gateway || "all");
    const requestedInstituteId = String(
      req.query.instituteId || "all"
    );

    const query: any = {
      status: "paid",
    };

    // ---------------- ROLE ACCESS ----------------
    if (user.role === "superadmin") {
      if (requestedInstituteId !== "all") {
        query.instituteId = requestedInstituteId;
      }
    } else if (user.role === "admin") {
      query.instituteId = user.instituteId;
    } else {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const paymentPermission =
        permissionDoc?.permissions.find(
          (p: any) => p.moduleName === "Application Payment"
        );

      if (!paymentPermission?.download) {
        return res.status(403).json({
          success: false,
          message: "You have no permission to download payments",
        });
      }

      query.instituteId = user.instituteId;
    }

    // ---------------- DATE FILTER ----------------
    const createdAt: any = {};

    if (startDate) {
      const start = moment.tz(
        startDate,
        "YYYY-MM-DD",
        true,
        "Asia/Kolkata"
      );

      if (!start.isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid startDate. Use YYYY-MM-DD.",
        });
      }

      createdAt.$gte = start.startOf("day").toDate();
    }

    if (endDate) {
      const end = moment.tz(
        endDate,
        "YYYY-MM-DD",
        true,
        "Asia/Kolkata"
      );

      if (!end.isValid()) {
        return res.status(400).json({
          success: false,
          message: "Invalid endDate. Use YYYY-MM-DD.",
        });
      }

      createdAt.$lte = end.endOf("day").toDate();
    }

    if (
      startDate &&
      endDate &&
      createdAt.$gte > createdAt.$lte
    ) {
      return res.status(400).json({
        success: false,
        message: "startDate must be before or equal to endDate.",
      });
    }

    if (Object.keys(createdAt).length) {
      query.createdAt = createdAt;
    }

    // ---------------- GATEWAY FILTER ----------------
    if (gateway !== "all") {
      const allowedGateways = [
        "razorpay",
        "instamojo",
        "ccavenue",
      ];

      if (!allowedGateways.includes(gateway)) {
        return res.status(400).json({
          success: false,
          message: "Invalid payment gateway",
        });
      }

      query.gateway = gateway;
    }

    // ---------------- SEARCH ----------------
    if (search) {
      const escapedSearch = search.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      );

      const regex = new RegExp(escapedSearch, "i");

      const matchingStudents = await Student.find({
        ...(query.instituteId
          ? { instituteId: query.instituteId }
          : {}),
        $or: [
          { firstname: regex },
          { lastname: regex },
          { email: regex },
          { mobileNo: regex },
          { username: regex },
          { studentId: regex },
        ],
      })
        .select("studentId")
        .lean();

      const matchingStudentIds = matchingStudents.map(
        (student: any) => student.studentId
      );

      query.$or = [
        { orderId: regex },
        { paymentId: regex },
        { applicationId: regex },
        { studentId: regex },
        ...(matchingStudentIds.length
          ? [{ studentId: { $in: matchingStudentIds } }]
          : []),
      ];
    }

    // ---------------- FETCH ALL (no pagination) ----------------
    const payments = await Payment.find(query)
      .populate({
        path: "student",
        select:
          "studentId firstname lastname email mobileNo username",
      })
      .populate({
        path: "institute",
        select: "name instituteName instituteId code",
      })
      .sort({ createdAt: -1, _id: -1 })
      .lean({ virtuals: true });

    // ---------------- RESPONSE ----------------
    return res.status(200).json({
      success: true,
      message: "Paid payments exported successfully",
      data: payments,
      totalCount: payments.length,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
        gateway,
        instituteId:
          user.role === "superadmin"
            ? requestedInstituteId
            : user.instituteId,
      },
    });
  } catch (err: any) {
    console.error("exportAllPaidPayments error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};
// ========================================================
export const listPayments = async (req: Request, res: Response) => {
  const payments = await Payment.find()
    .populate("studentId", "firstname lastname email")
    .sort({ createdAt: -1 });

  res.json(payments);
};