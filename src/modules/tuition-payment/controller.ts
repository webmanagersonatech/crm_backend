import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import mongoose from "mongoose";
import axios from "axios";
import qs from "querystring";

// Models
import TuitionFee from "./model";
import FeeConfiguration from '../fee-configuartion/model'
import Settings from "../settings/model";
import FeeConcession from "../fees-concession/model";
// Types
import { StudentAuthRequest } from "../../middlewares/studentAuth";

// ============================================================
// CONSTANTS
// ============================================================

const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed"
} as const;

const PAYMENT_GATEWAY = {
  RAZORPAY: "razorpay",
  INSTAMOJO: "instamojo",
  CCAVENUE: "ccavenue"
} as const;

const CURRENCY = "INR";

// ============================================================
// CCAVENUE ENCRYPT/DECRYPT FUNCTIONS
// ============================================================

const encryptCCAvenue = (plainText: string, workingKey: string) => {
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

  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");

  return encrypted;
};

const decryptCCAvenue = (encryptedText: string, workingKey: string) => {
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

  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
};

// ============================================================
// CREATE RAZORPAY TUITION FEE ORDER
// ============================================================

export const createRazorpayPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { year, installmentNumber } = req.body;
    console.log(req.body, "kkk")
    const student = req.student;

    // Validate student
    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Prevent duplicate payment
    const alreadyPaid = await TuitionFee.findOne({
      studentId: student.studentId,
      instituteId: student.instituteId,
      year: String(year),
      installmentNumber: Number(installmentNumber),
      status: PAYMENT_STATUS.PAID,
    });

    if (alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: `Installment ${installmentNumber} already paid`,
      });
    }

    // Get Fee Configuration
    const feeConfig = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfig) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    // Find Course
    const course = feeConfig.courseFeeStructure.find(
      (item: any) => item.courseId === student.programId
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course fee not configured",
      });
    }

    // Find Year
    const yearData = course.years.find(
      (item: any) => item.year === String(year)
    );

    if (!yearData) {
      return res.status(404).json({
        success: false,
        message: "Year fee not found",
      });
    }

    // Find payment option (installment) from paymentoptions array
    const paymentOption = yearData.paymentoptions.find(
      (item: any) => item.number === Number(installmentNumber)
    );

    if (!paymentOption) {
      return res.status(404).json({
        success: false,
        message: "Payment option not found",
      });
    }

    // -------------------------------------------------------
    // Fee Concession Calculation
    // -------------------------------------------------------

    const feeConcession = await FeeConcession.findOne({
      studentId: new mongoose.Types.ObjectId(student.id),
      instituteId: student.instituteId,
      status: "approved",
    }).select("referralIds");

    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length) {
      matchedReferrals = feeConfig.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (total: number, ref: any) =>
          total + Number(ref.percentage || 0),
        0
      );
    }

    // Original payment option amount
    const originalAmount = paymentOption.amount;

    // Discount amount
    const concessionAmount =
      (originalAmount * concessionPercentage) / 100;

    // Amount after concession
    const amount = originalAmount - concessionAmount;

    // GST
    const gstAmount = 0;

    // Final payable amount
    const totalAmount = amount + gstAmount;

    // -------------------------------------------------------
    // Payment Settings
    // -------------------------------------------------------

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });

    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Razorpay settings missing",
      });
    }

    // Razorpay Instance
    const razorpay = new Razorpay({
      key_id: settings.paymentCredentials.keyId,
      key_secret: settings.paymentCredentials.keySecret,
    });

    // Create Order
    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: CURRENCY,
      receipt: `TF${Date.now()}`,
    });

    // Save Transaction with payment option type
    await TuitionFee.create({
      studentId: student.studentId,
      instituteId: student.instituteId,

      courseId: course.courseId,
      courseName: course.name,

      academicYear: student.academicYear,
      year,
      installmentNumber: paymentOption.number,
      paymentType: paymentOption.type, // Save the type (full_payment or installment)

      originalAmount,
      concessionPercentage,
      concessionAmount,

      amount,
      gstAmount,
      totalAmount,

      orderId: order.id,
      status: PAYMENT_STATUS.PENDING,
      gateway: PAYMENT_GATEWAY.RAZORPAY,
    });

    return res.status(200).json({
      success: true,
      orderId: order.id,
      key: settings.paymentCredentials.keyId,

      originalAmount,
      concessionPercentage,
      concessionAmount,
      payableAmount: totalAmount,

      matchedReferrals,

      amount: Math.round(totalAmount * 100),
    });
  } catch (error) {
    console.error("Create Payment Error:", error);

    return res.status(500).json({
      success: false,
      message: "Payment order creation failed",
    });
  }
};

