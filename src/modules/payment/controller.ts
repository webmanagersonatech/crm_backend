// payments/controller.ts
import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "./model";
import Settings from "../settings/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import { createPaymentSchema } from "./payment.sanitize";
import Application from "../applications/model";
import axios from "axios";


// Define interfaces for your data types
interface Student {
  studentId: string;
  instituteId: string;
  firstname: string;
  lastname: string;
  email: string;
  mobileNo: string;
}

interface Settings {
  applicationFee: number;
  paymentMethod: string;
  paymentCredentials: {
    keyId?: string;
    keySecret?: string;
    apiKey?: string;
    authToken?: string;
  };
}
const Instamojo = require('instamojo-nodejs');
// =============================
// CREATE PAYMENT (Student)
// =============================
export const createPayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { error } = createPaymentSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        message: error.details[0].message,
      });
    }

    const { applicationId } = req.body;
    const student = req.student as Student;

    if (!student) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const settings = await Settings.findOne({ instituteId: student.instituteId }) as Settings | null;
    if (!settings) {
      return res.status(400).json({ message: "Settings not configured" });
    }

    const amount = settings.applicationFee;

    // Check if already paid
    const alreadyPaid = await Payment.findOne({
      applicationId,
      studentId: student.studentId,
      status: "paid",
      instituteId: student.instituteId
    });

    if (alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: "Payment already completed",
      });
    }

    // Create payment based on institute's payment method
    if (settings.paymentMethod === "razorpay") {
      return await createRazorpayPayment(req, res, student, applicationId, amount, settings);
    } else if (settings.paymentMethod === "instamojo") {
      return await createInstamojoPayment(req, res, student, applicationId, amount, settings);
    } else {
      return res.status(400).json({
        success: false,
        message: "Payment method not configured for this institute",
      });
    }
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Payment creation failed",
    });
  }
};

// =============================
// RAZORPAY PAYMENT CREATION
// =============================
const createRazorpayPayment = async (
  req: Request,
  res: Response,
  student: Student,
  applicationId: string,
  amount: number,
  settings: Settings
) => {
  // Initialize Razorpay with institute credentials
  const razorpay = new Razorpay({
    key_id: settings.paymentCredentials.keyId || process.env.RAZORPAY_KEY_ID!,
    key_secret: settings.paymentCredentials.keySecret || process.env.RAZORPAY_KEY_SECRET!,
  });

  // Create Razorpay Order (amount in paise)
  const order = await razorpay.orders.create({
    amount: amount * 100,
    currency: "INR",
    receipt: `receipt_${applicationId}`,
  });

  const payment = await Payment.create({
    studentId: student.studentId,
    applicationId,
    amount,
    instituteId: student.instituteId,
    orderId: order.id,
    status: "pending",
    gateway: "razorpay",
  });

  return res.json({
    success: true,
    gateway: "razorpay",
    orderId: order.id,
    amount: order.amount,
    currency: order.currency,
    key: settings.paymentCredentials.keyId || process.env.RAZORPAY_KEY_ID,
    student: {
      name: `${student.firstname} ${student.lastname}`,
      email: student.email,
      contact: student.mobileNo,
    },
    paymentId: payment._id,
  });
};

// =============================
// INSTAMOJO PAYMENT CREATION
// =============================
// payments/controller.ts - Update the createInstamojoPayment function

const createInstamojoPayment = async (
  req: Request,
  res: Response,
  student: Student,
  applicationId: string,
  amount: number,
  settings: Settings
) => {
  try {
    // Use v1.1 API endpoint (not v2)
    const BASE_URL = process.env.NODE_ENV === "production"
      ? "https://www.instamojo.com/api/1.1"
      : "https://test.instamojo.com/api/1.1";

    // For v1.1 API, the payload format is different
    const payload = {
      purpose: `Application Fee - ${applicationId}`,
      amount: amount,
      buyer_name: `${student.firstname} ${student.lastname}`,
      email: student.email,
      phone: student.mobileNo,
      redirect_url: `${process.env.FRONTEND_URL}/payment?status=success&payment_request_id=`,
      webhook: `${process.env.BACKEND_URL}/api/payments/instamojo-webhook`,
      allow_repeated_payments: false,
      send_email: false,
      send_sms: false
    };

    const response = await axios.post(
      `${BASE_URL}/payment-requests/`,
      payload,
      {
        headers: {
          "X-Api-Key": settings.paymentCredentials.apiKey || process.env.INSTAMOJO_API_KEY!,
          "X-Auth-Token": settings.paymentCredentials.authToken || process.env.INSTAMOJO_AUTH_TOKEN!,
          "Content-Type": "application/x-www-form-urlencoded"
        },
      }
    );

    // v1.1 response structure is different
    if (response.data.success) {
      const paymentRequest = response.data.payment_request;

      await Payment.create({
        studentId: student.studentId,
        applicationId,
        amount,
        instituteId: student.instituteId,
        orderId: paymentRequest.id,
        status: "pending",
        gateway: "instamojo",
      });

      return res.json({
        success: true,
        gateway: "instamojo",
        longurl: paymentRequest.longurl, // Make sure this matches what frontend expects
        paymentId: paymentRequest.id
      });
    } else {
      throw new Error(response.data.message || "Instamojo payment creation failed");
    }

  } catch (error: any) {
    console.error("Instamojo Error Details:", {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status
    });
    
    return res.status(500).json({
      success: false,
      message: "Failed to create Instamojo payment: " + (error.response?.data?.message || error.message),
    });
  }
};

