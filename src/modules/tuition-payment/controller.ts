import { Request, Response } from "express";
import crypto from "crypto";
import Razorpay from "razorpay";
import mongoose from "mongoose";
import axios from "axios";
import qs from "querystring";
import Student from "../students/model";
import PaidFee from "../paidfee/model";

// Models
import TuitionFee from "./model";
import FeeConfiguration from "../fee-configuartion/model";
import Settings from "../settings/model";
import FeeConcession from "../fees-concession/model";
import Institution from "../institutions/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import { AuthRequest } from "../auth";
import StudentFeeStructure from "../StudentFeeStructure/model";

// ============================================================
// CONSTANTS
// ============================================================

const PAYMENT_STATUS = {
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
} as const;

const PAYMENT_GATEWAY = {
  RAZORPAY: "razorpay",
  INSTAMOJO: "instamojo",
  CCAVENUE: "ccavenue",
} as const;

const CURRENCY = "INR";
const GST_AMOUNT = 0;

const BACKEND_URL = process.env.BASE_URL || "https://hikabackend.sonastar.com";
const FRONTEND_URL = process.env.FRONTEND_URL || "https://hikaapp.sonastar.com";

// Gateway credentials come from environment variables (never hard-code them)
const getInstamojoConfig = () => ({
  apiKey: "354258c3f2d1eda35995dae1540db4b4",
  authToken: "7f76729963176d6cc7169105b0cd81f4",
});

const getCCAvenueConfig = () => ({
  merchantId: "4444425",
  accessCode: "AVPD92NE73BU04DPUB",
  workingKey: "A3E677B669EA7384BB6975849E0B6E10",
});

// ============================================================
// SMALL UTILITIES
// ============================================================

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const safeEqual = (a: string, b: string) => {
  const bufA = Buffer.from(a || "");
  const bufB = Buffer.from(b || "");
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
};

/** Business-rule error that maps straight to an HTTP response */
class FeeError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    Object.setPrototypeOf(this, FeeError.prototype);
  }
}

