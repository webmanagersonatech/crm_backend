import { Request, Response } from "express";
import Razorpay from "razorpay";
import crypto from "crypto";
import axios from "axios";
import qs from "querystring";
import AdvanceTokenPayment from "./model";
import Settings from "../settings/model";
import Application from "../applications/model";
import Student from "../students/model";
import FeeConfiguration from "../fee-configuartion/model";
import StudentFeeStructure from "../StudentFeeStructure/model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";

/* ============================================================
   ADVANCE TOKEN CONFIG
============================================================ */
const ADVANCE_TOKEN_INSTITUTE_ID = "INS-3-ZXYXKM";
const ADVANCE_TOKEN_ACADEMIC_YEAR = "2027-2028";
const DEFAULT_ADVANCE_TOKEN_FEE = 20000;
const DEFAULT_INSTALLMENT_COUNT = 3;

const ADVANCE_TOKEN_AMOUNT_BY_PROGRAM: Record<string, number> = {
  PREKG00001: 20000,
  LKG0000002: 20000,
  UKG0000003: 20000,

  STD0000001: 20000,
  STD0000002: 20000,
  STD0000003: 20000,
  STD0000004: 20000,
  STD0000005: 20000,

  STD0000006: 20000,
  STD0000007: 20000,
  STD0000008: 20000,
  STD0000009: 20000,
};

const resolveAdvanceTokenFee = (programId: string | undefined): number => {
  if (programId && ADVANCE_TOKEN_AMOUNT_BY_PROGRAM[programId] != null) {
    return ADVANCE_TOKEN_AMOUNT_BY_PROGRAM[programId];
  }
  return DEFAULT_ADVANCE_TOKEN_FEE;
};

/* ============================================================
   CCAvenue ENCRYPT / DECRYPT
============================================================ */
const encryptCCAvenue = (plainText: string, workingKey: string) => {
  const key = crypto.createHash("md5").update(workingKey).digest();
  const iv = Buffer.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
  ]);
  const cipher = crypto.createCipheriv("aes-128-cbc", key, iv);
  let encrypted = cipher.update(plainText, "utf8", "hex");
  encrypted += cipher.final("hex");
  return encrypted;
};

