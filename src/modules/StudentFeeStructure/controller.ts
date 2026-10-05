import { Request, Response } from "express";
import mongoose from "mongoose";

import StudentFeeStructure from "./model";
import Student from "../students/model";
import FeeConfiguration from "../fee-configuartion/model"


/* ============================================================
 * TYPES & HELPERS
 * ============================================================ */

interface ApiResponse<T = unknown> {
  success: boolean;
  message?: string;
  data?: T;
  count?: number;
  error?: string;
}

const ok = <T>(
  res: Response,
  data: T,
  message?: string,
  status = 200
): Response => {
  const body: ApiResponse<T> = { success: true, data };
  if (message) body.message = message;
  return res.status(status).json(body);
};

const fail = (
  res: Response,
  status: number,
  message: string,
  extra: Partial<ApiResponse> = {}
): Response =>
  res.status(status).json({ success: false, message, ...extra });

const isValidObjectId = (id: unknown): boolean =>
  typeof id === "string" && mongoose.Types.ObjectId.isValid(id);

/* ============================================================
 * CREATE STUDENT FEE STRUCTURE
 * ============================================================
 * Creates a LOCKED fee snapshot for a student.
 *
 * The fee is copied from the master FeeConfiguration only once.
 * After this document is created, changes to the master fee
 * configuration will NOT affect this student's fee.
 * ============================================================ */
