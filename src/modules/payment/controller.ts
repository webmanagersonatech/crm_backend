import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from "axios";
import Payment from "./model";
import Settings from "../settings/model";
import Application from "../applications/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";

// const razorpay = new Razorpay({
//   key_id: process.env.RAZORPAY_KEY_ID!,
//   key_secret: process.env.RAZORPAY_KEY_SECRET!,
// });

// ========================================================
// RAZORPAY CREATE
// ========================================================
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

    const amount = settings.applicationFee;

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: `receipt_${applicationId}`,
    });

    await Payment.create({
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
      key: settings.paymentCredentials.keyId,
      amount: order.amount,
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

    const amount = settings.applicationFee;

    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      {
        amount: amount.toString(),
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
      amount,
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
export const listPayments = async (req: Request, res: Response) => {
  const payments = await Payment.find()
    .populate("studentId", "firstname lastname email")
    .sort({ createdAt: -1 });

  res.json(payments);
};