const sendError = (
  res: Response,
  error: any,
  fallbackMessage: string,
  label: string
): Response => {
  if (error instanceof FeeError) {
    return res.status(error.status).json({
      success: false,
      message: error.message,
    });
  }

  console.error(label, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

// ============================================================
// CCAVENUE ENCRYPT / DECRYPT
// ============================================================

const CCAVENUE_IV = Buffer.from([
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
  0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
]);

const ccavenueKey = (workingKey: string) =>
  crypto.createHash("md5").update(workingKey).digest();

const encryptCCAvenue = (plainText: string, workingKey: string) => {
  const cipher = crypto.createCipheriv(
    "aes-128-cbc",
    ccavenueKey(workingKey),
    CCAVENUE_IV
  );
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

const decryptCCAvenue = (encryptedText: string, workingKey: string) => {
  const decipher = crypto.createDecipheriv(
    "aes-128-cbc",
    ccavenueKey(workingKey),
    CCAVENUE_IV
  );
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

// ============================================================
// STUDENT FEE STRUCTURE (per-student snapshot of the fee config)
// ============================================================

/**
 * Returns the student's own fee snapshot for a year.
 * If it does not exist yet (first payment for that year), it is created
 * as a COPY of the current FeeConfiguration. After that, later changes in
 * FeeConfiguration never affect this student for that year.
 */
export const getOrCreateStudentFeeStructure = async (
  student: any,
  year: number,
  paymentOptionId: string
) => {
  const filter = {
    instituteId: student.instituteId,
    studentId: student._id,
    programId: student.programId,
    year: Number(year),
  };

  // 1. Snapshot already exists -> use it
  const existing = await StudentFeeStructure.findOne(filter);
  if (existing) return existing;

  // 2. Not found -> read master fee configuration
  const feeConfig = await FeeConfiguration.findOne({
    instituteId: student.instituteId,
  });

  if (!feeConfig) {
    throw new Error("Fee configuration not found for this institute");
  }

  const course = feeConfig.courseFeeStructure.find(
    (item: any) => item.courseId === student.programId
  );

  if (!course) {
    throw new Error("Course fee not configured for this student");
  }

  const yearData = course.years.find(
    (item: any) => String(item.year) === String(year)
  );

  if (!yearData) {
    throw new Error(`Year ${year} fee not found for this course`);
  }

  const paymentOption = yearData.paymentOptions.find(
    (item: any) => item.paymentOptionId === paymentOptionId
  );

  if (!paymentOption) {
    throw new Error(`Payment option ${paymentOptionId} not found`);
  }

  // 3. Copy installments (COPIES – not references to FeeConfiguration)
  const installments = paymentOption.installments.map((installment: any) => ({
    number: Number(installment.number),
    amount: Number(installment.amount),
    tuitionFee: Number(installment.tuitionFee || 0),
    otherFee: Number(installment.otherFee || 0),
    dueDate: new Date(installment.dueDate),
    status: "pending",
    paidAmount: 0,
  }));

  // 4. Create the snapshot
  try {
    return await StudentFeeStructure.create({
      studentId: student._id,
      studentCode: student.studentId,
      instituteId: student.instituteId,
      programId: student.programId,
      courseName: course.name,
      year: Number(year),
      totalAmount: Number(yearData.amount || 0),
      tuitionFee: Number(yearData.tuitionFee || 0),
      otherFee: Number(yearData.otherFee || 0),
      otherFeeDescription: yearData.otherFeeDescription || "",
      paymentOption: {
        paymentOptionId: paymentOption.paymentOptionId,
        type: paymentOption.type,
        name: paymentOption.name,
        installments,
      },
    });
  } catch (error: any) {
    // Two requests (verify + webhook) created it at the same time
    if (error?.code === 11000) {
      const created = await StudentFeeStructure.findOne(filter);
      if (created) return created;
    }
    throw error;
  }
};

/**
 * Marks one installment of the student's snapshot as paid.
 * Idempotent: calling it twice for the same payment does nothing.
 * Never throws – it is a side effect and must not break the payment flow.
 */
export const markInstallmentAsPaid = async (tuition: any): Promise<void> => {
  try {
    if (!tuition) return;

    const student = await Student.findOne({
      studentId: tuition.studentId,
      instituteId: tuition.instituteId,
    });

    if (!student) {
      console.error("markInstallmentAsPaid: Student not found", tuition.studentId);
      return;
    }

    const feeStructure: any = await StudentFeeStructure.findOne({
      instituteId: tuition.instituteId,
      studentId: student._id,
      programId: student.programId,
      year: Number(tuition.year),
    });

    if (!feeStructure) {
      console.error(
        "markInstallmentAsPaid: StudentFeeStructure not found",
        student._id,
        "year",
        tuition.year
      );
      return;
    }

    const installment = (feeStructure.paymentOption?.installments || []).find(
      (inst: any) => Number(inst.number) === Number(tuition.installmentNumber)
    );

    if (!installment) {
      console.error(
        "markInstallmentAsPaid: Installment not found",
        tuition.installmentNumber
      );
      return;
    }

    // Already marked (webhook + verify both fired) -> nothing to do
    if (installment.status === "paid") return;

    installment.status = "paid";
    installment.paidAmount = Number(tuition.totalAmount || 0);
    installment.paidDate = tuition.paidDate || new Date();
    installment.paymentId = tuition.paymentId || tuition.orderId;

    feeStructure.markModified("paymentOption");
    await feeStructure.save();

    console.log(
      `Installment ${tuition.installmentNumber} marked as paid for student ${tuition.studentId}`
    );
  } catch (error) {
    console.error("markInstallmentAsPaid Error:", error);
  }
};

/**
 * Everything that must happen once a TuitionFee record becomes PAID:
 *  1. make sure the student's fee snapshot exists
 *  2. mark the installment as paid in the snapshot
 * Safe to call more than once.
 */
export const finalizePaidTuition = async (tuition: any): Promise<void> => {
  try {
    if (!tuition || !tuition.paymentOptionId) return;

    const student = await Student.findOne({
      studentId: tuition.studentId,
      instituteId: tuition.instituteId,
    });

    if (!student) {
      console.error("finalizePaidTuition: Student not found", tuition.studentId);
      return;
    }

    await getOrCreateStudentFeeStructure(
      student,
      Number(tuition.year),
      tuition.paymentOptionId
    );

    await markInstallmentAsPaid(tuition);
  } catch (error) {
    console.error("finalizePaidTuition Error:", error);
  }
};

/**
 * Flips a pending/failed TuitionFee to PAID exactly once (atomic),
 * then finalizes the student's fee snapshot.
 */
const settleTuitionPayment = async (orderId: string, paymentId?: string) => {
  const set: any = {
    status: PAYMENT_STATUS.PAID,
    paidDate: new Date(),
  };
  if (paymentId) set.paymentId = paymentId;

  const updated = await TuitionFee.findOneAndUpdate(
    { orderId, status: { $ne: PAYMENT_STATUS.PAID } },
    { $set: set },
    { new: true }
  );

  if (updated) {
    await finalizePaidTuition(updated);
    return updated;
  }

  // Already paid earlier (e.g. webhook arrived before verify).
  // Finalize is idempotent, so it is safe to re-run it.
  const existing = await TuitionFee.findOne({ orderId });
  if (existing && existing.status === PAYMENT_STATUS.PAID) {
    await finalizePaidTuition(existing);
  }
  return existing;
};

// ============================================================
// FEE RESOLUTION  (snapshot first -> fee configuration fallback)
// ============================================================

interface ResolvedInstallment {
  source: "studentFeeStructure" | "feeConfiguration";
  courseId: string;
  courseName: string;
  paymentOption: { paymentOptionId: string; type: string; name: string };
  installment: any;
  hasSnapshot: boolean;
}

const resolveInstallment = async (
  student: any,
  year: number,
  paymentOptionId: string,
  installmentNumber: number,
  feeConfig: any
): Promise<ResolvedInstallment> => {
  // ---------- 1. STUDENT FEE STRUCTURE FIRST ----------
  const snapshot: any = await StudentFeeStructure.findOne({
    instituteId: student.instituteId,
    studentId: student._id,
    programId: student.programId,
    year: Number(year),
  }).lean();

  if (snapshot) {
    const option = snapshot.paymentOption;

    // Once a student has started paying a year, the option is locked
    if (!option || option.paymentOptionId !== paymentOptionId) {
      throw new FeeError(
        400,
        `Payment option already chosen for year ${year}` +
        `${option?.name ? ` (${option.name})` : ""}. It cannot be changed.`
      );
    }

    const installment = (option.installments || []).find(
      (item: any) => Number(item.number) === Number(installmentNumber)
    );

    if (!installment) {
      throw new FeeError(
        404,
        `Installment ${installmentNumber} not found in payment option ${paymentOptionId}`
      );
    }

    return {
      source: "studentFeeStructure",
      courseId: snapshot.programId,
      courseName: snapshot.courseName,
      paymentOption: {
        paymentOptionId: option.paymentOptionId,
        type: option.type,
        name: option.name,
      },
      installment,
      hasSnapshot: true,
    };
  }

  // ---------- 2. NOT FOUND -> FEE CONFIGURATION ----------
  if (!feeConfig) {
    throw new FeeError(404, "Fee configuration not found");
  }

  const course = feeConfig.courseFeeStructure.find(
    (item: any) => item.courseId === student.programId
  );

  if (!course) {
    throw new FeeError(404, "Course fee not configured");
  }

  const yearData = course.years.find(
    (item: any) => String(item.year) === String(year)
  );

  if (!yearData) {
    throw new FeeError(404, "Year fee not found");
  }

  const paymentOption = yearData.paymentOptions.find(
    (item: any) => item.paymentOptionId === paymentOptionId
  );

  if (!paymentOption) {
    throw new FeeError(
      404,
      `Payment option with ID ${paymentOptionId} not found`
    );
  }

  const installment = paymentOption.installments.find(
    (item: any) => Number(item.number) === Number(installmentNumber)
  );

  if (!installment) {
    throw new FeeError(
      404,
      `Installment ${installmentNumber} not found in payment option ${paymentOptionId}`
    );
  }

  return {
    source: "feeConfiguration",
    courseId: course.courseId,
    courseName: course.name,
    paymentOption: {
      paymentOptionId: paymentOption.paymentOptionId,
      type: paymentOption.type,
      name: paymentOption.name,
    },
    installment,
    hasSnapshot: false,
  };
};

const calculateConcession = async (student: any, feeConfig: any) => {
  const feeConcession = await FeeConcession.findOne({
    studentId: student._id,
    instituteId: student.instituteId,
    programId: student.programId,
    status: "approved",
  }).select("referralIds");

  let matchedReferrals: any[] = [];
  let concessionPercentage = 0;

  // Referral percentages live in FeeConfiguration
  if (feeConcession?.referralIds?.length && feeConfig?.referrals?.length) {
    matchedReferrals = feeConfig.referrals.filter((ref: any) =>
      feeConcession.referralIds.includes(ref.referralId)
    );

    concessionPercentage = matchedReferrals.reduce(
      (total: number, ref: any) => total + Number(ref.percentage || 0),
      0
    );
  }

  return { matchedReferrals, concessionPercentage };
};

/** Concession applies on tuition fee only; other fee is an add-on */
const computeAmounts = (installment: any, concessionPercentage: number) => {
  const tuitionFee = Number(installment.tuitionFee || 0);
  const otherFee = Number(installment.otherFee || 0);

  const tuitionConcession = round2((tuitionFee * concessionPercentage) / 100);
  const totalAmount = round2(tuitionFee - tuitionConcession + otherFee);

  return { tuitionFee, otherFee, tuitionConcession, totalAmount };
};

const getGivenAmount = async (student: any, year: number) => {
  const paidFeeRecords = await PaidFee.find({
    studentId: student._id.toString(),
    instituteId: student.instituteId,
    programId: student.programId,
    year: Number(year),
  }).lean();

  return paidFeeRecords.reduce(
    (sum, pf) => sum + Number(pf.totalAmount || 0),
    0
  );
};

// ============================================================
// SHARED "CREATE PAYMENT" PREPARATION (Razorpay / Instamojo / CCAvenue)
// ============================================================

const prepareTuitionPayment = async (reqStudent: any, body: any) => {
  if (!reqStudent) {
    throw new FeeError(401, "Unauthorized");
  }

  const { year, installmentNumber, paymentOptionId } = body || {};

  if (!year || !installmentNumber || !paymentOptionId) {
    throw new FeeError(
      400,
      "Missing required fields: year, installmentNumber, paymentOptionId"
    );
  }

  const student: any = await Student.findById(reqStudent.id);
  if (!student) {
    throw new FeeError(404, "Student not found");
  }

  const yearNumber = Number(year);
  const instNumber = Number(installmentNumber);

  // Prevent duplicate payment
  const alreadyPaid = await TuitionFee.findOne({
    studentId: student.studentId,
    instituteId: student.instituteId,
    year: String(yearNumber),
    installmentNumber: instNumber,
    paymentOptionId,
    status: PAYMENT_STATUS.PAID,
  });

  if (alreadyPaid) {
    throw new FeeError(
      400,
      `Installment ${installmentNumber} already paid for this payment option`
    );
  }

  const feeConfig: any = await FeeConfiguration.findOne({
    instituteId: student.instituteId,
  });

  const resolved = await resolveInstallment(
    student,
    yearNumber,
    paymentOptionId,
    instNumber,
    feeConfig
  );

  // Snapshot is the source of truth for paid status
  if (resolved.installment.status === "paid") {
    throw new FeeError(
      400,
      `Installment ${installmentNumber} already paid for this payment option`
    );
  }

  const { matchedReferrals, concessionPercentage } = await calculateConcession(
    student,
    feeConfig
  );

  const amounts = computeAmounts(resolved.installment, concessionPercentage);

  // "Given amount" (offline advance) is adjusted only on the first payment
  // of the year, i.e. while the student has no snapshot yet.
  const givenAmount = resolved.hasSnapshot
    ? 0
    : await getGivenAmount(student, yearNumber);

  const finalAmount = round2(
    Math.max(amounts.totalAmount + GST_AMOUNT - givenAmount, 0)
  );

  if (finalAmount <= 0) {
    throw new FeeError(400, "No payable amount for this installment");
  }

  return {
    student,
    year: String(yearNumber),
    installmentNumber: instNumber,
    paymentOptionId: String(paymentOptionId),
    resolved,
    matchedReferrals,
    concessionPercentage,
    ...amounts,
    givenAmount,
    finalAmount,
  };
};

type PaymentContext = Awaited<ReturnType<typeof prepareTuitionPayment>>;

const buildTuitionRecord = (
  ctx: PaymentContext,
  orderId: string,
  gateway: string
) => ({
  studentId: ctx.student.studentId,
  instituteId: ctx.student.instituteId,

  courseId: ctx.resolved.courseId,
  courseName: ctx.resolved.courseName,

  academicYear: ctx.student.academicYear,
  year: ctx.year,
  installmentNumber: ctx.installmentNumber,
  paymentOptionId: ctx.paymentOptionId,
  paymentType: ctx.resolved.paymentOption.type,
  paymentOptionName: ctx.resolved.paymentOption.name,

  // Original fee breakdown
  originalAmount: ctx.resolved.installment.amount,
  tuitionFee: ctx.tuitionFee,
  otherFee: ctx.otherFee,
  tuitionConcession: ctx.tuitionConcession,
  otherFeeConcession: 0,

  concessionPercentage: ctx.concessionPercentage,
  concessionAmount: ctx.tuitionConcession,

  amount: ctx.totalAmount,
  gstAmount: GST_AMOUNT,
  totalAmount: ctx.finalAmount,

  orderId,
  status: PAYMENT_STATUS.PENDING,
  gateway,
});

const buildPaymentResponse = (ctx: PaymentContext) => ({
  originalAmount: ctx.resolved.installment.amount,
  tuitionFee: ctx.tuitionFee,
  otherFee: ctx.otherFee,
  tuitionConcession: ctx.tuitionConcession,
  otherFeeConcession: 0,
  concessionPercentage: ctx.concessionPercentage,
  concessionAmount: ctx.tuitionConcession,
  payableAmount: ctx.finalAmount,
  matchedReferrals: ctx.matchedReferrals,
});

// ============================================================
// RAZORPAY
// ============================================================

export const createRazorpayPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const ctx = await prepareTuitionPayment(req.student, req.body);

    const settings: any = await Settings.findOne({
      instituteId: ctx.student.instituteId,
    });

    if (
      !settings?.paymentCredentials?.keyId ||
      !settings?.paymentCredentials?.keySecret
    ) {
      return res.status(400).json({
        success: false,
        message: "Razorpay settings missing",
      });
    }

    const razorpay = new Razorpay({
      key_id: settings.paymentCredentials.keyId,
      key_secret: settings.paymentCredentials.keySecret,
    });

    const order = await razorpay.orders.create({
      amount: Math.round(ctx.finalAmount * 100),
      currency: CURRENCY,
      receipt: `TF${Date.now()}`,
    });

    await TuitionFee.create(
      buildTuitionRecord(ctx, order.id, PAYMENT_GATEWAY.RAZORPAY)
    );

    return res.status(200).json({
      success: true,
      orderId: order.id,
      key: settings.paymentCredentials.keyId,
      ...buildPaymentResponse(ctx),
      amount: Math.round(ctx.finalAmount * 100),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Payment order creation failed",
      "Create Payment Error:"
    );
  }
};

export const verifyRazorpayPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
      req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Missing payment verification fields",
      });
    }

    const tuition = await TuitionFee.findOne({ orderId: razorpay_order_id });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Transaction not found",
      });
    }

    const settings: any = await Settings.findOne({
      instituteId: tuition.instituteId,
    });

    if (!settings) {
      return res.status(400).json({
        success: false,
        message: "Payment settings missing",
      });
    }

    if (!settings.paymentCredentials?.keySecret) {
      return res.status(400).json({
        success: false,
        message: "Payment credentials not properly configured",
      });
    }

    const generatedSignature = crypto
      .createHmac("sha256", settings.paymentCredentials.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (!safeEqual(generatedSignature, razorpay_signature)) {
      return res.status(400).json({
        success: false,
        message: "Invalid Razorpay signature",
      });
    }

    // Marks paid + creates snapshot + marks installment (all idempotent)
    await settleTuitionPayment(razorpay_order_id, razorpay_payment_id);

    return res.json({
      success: true,
      message: "Payment completed",
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Payment verification failed",
      "Verify Error:"
    );
  }
};