// ============================================================
// VERIFY RAZORPAY PAYMENT
// ============================================================

export const verifyRazorpayPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    // 1. Extract payment data from request
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature
    } = req.body;

    // 2. Find tuition fee transaction
    const tuition = await TuitionFee.findOne({
      orderId: razorpay_order_id
    });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found"
      });
    }

    // 3. Fetch payment settings
    const settings = await Settings.findOne({
      instituteId: tuition.instituteId
    });

    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Payment settings missing"
      });
    }
    if (!settings.paymentCredentials.keySecret) {
      return res.status(400).json({
        success: false,
        message: "Payment credentials not properly configured"
      });
    }
    // 4. Generate signature for verification
    const body = `${razorpay_order_id}|${razorpay_payment_id}`;
    const generatedSignature = crypto
      .createHmac("sha256", settings.paymentCredentials.keySecret)
      .update(body)
      .digest("hex");

    // 5. Verify signature
    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay signature"
      });
    }

    // 6. Update payment status
    await TuitionFee.findOneAndUpdate(
      { orderId: razorpay_order_id },
      {
        status: PAYMENT_STATUS.PAID,
        paymentId: razorpay_payment_id,
        paidDate: new Date()
      }
    );

    // 7. Return success response
    return res.json({
      success: true,
      message: "Payment completed"
    });

  } catch (error) {
    console.error("Verify Error:", error);
    return res.status(500).json({
      success: false,
      message: "Payment verification failed"
    });
  }
};

// ============================================================
// RAZORPAY WEBHOOK
// ============================================================

export const razorpayWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    // 1. Extract webhook signature
    const signature = req.headers["x-razorpay-signature"] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    // 2. Validate webhook signature
    const body = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret!)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature"
      });
    }

    // 3. Process webhook event
    const event = req.body.event;

    if (event === "payment.captured") {
      const paymentData = req.body.payload.payment.entity;
      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      // 4. Find tuition fee record
      const tuition = await TuitionFee.findOne({ orderId });

      if (!tuition) {
        return res.status(404).json({
          success: false,
          message: "Tuition fee record not found"
        });
      }

      // 5. Prevent duplicate processing
      if (tuition.status === PAYMENT_STATUS.PAID) {
        return res.json({ success: true });
      }

      // 6. Update payment status
      await TuitionFee.findOneAndUpdate(
        { orderId },
        {
          status: PAYMENT_STATUS.PAID,
          paymentId: paymentId,
          paidDate: new Date()
        }
      );
    }

    // 7. Return success response
    return res.json({ success: true });

  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).json({
      success: false,
      message: "Webhook processing failed"
    });
  }
};

// ============================================================
// CREATE INSTAMOJO TUITION FEE PAYMENT
// ============================================================