const decryptCCAvenue = (encryptedText: string, workingKey: string) => {
  const key = crypto.createHash("md5").update(workingKey).digest();
  const iv = Buffer.from([
    0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
    0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f,
  ]);
  const decipher = crypto.createDecipheriv("aes-128-cbc", key, iv);
  let decrypted = decipher.update(encryptedText, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
};

const merchantId = "4444425";
const accessCode = "AVPD92NE73BU04DPUB";
const workingKey = "A3E677B669EA7384BB6975849E0B6E10";

/* ============================================================
   SMALL UTILITIES
============================================================ */
const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Split `total` into `n` parts, rounded to 2dp, remainder on the last. */
const splitEvenly = (total: number, n: number): number[] => {
  if (n <= 0) return [];
  const safeTotal = round2(Math.max(total, 0));
  const per = Math.floor((safeTotal / n) * 100) / 100;
  const parts = Array.from({ length: n }, () => per);
  const remainder = round2(safeTotal - per * n);
  if (remainder > 0.001) parts[n - 1] = round2(parts[n - 1] + remainder);
  return parts;
};

/* ============================================================
   ELIGIBILITY GUARD
============================================================ */
const checkEligibility = async (
  student: any,
  applicationId: string
): Promise<{ ok: boolean; message?: string; application?: any }> => {
  if (student.instituteId !== ADVANCE_TOKEN_INSTITUTE_ID) {
    return {
      ok: false,
      message: "Advance payment is not available for this institute",
    };
  }

  const studentAY = String(student.academicYear ?? "").trim();
  if (studentAY !== ADVANCE_TOKEN_ACADEMIC_YEAR) {
    return {
      ok: false,
      message: `Advance payment is only available for academic year ${ADVANCE_TOKEN_ACADEMIC_YEAR}`,
    };
  }

  const application = await Application.findOne({ applicationId }).select(
    "formStatus paymentStatus academicYear programId"
  );
  if (!application) {
    return { ok: false, message: "Application not found" };
  }

  if (application.formStatus !== "Complete") {
    return {
      ok: false,
      message: "Please complete your application before proceeding.",
    };
  }

  if (application.paymentStatus !== "Paid") {
    return {
      ok: false,
      message:
        "Please pay your application fee before proceeding to advance payment.",
    };
  }

  return { ok: true, application };
};

/* ============================================================
   RESOLVE STUDENT'S TARGET YEAR
============================================================
   School → year 1
   College → student.year (1, 2, 3 ...)
============================================================ */
const resolveStudentYear = (student: any): number => {
  const raw = Number(student?.year);
  if (Number.isFinite(raw) && raw >= 1) return raw;
  return 1;
};

/* ============================================================
   CORE: APPLY PAID ADVANCE TOKEN TO StudentFeeStructure
============================================================ */
interface ApplyPaidTokenOptions {
  student: any;
  applicationId: string;
  academicYear: string;
  programId: string;
  year: number;
  amount: number;
  paymentId: string | null;
  orderId: string;
  gateway: string;
  paidDate?: Date;
  description?: string;
}

export const applyPaidAdvanceTokenToFeeStructure = async (
  opts: ApplyPaidTokenOptions
): Promise<any> => {
  const {
    student,
    academicYear,
    programId,
    year,
    amount,
    paymentId,
    orderId,
    gateway,
    paidDate,
    description,
  } = opts;

  if (!(amount > 0)) {
    throw new Error("Advance token amount must be > 0");
  }

  const targetYear = Number(year || 1);

  /* ── 1. Locate existing snapshot for this student + program + year ── */
  const snapshotFilter = {
    studentId: student._id,
    instituteId: student.instituteId,
    programId,
    year: targetYear,
    academicYear,
  };

  let snapshot: any = await StudentFeeStructure.findOne(snapshotFilter);

  /* ── 2. If no snapshot yet, seed from FeeConfiguration ── */
  if (!snapshot) {
    const feeConfig: any = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
      academicYear,
    }).lean();

    if (!feeConfig) {
      throw new Error(
        `Fee configuration not found for academic year ${academicYear}`
      );
    }

    const course = feeConfig.courseFeeStructure.find(
      (c: any) => String(c.courseId) === String(programId)
    );
    if (!course) {
      throw new Error(`Course fee not found for program ${programId}`);
    }

    const yearData =
      course.years.find((y: any) => Number(y.year) === targetYear) ??
      course.years[0];

    if (!yearData) {
      throw new Error(
        `Year ${targetYear} fee not configured for program ${programId}`
      );
    }

    /* Prefer the 3-installment plan; fall back to any installment plan */
    const paymentOption =
      yearData.paymentOptions.find(
        (o: any) =>
          o.type === "installment" &&
          o.installments.length === DEFAULT_INSTALLMENT_COUNT
      ) ||
      yearData.paymentOptions.find((o: any) => o.type === "installment") ||
      yearData.paymentOptions[0];

    if (!paymentOption) {
      throw new Error("No payment option configured for this year");
    }

    const concessionPercentage = 0;
    const installments = paymentOption.installments.map((inst: any) => {
      const tuitionFee = Number(inst.tuitionFee || 0);
      const otherFee = Number(inst.otherFee || 0);
      const tuitionConcession = round2(
        (tuitionFee * concessionPercentage) / 100
      );
      const payableAmount = round2(
        tuitionFee - tuitionConcession + otherFee
      );

      return {
        number: Number(inst.number),
        amount: Number(inst.amount || 0),
        tuitionFee,
        otherFee,
        dueDate: new Date(inst.dueDate),
        status: "pending",
        paidAmount: 0,
        concessionPercentage,
        tuitionConcession,
        otherFeeConcession: 0,
        payableAmount,
        appliedNow: 0,
      };
    });

    snapshot = await StudentFeeStructure.create({
      studentId: student._id,
      studentCode: student.studentId,
      instituteId: student.instituteId,
      programId,
      courseName: course.name,

      year: targetYear,
      academicYear,

      totalAmount: Number(yearData.amount || 0),
      tuitionFee: Number(yearData.tuitionFee || 0),
      otherFee: Number(yearData.otherFee || 0),
      otherFeeDescription: yearData.otherFeeDescription || "",

      concessionPercentage,
      tuitionConcession: 0,
      otherFeeConcession: 0,
      concessionAmount: 0,
      concessionName: "",
      appliedReferrals: [],

      paymentOption: {
        paymentOptionId: paymentOption.paymentOptionId,
        type: paymentOption.type,
        name: paymentOption.name,
        installments,
      },

      givenAmount: 0,
      givenEntries: [],
      offer: false,
    });
  }

  /* ── 3. Ensure the installment count matches DEFAULT (3) ── */
  const currentInstallments = snapshot.paymentOption?.installments || [];

  if (currentInstallments.length !== DEFAULT_INSTALLMENT_COUNT) {
    const totalTuition = currentInstallments.reduce(
      (s: number, i: any) => s + Number(i.tuitionFee || 0),
      0
    );
    const totalOther = currentInstallments.reduce(
      (s: number, i: any) => s + Number(i.otherFee || 0),
      0
    );
    const concPct = Number(
      currentInstallments[0]?.concessionPercentage ?? 0
    );

    const tuitionParts = splitEvenly(
      totalTuition,
      DEFAULT_INSTALLMENT_COUNT
    );
    const otherParts = splitEvenly(totalOther, DEFAULT_INSTALLMENT_COUNT);

    const rebalanced = tuitionParts.map((tuition, idx) => {
      const other = otherParts[idx];
      const tuitionConcession = round2((tuition * concPct) / 100);
      const payable = round2(tuition - tuitionConcession + other);
      const prev = currentInstallments[idx];

      return {
        number: idx + 1,
        amount: payable,
        tuitionFee: tuition,
        otherFee: other,
        dueDate: prev?.dueDate ?? new Date(),
        status: prev?.status ?? "pending",
        paidAmount: Number(prev?.paidAmount || 0),
        paidDate: prev?.paidDate,
        paymentId: prev?.paymentId,
        concessionPercentage: concPct,
        tuitionConcession,
        otherFeeConcession: 0,
        payableAmount: payable,
        appliedNow: 0,
      };
    });

    snapshot.paymentOption = {
      paymentOptionId:
        snapshot.paymentOption?.paymentOptionId ??
        `ADV_INSTALLMENT_${DEFAULT_INSTALLMENT_COUNT}`,
      type: "installment",
      name: `${DEFAULT_INSTALLMENT_COUNT} Installments`,
      installments: rebalanced,
    };
  }

  /* ── 4. Distribute the paid amount across installments (appliedNow) ── */
  const alreadyAllocated = snapshot.paymentOption.installments.reduce(
    (s: number, i: any) => s + Number(i.appliedNow || 0),
    0
  );

  const remainingToApply = round2(Math.max(amount - alreadyAllocated, 0));

  if (remainingToApply > 0) {
    const unpaid = snapshot.paymentOption.installments.filter(
      (i: any) =>
        i.status !== "paid" &&
        Number(i.payableAmount ?? i.amount ?? 0) >
          Number(i.appliedNow || 0)
    );

    if (unpaid.length > 0) {
      const per = remainingToApply / unpaid.length;
      const perRounded = Math.floor(per * 100) / 100;
      let leftover = round2(
        remainingToApply - perRounded * unpaid.length
      );

      unpaid.forEach((inst: any) => {
        const owed = round2(
          Number(inst.payableAmount ?? inst.amount ?? 0) -
            Number(inst.appliedNow || 0)
        );

        let share = perRounded;
        if (leftover > 0.001) {
          share = round2(share + 0.01);
          leftover = round2(leftover - 0.01);
        }

        share = Math.min(share, owed);
        inst.appliedNow = round2(
          Number(inst.appliedNow || 0) + share
        );

        const tuition = Number(inst.tuitionFee || 0);
        const other = Number(inst.otherFee || 0);
        const concPct = Number(inst.concessionPercentage || 0);
        const tuitionConcession = round2((tuition * concPct) / 100);
        const originalPayable = round2(
          tuition - tuitionConcession + other
        );

        inst.payableAmount =
          inst.status === "paid"
            ? originalPayable
            : round2(
                Math.max(originalPayable - inst.appliedNow, 0)
              );
      });
    }
  }

  /* ── 5. Append givenEntries entry ── */
  const entryDate = paidDate ?? new Date();
  const entryDescription =
    description ||
    `Advance token paid via ${gateway}${
      paymentId ? ` — ${paymentId}` : ""
    }`;

  snapshot.givenEntries = [
    ...(snapshot.givenEntries || []),
    {
      date: entryDate,
      amount: round2(amount),
      description: entryDescription,
    },
  ];

  snapshot.givenAmount = round2(
    (Number(snapshot.givenAmount || 0) || 0) + amount
  );

  snapshot.feeStructureVersion =
    snapshot.feeStructureVersion || `${academicYear}-V1`;

  snapshot.markModified("paymentOption");
  snapshot.markModified("givenEntries");
  await snapshot.save();

  return snapshot;
};