export const razorpayWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const signature = req.headers["x-razorpay-signature"] as string;
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

    if (!webhookSecret) {
      console.error("RAZORPAY_WEBHOOK_SECRET is not configured");
      return res.status(500).json({
        success: false,
        message: "Webhook not configured",
      });
    }

    // Signature must be calculated on the RAW body. If your app exposes it
    // (express.json verify -> req.rawBody) it is used, otherwise fall back.
    const rawBody: string = (req as any).rawBody
      ? (req as any).rawBody.toString()
      : JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    if (!safeEqual(expectedSignature, signature)) {
      return res.status(400).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    if (req.body.event === "payment.captured") {
      const paymentData = req.body.payload.payment.entity;
      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      const tuition = await TuitionFee.findOne({ orderId });

      if (!tuition) {
        return res.status(404).json({
          success: false,
          message: "Tuition fee record not found",
        });
      }

      await settleTuitionPayment(orderId, paymentId);
    }

    return res.json({ success: true });
  } catch (error) {
    return sendError(
      res,
      error,
      "Webhook processing failed",
      "Webhook Error:"
    );
  }
};

// ============================================================
// INSTAMOJO
// ============================================================

/** Asks Instamojo itself whether the payment request was really paid */
const verifyInstamojoPayment = async (paymentRequestId: string) => {
  const { apiKey, authToken } = getInstamojoConfig();

  if (!apiKey || !authToken) {
    console.error("Instamojo credentials not configured");
    return null;
  }

  try {
    const response = await axios.get(
      `https://www.instamojo.com/api/1.1/payment-requests/${paymentRequestId}/`,
      {
        headers: {
          "X-Api-Key": apiKey,
          "X-Auth-Token": authToken,
        },
      }
    );

    const paymentRequest = response.data?.payment_request;

    const payment = (paymentRequest?.payments || []).find(
      (p: any) => String(p.status).toLowerCase() === "credit"
    );

    if (!payment) return null;

    return {
      paymentId: String(payment.payment_id),
      amount: Number(payment.amount),
    };
  } catch (error: any) {
    console.error(
      "Instamojo verify error:",
      error.response?.data || error.message
    );
    return null;
  }
};