export const createInstamojoTuitionPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { year, installmentNumber } = req.body;
    const student = req.student;

    // Validate student
    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Prevent duplicate payment
    const alreadyPaid = await TuitionFee.findOne({
      studentId: student.studentId,
      instituteId: student.instituteId,
      year: String(year),
      installmentNumber: Number(installmentNumber),
      status: PAYMENT_STATUS.PAID,
    });

    if (alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: `Installment ${installmentNumber} already paid`,
      });
    }

    // Get Fee Configuration
    const feeConfig = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfig) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    // Find Course
    const course = feeConfig.courseFeeStructure.find(
      (item: any) => item.courseId === student.programId
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course fee not configured",
      });
    }

    // Find Year
    const yearData = course.years.find(
      (item: any) => item.year === String(year)
    );

    if (!yearData) {
      return res.status(404).json({
        success: false,
        message: "Year fee not found",
      });
    }

    // Find payment option from paymentoptions array
    const paymentOption = yearData.paymentoptions.find(
      (item: any) => item.number === Number(installmentNumber)
    );

    if (!paymentOption) {
      return res.status(404).json({
        success: false,
        message: "Payment option not found",
      });
    }

    // -------------------------------------------------------
    // Fee Concession Calculation
    // -------------------------------------------------------

    const feeConcession = await FeeConcession.findOne({
      studentId: new mongoose.Types.ObjectId(student.id),
      instituteId: student.instituteId,
      status: "approved",
    }).select("referralIds");

    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length) {
      matchedReferrals = feeConfig.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (total: number, ref: any) =>
          total + Number(ref.percentage || 0),
        0
      );
    }

    // Original payment option amount
    const originalAmount = paymentOption.amount;

    // Discount amount
    const concessionAmount =
      (originalAmount * concessionPercentage) / 100;

    // Amount after concession
    const amount = originalAmount - concessionAmount;

    // GST
    const gstAmount = 0;

    // Final payable amount
    const totalAmount = amount + gstAmount;

    // -------------------------------------------------------
    // Payment Settings
    // -------------------------------------------------------

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });

    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Instamojo settings missing",
      });
    }

    // Get Instamojo credentials from settings or use static
    const instamojoApiKey = settings.paymentCredentials.keyId
    const instamojoAuthToken = settings.paymentCredentials.keySecret

    if (!instamojoApiKey || !instamojoAuthToken) {
      return res.status(400).json({
        success: false,
        message: "Instamojo credentials not configured",
      });
    }

    // Create Instamojo Payment Request
    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      {
        amount: totalAmount.toString(),
        purpose: `Tuition Fee - Year ${year} - ${paymentOption.type === 'full_payment' ? 'Full Payment' : `Installment ${installmentNumber}`}`,
        buyer_name: `${student.firstname} ${student.lastname}`,
        email: student.email,
        phone: student.mobileNo,
        redirect_url: `${process.env.BASE_URL}/api/tuition-fee/instamojo/redirect`,
        webhook: `${process.env.BASE_URL}/api/tuition-fee/instamojo/webhook`,
        allow_repeated_payments: false,
        send_email: true,
        send_sms: true,
      },
      {
        headers: {
          "X-Api-Key": instamojoApiKey,
          "X-Auth-Token": instamojoAuthToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const paymentRequest = response.data.payment_request;

    // Save Transaction with payment type
    await TuitionFee.create({
      studentId: student.studentId,
      instituteId: student.instituteId,

      courseId: course.courseId,
      courseName: course.name,

      academicYear: student.academicYear,
      year,
      installmentNumber: paymentOption.number,
      paymentType: paymentOption.type, // Save the type

      originalAmount,
      concessionPercentage,
      concessionAmount,

      amount,
      gstAmount,
      totalAmount,

      orderId: paymentRequest.id,
      status: PAYMENT_STATUS.PENDING,
      gateway: PAYMENT_GATEWAY.INSTAMOJO,
    });

    return res.status(200).json({
      success: true,
      paymentUrl: paymentRequest.longurl,
      orderId: paymentRequest.id,

      originalAmount,
      concessionPercentage,
      concessionAmount,
      payableAmount: totalAmount,
      matchedReferrals,
    });

  } catch (error: any) {
    console.error("Create Instamojo Tuition Payment Error:", error.response?.data || error);

    return res.status(500).json({
      success: false,
      message: "Instamojo payment creation failed",
      error: error.response?.data?.message || "Internal server error",
    });
  }
};

// ============================================================
// INSTAMOJO TUITION FEE REDIRECT
// ============================================================

export const instamojoTuitionRedirect = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { payment_status, payment_request_id } = req.query;

    // Update payment status based on Instamojo response
    if (payment_status === "Credit" || payment_status === "credit") {
      await TuitionFee.findOneAndUpdate(
        { orderId: payment_request_id },
        {
          status: PAYMENT_STATUS.PAID,
          paidDate: new Date(),
        }
      );
    } else if (payment_status === "Failed" || payment_status === "failed") {
      await TuitionFee.findOneAndUpdate(
        { orderId: payment_request_id },
        {
          status: PAYMENT_STATUS.FAILED,
        }
      );
    }

    // Redirect to frontend payment status page
    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=${payment_status}&orderId=${payment_request_id}`
    );
  } catch (error) {
    console.error("Instamojo Redirect Error:", error);
    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=error`
    );
  }
};

// ============================================================
// INSTAMOJO TUITION FEE WEBHOOK
// ============================================================

