// payments/controller.ts
import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "./model";
import Settings from "../settings/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import { createPaymentSchema } from "./payment.sanitize";
import Application from "../applications/model";


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
const createInstamojoPayment = async (
  req: Request,
  res: Response,
  student: Student,
  applicationId: string,
  amount: number,
  settings: Settings
) => {
  // Configure Instamojo
  Instamojo.setKeys(
    settings.paymentCredentials.apiKey || process.env.INSTAMOJO_API_KEY!,
    settings.paymentCredentials.authToken || process.env.INSTAMOJO_AUTH_TOKEN!
  );

  // Set sandbox mode based on environment
  Instamojo.isSandboxMode(process.env.NODE_ENV !== 'production');

  const data = new Instamojo.PaymentData();
  data.purpose = `Application Fee for ${applicationId}`;
  data.amount = amount;
  data.buyer_name = `${student.firstname} ${student.lastname}`;
  data.email = student.email;
  data.phone = student.mobileNo;
  data.send_email = true;
  data.send_sms = true;
  data.allow_repeated_payments = false;
  // Your live frontend URL
  data.redirect_url = `https://hikaapp.sonastar.com/payment/instamojo-callback`;
  
  // Your live backend URL
  data.webhook_url = `https://hikabackend.sonastar.com/api/payments/instamojo-webhook`;

  try {
    const response = await new Promise<any>((resolve, reject) => {
      Instamojo.createPayment(data, (error: any, response: any) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });

    if (response.success) {
      // Create payment record
      const payment = await Payment.create({
        studentId: student.studentId,
        applicationId,
        amount,
        instituteId: student.instituteId,
        orderId: response.payment_request.id,
        status: "pending",
        gateway: "instamojo",
      });

      return res.json({
        success: true,
        gateway: "instamojo",
        paymentRequest: response.payment_request,
        paymentId: payment._id,
        longurl: response.payment_request.longurl,
      });
    } else {
      throw new Error("Instamojo payment creation failed");
    }
  } catch (error) {
    console.error("Instamojo Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to create Instamojo payment",
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
export const instamojoCallback = async (req: Request, res: Response) => {
  try {
    const { payment_request_id, payment_id, payment_status } = req.body;

    if (payment_status === 'Credit') {
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

      // Redirect to success page
      return res.redirect(`${process.env.FRONTEND_URL}/dashboard?payment=success`);
    } else {
      return res.redirect(`${process.env.FRONTEND_URL}/payment?status=failed`);
    }
  } catch (error) {
    console.error(error);
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