/** Verified settlement used by both the redirect and the webhook */
const settleInstamojoPayment = async (orderId: string): Promise<boolean> => {
  const tuition = await TuitionFee.findOne({ orderId });
  if (!tuition) return false;

  const verified = await verifyInstamojoPayment(orderId);
  if (!verified) return false;

  if (Math.abs(verified.amount - Number(tuition.totalAmount)) > 0.01) {
    console.error(
      `Instamojo amount mismatch for ${orderId}: expected ${tuition.totalAmount}, got ${verified.amount}`
    );
    return false;
  }

  await settleTuitionPayment(orderId, verified.paymentId);
  return true;
};

export const createInstamojoTuitionPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const { apiKey, authToken } = getInstamojoConfig();

    if (!apiKey || !authToken) {
      return res.status(400).json({
        success: false,
        message: "Instamojo credentials not configured",
      });
    }

    const ctx = await prepareTuitionPayment(req.student, req.body);
    const { student } = ctx;

    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      qs.stringify({
        amount: ctx.finalAmount.toFixed(2),
        purpose: `Tuition Fee - Year ${ctx.year} - ${ctx.resolved.paymentOption.type === "full_payment"
            ? "Full Payment"
            : `Installment ${ctx.installmentNumber}`
          }`,
        buyer_name: `${student.firstname} ${student.lastname}`,
        email: student.email,
        phone: student.mobileNo,
        redirect_url: `${BACKEND_URL}/api/tuition-fee/instamojo/redirect`,
        webhook: `${BACKEND_URL}/api/tuition-fee/instamojo/webhook`,
        allow_repeated_payments: false,
        send_email: true,
        send_sms: true,
      }),
      {
        headers: {
          "X-Api-Key": apiKey,
          "X-Auth-Token": authToken,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );

    const paymentRequest = response.data.payment_request;

    await TuitionFee.create(
      buildTuitionRecord(ctx, paymentRequest.id, PAYMENT_GATEWAY.INSTAMOJO)
    );

    return res.status(200).json({
      success: true,
      paymentUrl: paymentRequest.longurl,
      orderId: paymentRequest.id,
      ...buildPaymentResponse(ctx),
    });
  } catch (error: any) {
    if (error instanceof FeeError) {
      return sendError(res, error, "", "");
    }

    console.error(
      "Create Instamojo Tuition Payment Error:",
      error.response?.data || error
    );

    return res.status(500).json({
      success: false,
      message: "Instamojo payment creation failed",
      error: error.response?.data?.message || "Internal server error",
    });
  }
};