export const instamojoTuitionWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    console.log("Instamojo Tuition Webhook Body:", req.body);

    const { payment_id, payment_request_id, status } = req.body;

    const normalizedStatus = status?.toString().toLowerCase().trim();

    if (normalizedStatus !== "credit") {
      console.log("Payment not credit:", status);
      return res.status(200).send("Ignored");
    }

    console.log("Instamojo Tuition Payment Success Webhook Triggered");

    // Find and update tuition fee
    const tuition = await TuitionFee.findOne({ orderId: payment_request_id });

    if (!tuition) {
      console.log("Tuition fee record not found for orderId:", payment_request_id);
      return res.status(404).send("Tuition fee record not found");
    }

    // Prevent duplicate processing
    if (tuition.status === PAYMENT_STATUS.PAID) {
      console.log("Tuition fee already paid:", payment_request_id);
      return res.status(200).send("Already processed");
    }

    // Update payment status
    await TuitionFee.findOneAndUpdate(
      { orderId: payment_request_id },
      {
        status: PAYMENT_STATUS.PAID,
        paymentId: payment_id,
        paidDate: new Date(),
      }
    );

    console.log("Tuition fee updated successfully:", payment_request_id);

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Instamojo Tuition Webhook Error:", error);
    return res.status(500).send("Webhook failed");
  }
};

// ============================================================
// CREATE CCAVENUE TUITION FEE PAYMENT
// ============================================================

// CCAvenue Static Credentials
const CCAVENUE_CONFIG = {
  merchantId: "4444425",
  accessCode: "AVPD92NE73BU04DPUB",
  workingKey: "A3E677B669EA7384BB6975849E0B6E10",
};

export const createCCAvenueTuitionPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { year, installmentNumber } = req.body;
    const student = req.student;

    // Validate student
    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Prevent duplicate payment
    const alreadyPaid = await TuitionFee.findOne({
      studentId: student.studentId,
      instituteId: student.instituteId,
      year: String(year),
      installmentNumber: Number(installmentNumber),
      status: PAYMENT_STATUS.PAID,
    });

    if (alreadyPaid) {
      return res.status(400).json({
        success: false,
        message: `Installment ${installmentNumber} already paid`,
      });
    }

    // Get Fee Configuration
    const feeConfig = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfig) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    // Find Course
    const course = feeConfig.courseFeeStructure.find(
      (item: any) => item.courseId === student.programId
    );

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course fee not configured",
      });
    }

    // Find Year
    const yearData = course.years.find(
      (item: any) => item.year === String(year)
    );

    if (!yearData) {
      return res.status(404).json({
        success: false,
        message: "Year fee not found",
      });
    }

    // Find payment option from paymentoptions array
    const paymentOption = yearData.paymentoptions.find(
      (item: any) => item.number === Number(installmentNumber)
    );

    if (!paymentOption) {
      return res.status(404).json({
        success: false,
        message: "Payment option not found",
      });
    }

    // -------------------------------------------------------
    // Fee Concession Calculation
    // -------------------------------------------------------

    const feeConcession = await FeeConcession.findOne({
      studentId: new mongoose.Types.ObjectId(student.id),
      instituteId: student.instituteId,
      status: "approved",
    }).select("referralIds");

    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length) {
      matchedReferrals = feeConfig.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (total: number, ref: any) =>
          total + Number(ref.percentage || 0),
        0
      );
    }

    // Original payment option amount
    const originalAmount = paymentOption.amount;

    // Discount amount
    const concessionAmount =
      (originalAmount * concessionPercentage) / 100;

    // Amount after concession
    const amount = originalAmount - concessionAmount;

    // GST
    const gstAmount = 0;

    // Final payable amount
    const totalAmount = amount + gstAmount;

    // -------------------------------------------------------
    // Generate Order ID
    // -------------------------------------------------------

    const orderId = `CCA_TF_${Date.now()}`;

    // Save Transaction with payment type
    await TuitionFee.create({
      studentId: student.studentId,
      instituteId: student.instituteId,

      courseId: course.courseId,
      courseName: course.name,

      academicYear: student.academicYear,
      year,
      installmentNumber: paymentOption.number,
      paymentType: paymentOption.type, // Save the type

      originalAmount,
      concessionPercentage,
      concessionAmount,

      amount,
      gstAmount,
      totalAmount,

      orderId: orderId,
      status: PAYMENT_STATUS.PENDING,
      gateway: PAYMENT_GATEWAY.CCAVENUE,
    });

    // -------------------------------------------------------
    // Prepare CCAvenue Payment Data
    // -------------------------------------------------------

    const baseUrl = process.env.BASE_URL || "https://hikabackend.sonastar.com";

    const paymentData = {
      merchant_id: CCAVENUE_CONFIG.merchantId,
      order_id: orderId,
      currency: "INR",
      amount: totalAmount.toFixed(2),
      redirect_url: `${baseUrl}/api/tuition-fee/ccavenue/success`,
      cancel_url: `${baseUrl}/api/tuition-fee/ccavenue/cancel`,
      language: "EN",
      billing_name: `${student.firstname} ${student.lastname}`,
      billing_email: student.email?.toLowerCase() || "",
      billing_tel: student.mobileNo || "",
      billing_address: student.address || "Salem",
      billing_city: student.city || "Salem",
      billing_state: student.state || "Tamil Nadu",
      billing_zip: student.pincode || "636001",
      billing_country: student.country || "India",
    };

    console.log("====================================");
    console.log("CCAvenue Tuition RAW PAYMENT DATA");
    console.log(paymentData);

    const data = qs.stringify(paymentData);
    console.log("====================================");
    console.log("CCAvenue Tuition STRINGIFIED DATA");
    console.log(data);

    const encryptedData = encryptCCAvenue(data, CCAVENUE_CONFIG.workingKey);

    console.log("====================================");
    console.log("CCAvenue Tuition ENCRYPTED DATA");
    console.log(encryptedData);
    console.log("====================================");

    return res.json({
      success: true,
      gateway: "ccavenue",
      accessCode: CCAVENUE_CONFIG.accessCode,
      merchantId: CCAVENUE_CONFIG.merchantId,
      encryptedData,
      orderId: orderId,

      originalAmount,
      concessionPercentage,
      concessionAmount,
      payableAmount: totalAmount,
      matchedReferrals,
    });

  } catch (error) {
    console.error("CCAvenue Tuition Create Error:", error);
    return res.status(500).json({
      success: false,
      message: "CCAvenue tuition payment creation failed",
    });
  }
};