// =============================
// VERIFY PAYMENT (Razorpay)
// =============================
export const verifyPayment = async (req: Request, res: Response) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment details",
      });
    }

    // Find payment to get institute settings
    const payment: any = await Payment.findOne({ orderId: razorpay_order_id });
    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    const settings = await Settings.findOne({ instituteId: payment.instituteId });
    const keySecret = settings?.paymentCredentials?.keySecret || process.env.RAZORPAY_KEY_SECRET!;

    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", keySecret)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    const updatedPayment = await Payment.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: "paid",
        paymentId: razorpay_payment_id,
      },
      { new: true }
    );

    if (updatedPayment && updatedPayment.status === "paid") {
      await Application.findOneAndUpdate(
        { applicationId: updatedPayment.applicationId },
        { paymentStatus: "Paid" },
        { new: true }
      );
    }

    return res.json({
      success: true,
      message: "Payment verified successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Verification failed",
    });
  }
};

// =============================
// INSTAMOJO CALLBACK
// =============================
// Update the instamojoCallback function
export const instamojoCallback = async (req: Request, res: Response) => {
  try {
    // v1.1 callback sends different parameters
    const { payment_request_id, payment_id, payment_status } = req.body;

    console.log("Instamojo Callback Received:", { payment_request_id, payment_id, payment_status });

    if (payment_status === 'Credit' || payment_status === 'success') {
      const payment = await Payment.findOneAndUpdate(
        { orderId: payment_request_id },
        {
          status: "paid",
          paymentId: payment_id,
        },
        { new: true }
      );

      if (payment) {
        await Application.findOneAndUpdate(
          { applicationId: payment.applicationId },
          { paymentStatus: "Paid" },
          { new: true }
        );
        
        console.log(`Payment ${payment_id} processed successfully for application ${payment.applicationId}`);
      }

      // Redirect to frontend with success status and payment details
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment?status=success&payment_id=${payment_id}&request_id=${payment_request_id}`
      );
    } else {
      return res.redirect(
        `${process.env.FRONTEND_URL}/payment?status=failed&request_id=${payment_request_id}`
      );
    }
  } catch (error) {
    console.error("Instamojo Callback Error:", error);
    return res.redirect(`${process.env.FRONTEND_URL}/payment?status=error`);
  }
};

// =============================
// INSTAMOJO WEBHOOK
// =============================
export const instamojoWebhook = async (req: Request, res: Response) => {
  try {
    const { payment_request_id, payment_id, status } = req.body;

    if (status === 'Credit') {
      const payment = await Payment.findOneAndUpdate(
        { orderId: payment_request_id },
        {
          status: "paid",
          paymentId: payment_id,
        },
        { new: true }
      );

      if (payment) {
        await Application.findOneAndUpdate(
          { applicationId: payment.applicationId },
          { paymentStatus: "Paid" },
          { new: true }
        );
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
};

// =============================
// ADMIN - LIST PAYMENTS
// =============================
export const listPayments = async (req: Request, res: Response) => {
  const payments = await Payment.find()
    .populate("studentId", "firstname lastname email")
    .sort({ createdAt: -1 });

  res.json(payments);
};

// =============================
// GET PAYMENT STATUS
// =============================
export const getPaymentStatus = async (req: StudentAuthRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const student = req.student as Student;

    const payment = await Payment.findOne({
      applicationId,
      studentId: student?.studentId,
    });

    if (!payment) {
      return res.json({
        success: true,
        status: "not_found",
        message: "No payment found for this application",
      });
    }

    return res.json({
      success: true,
      status: payment.status,
      gateway: payment.gateway,
      amount: payment.amount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment status",
    });
  }
};