export const instamojoTuitionRedirect = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { payment_status, payment_request_id } = req.query;
    const orderId = String(payment_request_id || "");

    if (!orderId) {
      return res.redirect(`${FRONTEND_URL}/fee-payment?status=error`);
    }

    // Never trust query-string status – confirm with Instamojo
    const settled = await settleInstamojoPayment(orderId);

    let status = "Pending";

    if (settled) {
      status = "Credit";
    } else if (String(payment_status || "").toLowerCase() === "failed") {
      await TuitionFee.findOneAndUpdate(
        { orderId, status: PAYMENT_STATUS.PENDING },
        { status: PAYMENT_STATUS.FAILED }
      );
      status = "Failed";
    }

    return res.redirect(
      `${FRONTEND_URL}/fee-payment?status=${status}&orderId=${encodeURIComponent(orderId)}`
    );
  } catch (error) {
    console.error("Instamojo Redirect Error:", error);
    return res.redirect(`${FRONTEND_URL}/fee-payment?status=error`);
  }
};

export const instamojoTuitionWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { payment_request_id, status } = req.body;

    const normalizedStatus = status?.toString().toLowerCase().trim();

    if (normalizedStatus !== "credit") {
      return res.status(200).send("Ignored");
    }

    const tuition = await TuitionFee.findOne({ orderId: payment_request_id });

    if (!tuition) {
      return res.status(404).send("Tuition fee record not found");
    }

    const settled = await settleInstamojoPayment(String(payment_request_id));

    if (!settled) {
      return res.status(400).send("Payment could not be verified");
    }

    return res.status(200).send("OK");
  } catch (error) {
    console.error("Instamojo Tuition Webhook Error:", error);
    return res.status(500).send("Webhook failed");
  }
};

