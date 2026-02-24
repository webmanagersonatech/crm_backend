import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import Payment from "./model";
import Settings from "../settings/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import { createPaymentSchema } from "./payment.sanitize";
import Application from "../applications/model";

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID!,
  key_secret: process.env.RAZORPAY_KEY_SECRET!,
});

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
    const student = req.student;


    if (!student) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const settings = await Settings.findOne({instituteId: student.instituteId});
    if (!settings) {
      return res.status(400).json({ message: "Settings not configured" });
    }

    const amount =settings.applicationFee

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

    // 🔥 Create Razorpay Order (amount in paise)
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
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      key: process.env.RAZORPAY_KEY_ID,
      student: {
        name: `${student.firstname} ${student.lastname}`,
        email: student.email,
        contact: student.mobileNo,
      },
      paymentId: payment._id,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Payment creation failed",
    });
  }
};

// =============================
// VERIFY PAYMENT
// =============================
export const verifyPayment = async (
  req: Request,
  res: Response
) => {
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

    const body = razorpay_order_id + "|" + razorpay_payment_id;

    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid signature",
      });
    }

    const data = await Payment.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: "paid",
        paymentId: razorpay_payment_id,
      },
      { new: true } // 👈 important
    );

    // ✅ CHECK IF DATA EXISTS
    if (!data) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    if (data.status === "paid") {
      await Application.findOneAndUpdate(
        { applicationId: data.applicationId },
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
// ADMIN - LIST PAYMENTS
// =============================
export const listPayments = async (
  req: Request,
  res: Response
) => {
  const payments = await Payment.find()
    .populate("studentId", "firstname lastname email")
    .sort({ createdAt: -1 });

  res.json(payments);
};