/* ============================================================
   POST-PAYMENT HOOK (idempotent)
============================================================ */
const finalizeAdvanceTokenPayment = async (
  advance: any,
  paymentId: string | null,
  gateway: string
) => {
  if (!advance) return;

  const student: any = await Student.findOne({
    studentId: advance.studentId,
    instituteId: advance.instituteId,
  });
  if (!student) {
    console.error(
      "finalizeAdvanceTokenPayment: student not found",
      advance.studentId
    );
    return;
  }

  await applyPaidAdvanceTokenToFeeStructure({
    student,
    applicationId: advance.applicationId,
    academicYear: advance.academicYear,
    programId: advance.programId,
    year: resolveStudentYear(student),
    amount: Number(advance.amount || 0),
    paymentId,
    orderId: advance.orderId,
    gateway,
    paidDate: advance.updatedAt ?? new Date(),
    description: `Advance token paid via ${gateway}${
      paymentId ? ` — ${paymentId}` : ""
    }`,
  });
};

/* ============================================================
   MARK PAID + APPLY (idempotent)
============================================================ */
const markAdvancePaid = async (
  orderId: string,
  paymentId: string | null,
  gateway: string
) => {
  const set: any = { status: "paid" };
  if (paymentId) set.paymentId = paymentId;

  const updated: any = await AdvanceTokenPayment.findOneAndUpdate(
    { orderId, status: { $ne: "paid" } },
    { $set: set },
    { new: true }
  );

  if (updated) {
    await finalizeAdvanceTokenPayment(updated, paymentId, gateway);
    return updated;
  }

  /* Already paid: ensure fee structure reflects it (self-heal) */
  const existing: any = await AdvanceTokenPayment.findOne({ orderId });
  if (existing && existing.status === "paid") {
    const student: any = await Student.findOne({
      studentId: existing.studentId,
      instituteId: existing.instituteId,
    });
    const targetYear = resolveStudentYear(student);

    const snapshot: any = await StudentFeeStructure.findOne({
      instituteId: existing.instituteId,
      studentCode: existing.studentId,
      academicYear: existing.academicYear,
      programId: existing.programId,
      year: targetYear,
    });

    const alreadyHasEntry = (snapshot?.givenEntries || []).some(
      (e: any) =>
        round2(Number(e.amount)) === round2(Number(existing.amount)) &&
        String(e.description || "").includes(existing.orderId)
    );

    if (!alreadyHasEntry) {
      await finalizeAdvanceTokenPayment(
        existing,
        existing.paymentId ?? null,
        existing.gateway
      );
    }
  }
  return existing;
};