// ============================================================
// CCAVENUE
// ============================================================

export const createCCAvenueTuitionPayment = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const cc = getCCAvenueConfig();

    if (!cc.merchantId || !cc.accessCode || !cc.workingKey) {
      return res.status(400).json({
        success: false,
        message: "CCAvenue credentials not configured",
      });
    }

    const ctx = await prepareTuitionPayment(req.student, req.body);
    const { student } = ctx;

    const orderId = `CCA_TF_${Date.now()}`;

    await TuitionFee.create(
      buildTuitionRecord(ctx, orderId, PAYMENT_GATEWAY.CCAVENUE)
    );

    const paymentData = {
      merchant_id: cc.merchantId,
      order_id: orderId,
      currency: CURRENCY,
      amount: ctx.finalAmount.toFixed(2),
      redirect_url: `${BACKEND_URL}/api/tuition-fee/ccavenue/success`,
      cancel_url: `${BACKEND_URL}/api/tuition-fee/ccavenue/cancel`,
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

    const encryptedData = encryptCCAvenue(
      qs.stringify(paymentData),
      cc.workingKey
    );

    return res.json({
      success: true,
      gateway: PAYMENT_GATEWAY.CCAVENUE,
      accessCode: cc.accessCode,
      merchantId: cc.merchantId,
      encryptedData,
      orderId,
      ...buildPaymentResponse(ctx),
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "CCAvenue tuition payment creation failed",
      "CCAvenue Tuition Create Error:"
    );
  }
};

export const ccavenueTuitionSuccess = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { workingKey } = getCCAvenueConfig();
    const encResp = req.body?.encResp;

    if (!encResp || !workingKey) {
      console.error("CCAvenue tuition success: encResp / working key missing");
      return res.redirect(`${FRONTEND_URL}/fee-payment?status=error`);
    }

    const responseData: any = qs.parse(decryptCCAvenue(encResp, workingKey));

    const orderStatus = String(responseData.order_status || "");
    const orderId = String(responseData.order_id || "");
    const trackingId = String(responseData.tracking_id || "");

    if (orderStatus === "Success") {
      const tuition = await TuitionFee.findOne({ orderId });

      if (!tuition) {
        console.error("Tuition fee record not found for orderId:", orderId);
        return res.redirect(
          `${FRONTEND_URL}/fee-payment?status=error&orderId=${encodeURIComponent(orderId)}`
        );
      }

      // Paid amount must match what we asked for
      if (
        responseData.amount !== undefined &&
        Math.abs(Number(responseData.amount) - Number(tuition.totalAmount)) > 0.01
      ) {
        console.error(
          `CCAvenue amount mismatch for ${orderId}: expected ${tuition.totalAmount}, got ${responseData.amount}`
        );
        return res.redirect(
          `${FRONTEND_URL}/fee-payment?status=error&orderId=${encodeURIComponent(orderId)}`
        );
      }

      await settleTuitionPayment(orderId, trackingId);

      return res.redirect(
        `${FRONTEND_URL}/fee-payment?status=success&orderId=${encodeURIComponent(orderId)}`
      );
    }

    // Not successful
    if (orderId) {
      await TuitionFee.findOneAndUpdate(
        { orderId, status: PAYMENT_STATUS.PENDING },
        { status: PAYMENT_STATUS.FAILED }
      );
    }

    return res.redirect(
      `${FRONTEND_URL}/fee-payment?status=failed&orderId=${encodeURIComponent(orderId)}`
    );
  } catch (error) {
    console.error("CCAvenue Tuition Success Error:", error);
    return res.redirect(`${FRONTEND_URL}/fee-payment?status=error`);
  }
};