// ============================================================
// CCAVENUE TUITION FEE SUCCESS
// ============================================================

export const ccavenueTuitionSuccess = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const encResp = req.body.encResp;

    if (!encResp) {
      console.error("encResp missing in CCAvenue tuition success");
      return res.redirect(
        `https://hikaapp.sonastar.com/fee-payment?status=error`
      );
    }

    const decryptedData = decryptCCAvenue(encResp, CCAVENUE_CONFIG.workingKey);
    const responseData: any = qs.parse(decryptedData);

    console.log("CCAvenue Tuition Decrypted Response:", responseData);

    const orderStatus = responseData.order_status;
    const orderId = responseData.order_id;
    const trackingId = responseData.tracking_id;

    // SUCCESS
    if (orderStatus === "Success") {
      const tuition = await TuitionFee.findOneAndUpdate(
        { orderId },
        {
          status: PAYMENT_STATUS.PAID,
          paymentId: trackingId,
          paidDate: new Date(),
        },
        { new: true }
      );

      if (!tuition) {
        console.error("Tuition fee record not found for orderId:", orderId);
        return res.redirect(
          `https://hikaapp.sonastar.com/fee-payment?status=error&orderId=${orderId}`
        );
      }

      // You can add additional logic here like updating student fee status, notifications, etc.

      return res.redirect(
        `https://hikaapp.sonastar.com/fee-payment?status=success&orderId=${orderId}`
      );
    }

    // FAILED
    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=failed&orderId=${orderId}`
    );

  } catch (error) {
    console.error("CCAvenue Tuition Success Error:", error);
    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=error`
    );
  }
};

// ============================================================
// CCAVENUE TUITION FEE CANCEL
// ============================================================

export const ccavenueTuitionCancel = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { order_id } = req.query;

    // Update payment status to failed if needed
    if (order_id) {
      await TuitionFee.findOneAndUpdate(
        { orderId: order_id },
        { status: PAYMENT_STATUS.FAILED }
      );
    }

    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=cancelled`
    );
  } catch (error) {
    console.error("CCAvenue Tuition Cancel Error:", error);
    return res.redirect(
      `https://hikaapp.sonastar.com/fee-payment?status=error`
    );
  }
};