/* ============================================================
   CCAvenue — CREATE
============================================================ */
export const createAdvanceCCAvenuePayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { applicationId } = req.body;
    const student = req.student;
    if (!student) return res.status(401).json({ message: "Unauthorized" });

    const check = await checkEligibility(student, applicationId);
    if (!check.ok) return res.status(403).json({ message: check.message });

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });
    if (!settings)
      return res.status(400).json({ message: "Settings not configured" });

    const baseAmount = resolveAdvanceTokenFee(student.programId);
    const gstPercentage = Number(settings.gstPercentage ?? 0);
    const gst = (baseAmount * gstPercentage) / 100;
    const totalAmount = baseAmount + gst;

    const orderId = `CCA_ADV_${Date.now()}`;

    await AdvanceTokenPayment.create({
      studentId: student.studentId,
      instituteId: student.instituteId,
      applicationId,
      programId: student.programId,
      academicYear: student.academicYear,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount,
      orderId,
      status: "pending",
      gateway: "ccavenue",
    });

    const paymentData = {
      merchant_id: merchantId,
      order_id: orderId,
      currency: "INR",
      amount: totalAmount.toFixed(2),
      redirect_url:
        "https://hikabackend.sonastar.com/api/advancetoken-amount/ccavenue/success",
      cancel_url:
        "https://hikabackend.sonastar.com/api/advancetoken-amount/ccavenue/cancel",
      language: "EN",
      billing_name: `${student.firstname} ${student.lastname}`,
      billing_email: student.email?.toLowerCase(),
      billing_tel: student.mobileNo,
      billing_address: student.address || "Salem",
      billing_city: student.city || "Salem",
      billing_state: student.state || "Tamil Nadu",
      billing_zip: student.pincode || "636001",
      billing_country: student.country || "India",
    };

    const data = qs.stringify(paymentData);
    const encryptedData = encryptCCAvenue(data, workingKey);

    return res.json({
      success: true,
      gateway: "ccavenue",
      accessCode,
      merchantId,
      encryptedData,
    });
  } catch (error) {
    console.log("CCAvenue advance create error:", error);
    return res
      .status(500)
      .json({ message: "CCAvenue advance payment creation failed" });
  }
};