export const ccavenueTuitionCancel = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { workingKey } = getCCAvenueConfig();

    // CCAvenue cancel can arrive as query (?order_id) or as POST encResp
    let orderId = String(req.query?.order_id || "");

    if (!orderId && req.body?.encResp && workingKey) {
      const data: any = qs.parse(decryptCCAvenue(req.body.encResp, workingKey));
      orderId = String(data.order_id || "");
    }

    if (orderId) {
      await TuitionFee.findOneAndUpdate(
        { orderId, status: PAYMENT_STATUS.PENDING },
        { status: PAYMENT_STATUS.FAILED }
      );
    }

    return res.redirect(`${FRONTEND_URL}/fee-payment?status=cancelled`);
  } catch (error) {
    console.error("CCAvenue Tuition Cancel Error:", error);
    return res.redirect(`${FRONTEND_URL}/fee-payment?status=error`);
  }
};

// ============================================================
// MANUAL PAYMENT BY COUNSELOR / ADMIN
// ============================================================

export const manualTuitionPayment = async (
  req: AuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const {
      studentId,
      year,
      installmentNumber,
      paymentOptionId,
      amount,
      transactionId,
      paymentDate,
      remarks,
    } = req.body;

    // 1. Validate required fields
    if (
      !studentId ||
      !year ||
      !installmentNumber ||
      !paymentOptionId ||
      !amount ||
      !transactionId
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Missing required fields: studentId, year, installmentNumber, paymentOptionId, amount, transactionId",
      });
    }

    if (!(Number(amount) > 0)) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const paidDate = paymentDate ? new Date(paymentDate) : new Date();

    if (isNaN(paidDate.getTime())) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment date",
      });
    }

    // 2. Find student (by ObjectId or by studentId code)
    let student: any = null;

    if (mongoose.Types.ObjectId.isValid(studentId)) {
      student = await Student.findById(studentId);
    }

    if (!student) {
      student = await Student.findOne({ studentId });
    }

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (student.status !== "active") {
      return res.status(400).json({
        success: false,
        message: "Student is not active",
      });
    }

    // 3. Duplicate transaction id
    const existingTransaction = await TuitionFee.findOne({
      $or: [{ paymentId: transactionId }, { transactionId }],
    });

    if (existingTransaction) {
      return res.status(409).json({
        success: false,
        message: `Transaction ID "${transactionId}" already exists in the system`,
      });
    }

    const yearNumber = Number(year);
    const instNumber = Number(installmentNumber);

    // 4. Resolve installment: student snapshot first, fee configuration next
    const feeConfig: any = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    const resolved = await resolveInstallment(
      student,
      yearNumber,
      paymentOptionId,
      instNumber,
      feeConfig
    );

    // 5. Already paid?
    const alreadyPaid = await TuitionFee.findOne({
      studentId: student.studentId,
      instituteId: student.instituteId,
      year: String(yearNumber),
      installmentNumber: instNumber,
      paymentOptionId,
      status: PAYMENT_STATUS.PAID,
    });

    if (alreadyPaid || resolved.installment.status === "paid") {
      return res.status(400).json({
        success: false,
        message: `Installment ${installmentNumber} for year ${year} is already paid for this payment option`,
        existingPayment: alreadyPaid,
      });
    }

    // 6. Concession + expected amount
    const { matchedReferrals, concessionPercentage } =
      await calculateConcession(student, feeConfig);

    const amounts = computeAmounts(resolved.installment, concessionPercentage);
    const calculatedFinalAmount = round2(amounts.totalAmount + GST_AMOUNT);

    const amountDifference = Math.abs(Number(amount) - calculatedFinalAmount);

    if (amountDifference > 0.01) {
      console.warn(
        `Manual payment amount mismatch: expected ${calculatedFinalAmount}, received ${amount} for student ${student.studentId}`
      );
    }

    // 7. Record payment
    const orderId = `MANUAL_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 8)}`;

    const manualPayment = await TuitionFee.create({
      studentId: student.studentId,
      instituteId: student.instituteId,

      courseId: resolved.courseId,
      courseName: resolved.courseName,

      academicYear: student.academicYear,
      year: String(yearNumber),

      installmentNumber: instNumber,
      paymentOptionId,
      paymentOptionName: resolved.paymentOption.name,
      paymentType: resolved.paymentOption.type || "installment",

      originalAmount: resolved.installment.amount,
      tuitionFee: amounts.tuitionFee,
      otherFee: amounts.otherFee,
      tuitionConcession: amounts.tuitionConcession,
      otherFeeConcession: 0,

      concessionPercentage,
      concessionAmount: amounts.tuitionConcession,

      amount: amounts.totalAmount,
      gstAmount: GST_AMOUNT,
      totalAmount: Number(amount), // amount actually received

      orderId,
      status: PAYMENT_STATUS.PAID,
      gateway: "manual",

      paymentId: transactionId,
      paidDate,

      remarks: remarks || "Manual payment by counselor",
      paymentMethod: "manual",
      recordedBy: (user as any).id || (user as any)._id,

      calculatedAmount: calculatedFinalAmount,
      amountDifference,
      matchedReferrals,
    });

    // 8. Create snapshot (if first payment of the year) + mark installment
    await finalizePaidTuition(manualPayment);

    return res.status(200).json({
      success: true,
      message: "Manual payment recorded successfully",
      data: {
        orderId,
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        year,
        installmentNumber,
        paymentOptionId,
        amount: Number(amount),
        originalAmount: resolved.installment.amount,
        tuitionFee: amounts.tuitionFee,
        otherFee: amounts.otherFee,
        concessionPercentage,
        concessionAmount: amounts.tuitionConcession,
        payableAmount: calculatedFinalAmount,
        paymentId: transactionId,
        paidDate,
        remarks: remarks || "Manual payment by counselor",
      },
    });
  } catch (error: any) {
    if (error instanceof FeeError) {
      return sendError(res, error, "", "");
    }

    console.error("Manual Tuition Payment Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to record manual payment",
      error: error.message || "Internal server error",
    });
  }
};