export const createStudentFeeStructure = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId, academicYear, paymentOptionType } = req.body ?? {};

    /* ---------- 1. Validate input ---------- */
    if (!studentId || !isValidObjectId(studentId)) {
      return fail(res, 400, "A valid studentId is required");
    }

    if (
      typeof academicYear !== "string" ||
      academicYear.trim().length === 0
    ) {
      return fail(res, 400, "academicYear is required");
    }

    /* ---------- 2. Find student ---------- */
    const student = await Student.findById(studentId);
    if (!student) {
      return fail(res, 404, "Student not found");
    }

    /* ---------- 3. Resolve student year ---------- */
    const studentYear = Number(student.year);
    if (!Number.isFinite(studentYear) || studentYear <= 0) {
      return fail(res, 400, "Student year is not available");
    }

    /* ---------- 4. Prevent duplicate ---------- */
    const existing = await StudentFeeStructure.findOne({
      studentId: student._id,
      academicYear,
      year: studentYear,
    });

    if (existing) {
      return fail(
        res,
        409,
        "Fee structure already exists for this student and academic year",
        { data: existing }
      );
    }

    /* ---------- 5. Load master fee configuration ---------- */
    const feeConfiguration = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfiguration) {
      return fail(res, 404, "Fee configuration not found");
    }

    /* ---------- 6. Match course/program ---------- */
    const course = feeConfiguration.courseFeeStructure.find(
      (item: any) => String(item.courseId) === String(student.programId)
    );

    if (!course) {
      return fail(
        res,
        404,
        "Course fee structure not found for this student"
      );
    }

    /* ---------- 7. Match year ---------- */
    const yearStructure = course.years.find(
      (item: any) => String(item.year) === String(studentYear)
    );

    if (!yearStructure) {
      return fail(
        res,
        404,
        "Year fee structure not found for this student"
      );
    }

    /* ---------- 8. Match payment option ---------- */
    const desiredType = paymentOptionType || "installment";

    const selectedPaymentOption = yearStructure.paymentOptions.find(
      (option: any) => option.type === desiredType
    );

    if (!selectedPaymentOption) {
      return fail(res, 404, "Selected payment option not found");
    }

    /* ---------- 9. Snapshot installments (deep copy) ---------- */
    const installments = (
      selectedPaymentOption.installments ?? []
    ).map((installment: any) => ({
      number: installment.number,
      amount: installment.amount,
      tuitionFee: installment.tuitionFee,
      otherFee: installment.otherFee,
      dueDate: installment.dueDate,
      status: "pending" as const,
      paidAmount: 0,
      paidDate: undefined,
      paymentId: undefined,
    }));

    /* ---------- 10. Create LOCKED snapshot ---------- */
    const studentFeeStructure = await StudentFeeStructure.create({
      studentId: student._id,
      studentCode: student.studentId,
      instituteId: student.instituteId,
      programId: student.programId,
      courseName: course.name,
      year: studentYear,
      academicYear,

      totalAmount: yearStructure.amount,
      tuitionFee: yearStructure.tuitionFee,
      otherFee: yearStructure.otherFee,
      otherFeeDescription: yearStructure.otherFeeDescription || "",

      paymentOption: {
        type: selectedPaymentOption.type,
        name: selectedPaymentOption.name,
        installments,
      },

      feeStructureVersion: `${academicYear}-V1`,
    });

    return ok(
      res,
      studentFeeStructure,
      "Student fee structure created successfully",
      201
    );
  } catch (error: any) {
    console.error("Error creating student fee structure:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * GET STUDENT FEE STRUCTURE (single)
 * ============================================================ */
export const getStudentFeeStructure = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    if (!studentId) {
      return fail(res, 400, "studentId is required");
    }

    const query: Record<string, unknown> = { studentId };
    if (academicYear) query.academicYear = academicYear;

    const feeStructure = await StudentFeeStructure.findOne(query);

    if (!feeStructure) {
      return fail(res, 404, "Student fee structure not found");
    }

    return ok(res, feeStructure);
  } catch (error: any) {
    console.error("Error getting student fee structure:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * GET ALL STUDENT FEE STRUCTURES (across academic years)
 * ============================================================ */
export const getStudentFeeStructures = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      return fail(res, 400, "studentId is required");
    }

    const feeStructures = await StudentFeeStructure.find({
      studentId,
    }).sort({ academicYear: -1, year: -1 });

    return res.status(200).json({
      success: true,
      count: feeStructures.length,
      data: feeStructures,
    });
  } catch (error: any) {
    console.error("Error getting student fee structures:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * GET NEXT PENDING INSTALLMENT
 * ============================================================ */
export const getNextPendingInstallment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    if (!studentId) {
      return fail(res, 400, "studentId is required");
    }
    if (!academicYear) {
      return fail(res, 400, "academicYear is required");
    }

    const feeStructure = await StudentFeeStructure.findOne({
      studentId,
      academicYear,
    });

    if (!feeStructure) {
      return fail(res, 404, "Student fee structure not found");
    }

    const nextInstallment =
      feeStructure.paymentOption.installments.find(
        (installment) =>
          installment.status === "pending" ||
          installment.status === "partial"
      );

    if (!nextInstallment) {
      return ok(res, {
        studentId: feeStructure.studentId,
        studentCode: feeStructure.studentCode,
        academicYear: feeStructure.academicYear,
        totalAmount: feeStructure.totalAmount,
        status: "paid" as const,
      }, "All installments are paid");
    }

    return ok(res, {
      studentId: feeStructure.studentId,
      studentCode: feeStructure.studentCode,
      academicYear: feeStructure.academicYear,
      courseName: feeStructure.courseName,
      year: feeStructure.year,
      totalAmount: feeStructure.totalAmount,
      installment: nextInstallment,
    });
  } catch (error: any) {
    console.error("Error getting next installment:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * UPDATE INSTALLMENT PAYMENT (partial or full)
 * ============================================================
 * Uses atomic positional updates to avoid race conditions.
 * ============================================================ */
export const updateInstallmentPayment = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;
    const { academicYear, installmentNumber, paidAmount, paymentId } =
      req.body ?? {};

    /* ---------- Validate ---------- */
    if (!studentId) {
      return fail(res, 400, "studentId is required");
    }
    if (!academicYear) {
      return fail(res, 400, "academicYear is required");
    }
    if (installmentNumber === undefined || installmentNumber === null) {
      return fail(res, 400, "installmentNumber is required");
    }
    if (paidAmount === undefined || paidAmount === null) {
      return fail(res, 400, "paidAmount is required");
    }

    const amount = Number(paidAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return fail(res, 400, "Invalid paidAmount");
    }

    const instNo = Number(installmentNumber);
    if (!Number.isFinite(instNo) || instNo <= 0) {
      return fail(res, 400, "Invalid installmentNumber");
    }

    /* ---------- Find fee structure ---------- */
    const feeStructure = await StudentFeeStructure.findOne({
      studentId,
      academicYear,
    });

    if (!feeStructure) {
      return fail(res, 404, "Student fee structure not found");
    }

    const installment = feeStructure.paymentOption.installments.find(
      (item) => item.number === instNo
    );

    if (!installment) {
      return fail(res, 404, "Installment not found");
    }

    if (installment.status === "paid") {
      return fail(res, 400, "This installment is already fully paid");
    }

    const previousPaidAmount = Number(installment.paidAmount || 0);
    const totalPaidAmount = previousPaidAmount + amount;
    const installmentAmount = Number(installment.amount);

    if (totalPaidAmount > installmentAmount) {
      return fail(res, 400, "Payment amount exceeds installment amount", {
        data: {
          installmentAmount,
          alreadyPaid: previousPaidAmount,
          remainingAmount: installmentAmount - previousPaidAmount,
        },
      });
    }

    /* ---------- Atomic update using positional operator ---------- */
    const newStatus =
      totalPaidAmount === installmentAmount ? "paid" : "partial";

    const setPayload: Record<string, unknown> = {
      "paymentOption.installments.$.paidAmount": totalPaidAmount,
      "paymentOption.installments.$.paidDate": new Date(),
      "paymentOption.installments.$.status": newStatus,
    };
    if (paymentId) {
      setPayload["paymentOption.installments.$.paymentId"] = paymentId;
    }

    const updated = await StudentFeeStructure.findOneAndUpdate(
      {
        _id: feeStructure._id,
        "paymentOption.installments": {
          $elemMatch: {
            number: instNo,
            status: { $ne: "paid" },
          },
        },
      },
      { $set: setPayload },
      { new: true }
    );

    if (!updated) {
      return fail(
        res,
        409,
        "Installment was updated by another request. Please retry."
      );
    }

    return ok(res, updated, "Installment payment updated successfully");
  } catch (error: any) {
    console.error("Error updating installment payment:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * MARK INSTALLMENT AS PAID (full payment convenience)
 * ============================================================ */
export const markInstallmentAsPaid = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;
    const { academicYear, installmentNumber, paymentId } = req.body ?? {};

    if (!studentId || !academicYear) {
      return fail(res, 400, "studentId and academicYear are required");
    }
    if (installmentNumber === undefined || installmentNumber === null) {
      return fail(res, 400, "installmentNumber is required");
    }

    const instNo = Number(installmentNumber);
    if (!Number.isFinite(instNo) || instNo <= 0) {
      return fail(res, 400, "Invalid installmentNumber");
    }

    const feeStructure = await StudentFeeStructure.findOne({
      studentId,
      academicYear,
    });

    if (!feeStructure) {
      return fail(res, 404, "Student fee structure not found");
    }

    const installment = feeStructure.paymentOption.installments.find(
      (item) => item.number === instNo
    );

    if (!installment) {
      return fail(res, 404, "Installment not found");
    }

    if (installment.status === "paid") {
      return fail(res, 400, "Installment is already paid");
    }

    const setPayload: Record<string, unknown> = {
      "paymentOption.installments.$.paidAmount": installment.amount,
      "paymentOption.installments.$.paidDate": new Date(),
      "paymentOption.installments.$.status": "paid",
    };
    if (paymentId) {
      setPayload["paymentOption.installments.$.paymentId"] = paymentId;
    }

    const updated = await StudentFeeStructure.findOneAndUpdate(
      {
        _id: feeStructure._id,
        "paymentOption.installments": {
          $elemMatch: {
            number: instNo,
            status: { $ne: "paid" },
          },
        },
      },
      { $set: setPayload },
      { new: true }
    );

    if (!updated) {
      return fail(
        res,
        409,
        "Installment was updated by another request. Please retry."
      );
    }

    return ok(res, updated, "Installment marked as paid");
  } catch (error: any) {
    console.error("Error marking installment as paid:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};

/* ============================================================
 * DELETE STUDENT FEE STRUCTURE
 * ============================================================
 * Use carefully — restrict to admin/super-admin.
 * ============================================================ */
export const deleteStudentFeeStructure = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { studentId } = req.params;
    const { academicYear } = req.query;

    if (!studentId || !academicYear) {
      return fail(res, 400, "studentId and academicYear are required");
    }

    const deleted = await StudentFeeStructure.findOneAndDelete({
      studentId,
      academicYear,
    });

    if (!deleted) {
      return fail(res, 404, "Student fee structure not found");
    }

    return ok(res, deleted, "Student fee structure deleted successfully");
  } catch (error: any) {
    console.error("Error deleting student fee structure:", error);
    return fail(res, 500, "Internal server error", {
      error: error.message,
    });
  }
};