/* ============================================================
   CCAvenue — SUCCESS
============================================================ */
export const advanceCCAvenueSuccess = async (
  req: Request,
  res: Response
) => {
  try {
    const encResp = req.body.encResp;
    if (!encResp) return res.status(400).send("encResp missing");

    const decryptedData = decryptCCAvenue(encResp, workingKey);
    const responseData: any = qs.parse(decryptedData);

    const orderStatus = responseData.order_status;
    const orderId = responseData.order_id;
    const trackingId = responseData.tracking_id;

    if (orderStatus === "Success") {
      await markAdvancePaid(orderId, trackingId, "ccavenue");

      return res.redirect(
        `https://hikaapp.sonastar.com/advance-payment/receipt?status=success&orderId=${orderId}`
      );
    }

    return res.redirect(
      `https://hikaapp.sonastar.com/advance-payment?status=failed&orderId=${orderId}`
    );
  } catch (error) {
    console.log("CCAvenue advance success error:", error);
    return res.status(500).send("CCAvenue advance verification failed");
  }
};

/* ============================================================
   CCAvenue — CANCEL
============================================================ */
export const advanceCCAvenueCancel = async (
  _req: Request,
  res: Response
) => {
  return res.redirect(
    `https://hikaapp.sonastar.com/advance-payment?status=cancelled`
  );
};

/* ============================================================
   Razorpay — CREATE
============================================================ */
export const createAdvanceRazorpayPayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { applicationId } = req.body;
    const student = req.student;
    if (!student) return res.status(401).json({ message: "Unauthorized" });

    const check = await checkEligibility(student, applicationId);
    if (!check.ok) return res.status(403).json({ message: check.message });

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });
    if (!settings)
      return res.status(400).json({ message: "Settings not configured" });

    const razorpay = new Razorpay({
      key_id: settings.paymentCredentials.keyId,
      key_secret: settings.paymentCredentials.keySecret,
    });

    const baseAmount = resolveAdvanceTokenFee(student.programId);
    const gstPercentage = Number(settings.gstPercentage ?? 0);
    const gst = (baseAmount * gstPercentage) / 100;
    const totalAmount = baseAmount + gst;

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100),
      currency: "INR",
      receipt: `receipt_adv_${applicationId}`,
    });

    await AdvanceTokenPayment.create({
      studentId: student.studentId,
      instituteId: student.instituteId,
      applicationId,
      programId: student.programId,
      academicYear: student.academicYear,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount,
      orderId: order.id,
      status: "pending",
      gateway: "razorpay",
    });

    return res.json({
      success: true,
      orderId: order.id,
      key: settings.paymentCredentials.keyId,
      amount: Math.round(totalAmount * 100),
      currency: "INR",
    });
  } catch (error) {
    console.error("Razorpay advance create error:", error);
    return res
      .status(500)
      .json({ message: "Razorpay advance creation failed" });
  }
};