// ============================================================
// RECEIPTS
// ============================================================

export const getReceiptByPaymentId = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        success: false,
        message: "Payment ID is required",
      });
    }

    const tuition: any = await TuitionFee.findOne({ paymentId });

    if (!tuition) {
      return res.status(404).json({
        success: false,
        message: "Payment not found",
      });
    }

    const [student, settings, institution]: any[] = await Promise.all([
      Student.findOne({
        studentId: tuition.studentId,
        instituteId: tuition.instituteId,
      }),
      Settings.findOne({ instituteId: tuition.instituteId }),
      Institution.findOne({ instituteId: tuition.instituteId }),
    ]);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const receiptData = {
      payment: {
        id: tuition.paymentId,
        orderId: tuition.orderId,
        status: tuition.status,
        gateway: tuition.gateway,
        paidDate: tuition.paidDate || tuition.createdAt,
        createdAt: tuition.createdAt,

        installmentNumber: tuition.installmentNumber,
        paymentType: tuition.paymentType,
        year: tuition.year,
        academicYear: tuition.academicYear,

        originalAmount: tuition.originalAmount,
        concessionPercentage: tuition.concessionPercentage,
        concessionAmount: tuition.concessionAmount,
        amount: tuition.amount,
        gstAmount: tuition.gstAmount,
        totalAmount: tuition.totalAmount,

        courseId: tuition.courseId,
        courseName: tuition.courseName,
      },

      student: {
        id: student._id,
        studentId: student.studentId,
        firstName: student.firstname,
        lastName: student.lastname,
        email: student.email,
        mobileNo: student.mobileNo,
      },

      institute: {
        name: institution?.name || "Institute Name",
        logo: settings?.logo || "",
        email: institution?.email || "",
        phone: institution?.phoneNo || "",
      },

      receipt: {
        generatedAt: new Date().toISOString(),
        receiptNumber: `RCP-${tuition.paymentId || tuition.orderId}`,
        transactionId: tuition.orderId || tuition.paymentId,
      },
    };

    return res.status(200).json({
      success: true,
      data: receiptData,
    });
  } catch (error) {
    console.error("Get Receipt Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch receipt details",
      error:
        error instanceof Error && process.env.NODE_ENV === "development"
          ? error.message
          : undefined,
    });
  }
};

export const getAllTransactionReceipts = async (
  req: StudentAuthRequest,
  res: Response
): Promise<Response> => {
  try {
    const student = req.student;

    if (!student) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    // Only paid transactions, newest first
    const transactions = await TuitionFee.find({
      studentId: student.studentId,
      instituteId: student.instituteId,
      status: PAYMENT_STATUS.PAID,
    })
      .sort({ createdAt: -1 })
      .lean();

    const formattedTransactions = transactions.map((transaction) => ({
      _id: transaction._id,
      studentId: transaction.studentId,
      courseName: transaction.courseName,
      paymentType: transaction.paymentType,
      installmentNumber: transaction.installmentNumber,
      year: transaction.year,
      paymentOptionName: transaction.paymentOptionName,
      totalAmount: transaction.totalAmount,
      orderId: transaction.orderId,
      paymentId: transaction.paymentId,
      gateway: transaction.gateway,
      status: transaction.status,
      createdAt: transaction.createdAt,
    }));

    return res.status(200).json({
      success: true,
      data: formattedTransactions,
    });
  } catch (error) {
    console.error("Get All Transactions Error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch transactions",
    });
  }
};