/* ============================================================
   Razorpay — VERIFY
============================================================ */
export const verifyAdvanceRazorpayPayment = async (
  req: Request,
  res: Response
) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    } = req.body;

    const payment: any = await AdvanceTokenPayment.findOne({
      orderId: razorpay_order_id,
    });
    if (!payment)
      return res
        .status(404)
        .json({ message: "Advance payment not found" });

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

    await markAdvancePaid(
      razorpay_order_id,
      razorpay_payment_id,
      "razorpay"
    );

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Verification failed" });
  }
};

/* ============================================================
   Razorpay — WEBHOOK
============================================================ */
export const advanceRazorpayWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"] as string;
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", webhookSecret!)
      .update(body)
      .digest("hex");

    if (expectedSignature !== signature)
      return res
        .status(400)
        .json({ message: "Invalid webhook signature" });

    if (req.body.event === "payment.captured") {
      const paymentData = req.body.payload.payment.entity;
      const orderId = paymentData.order_id;
      const paymentId = paymentData.id;

      await markAdvancePaid(orderId, paymentId, "razorpay");
    }

    return res.json({ success: true });
  } catch (error) {
    console.error("Advance webhook error:", error);
    return res.status(500).json({ message: "Webhook failed" });
  }
};

/* ============================================================
   Instamojo — CREATE
============================================================ */
export const createAdvanceInstamojoPayment = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const { applicationId } = req.body;
    const student = req.student;
    if (!student) return res.status(401).json({ message: "Unauthorized" });

    const check = await checkEligibility(student, applicationId);
    if (!check.ok) return res.status(403).json({ message: check.message });

    const settings = await Settings.findOne({
      instituteId: student.instituteId,
    });
    if (!settings)
      return res.status(400).json({ message: "Settings not configured" });

    const baseAmount = resolveAdvanceTokenFee(student.programId);
    const gstPercentage = Number(settings.gstPercentage ?? 0);
    const gst = (baseAmount * gstPercentage) / 100;
    const totalAmount = baseAmount + gst;

    const response = await axios.post(
      "https://www.instamojo.com/api/1.1/payment-requests/",
      {
        amount: totalAmount.toString(),
        purpose: `Advance Token - ${student.academicYear}`,
        buyer_name: `${student.firstname} ${student.lastname}`,
        email: student.email,
        phone: student.mobileNo,
        redirect_url:
          "https://hikabackend.sonastar.com/api/advancetoken-amount/instamojo/redirect",
        webhook:
          "https://hikabackend.sonastar.com/api/advancetoken-amount/instamojo/webhook",
      },
      {
        headers: {
          "X-Api-Key": "354258c3f2d1eda35995dae1540db4b4",
          "X-Auth-Token": "7f76729963176d6cc7169105b0cd81f4",
        },
      }
    );

    const paymentRequest = response.data.payment_request;

    await AdvanceTokenPayment.create({
      studentId: student.studentId,
      instituteId: student.instituteId,
      applicationId,
      programId: student.programId,
      academicYear: student.academicYear,
      amount: baseAmount,
      gstAmount: gst,
      totalAmount,
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
    return res
      .status(500)
      .json({ message: "Instamojo advance failed" });
  }
};

/* ============================================================
   Instamojo — REDIRECT
============================================================ */
export const verifyAdvanceInstamojoRedirect = async (
  req: Request,
  res: Response
) => {
  const { payment_status, payment_request_id } = req.query;
  return res.redirect(
    `https://hikaapp.sonastar.com/advance-payment?status=${payment_status}&orderId=${payment_request_id}`
  );
};

/* ============================================================
   Instamojo — WEBHOOK
============================================================ */
export const advanceInstamojoWebhook = async (
  req: Request,
  res: Response
) => {
  try {
    const { payment_id, payment_request_id, status } = req.body;
    const normalizedStatus = status?.toString().toLowerCase().trim();

    if (normalizedStatus !== "credit") {
      return res.status(200).send("Ignored");
    }

    await markAdvancePaid(payment_request_id, payment_id, "instamojo");

    return res.status(200).send("OK");
  } catch (error) {
    console.log("Advance instamojo webhook error:", error);
    return res.status(500).send("Webhook failed");
  }
};