import { Request, Response } from "express";
import mongoose from "mongoose";

import StudentFeeStructure from "./model";
import Student from "../students/model";

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
 * UPSERT STUDENT FEE STRUCTURE
 * ============================================================
 * Match on: studentId + year + programId + instituteId
 * - If found  → update paymentOption + concession + givenEntries
 * - If missing → create a fresh snapshot
 * ============================================================ */
export const upsertStudentFeeStructure = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      studentId,
      programId,
      instituteId,
      year,
      academicYear,
      courseName,
      totalAmount,
      tuitionFee,
      otherFee,
      otherFeeDescription,
      concessionPercentage,
      tuitionConcession,
      otherFeeConcession,
      concessionAmount,
      concessionName,
      appliedReferrals,
      paymentOption,
      givenAmount,
      givenEntries,
      offer,
    } = req.body ?? {};

    /* ---------- 1. Validate required ---------- */
    if (!studentId || !isValidObjectId(studentId)) {
      return fail(res, 400, "A valid studentId is required");
    }
    if (!programId) return fail(res, 400, "programId is required");
    if (!instituteId) return fail(res, 400, "instituteId is required");
    if (year === undefined || year === null) {
      return fail(res, 400, "year is required");
    }
    if (!paymentOption || !paymentOption.paymentOptionId) {
      return fail(res, 400, "paymentOption is required");
    }
    if (
      !Array.isArray(paymentOption.installments) ||
      paymentOption.installments.length === 0
    ) {
      return fail(res, 400, "paymentOption.installments is required");
    }

    /* ---------- 2. Verify student ---------- */
    const student = await Student.findById(studentId);
    if (!student) {
      return fail(res, 404, "Student not found");
    }

    /* ---------- 3. Normalize installments ---------- */
    const normalizedInstallments = paymentOption.installments.map(
      (inst: any) => ({
        number: Number(inst.number),
        amount: Number(inst.amount || 0),
        tuitionFee: Number(inst.tuitionFee || 0),
        otherFee: Number(inst.otherFee || 0),
        dueDate: inst.dueDate ? new Date(inst.dueDate) : new Date(),
        status: inst.status ?? "pending",
        paidAmount: Number(inst.paidAmount || 0),
        paidDate: inst.paidDate ? new Date(inst.paidDate) : undefined,
        paymentId: inst.paymentId || undefined,
        concessionPercentage: Number(inst.concessionPercentage || 0),
        tuitionConcession: Number(inst.tuitionConcession || 0),
        otherFeeConcession: Number(inst.otherFeeConcession || 0),
        payableAmount: Number(
          inst.payableAmount ??
          (Number(inst.tuitionFee || 0) -
            Number(inst.tuitionConcession || 0) +
            Number(inst.otherFee || 0))
        ),
        appliedNow: Number(inst.appliedNow || 0),
      })
    );

    /* ---------- 4. Normalize given entries ---------- */
    const normalizedGivenEntries = Array.isArray(givenEntries)
      ? givenEntries
        .filter(
          (e: any) => e && e.date && Number(e.amount) > 0
        )
        .map((e: any) => ({
          date: new Date(e.date),
          amount: Number(e.amount),
          description: (e.description ?? "").trim(),
        }))
      : [];

    /* ---------- 5. Build snapshot payload ---------- */
    const snapshotPayload = {
      studentId: student._id,
      studentCode: student.studentId,
      instituteId,
      programId,
      courseName: courseName ?? student.programId ?? "",
      year: Number(year),
      academicYear:
        academicYear ?? (student as any).academicYear ?? "",

      totalAmount: Number(totalAmount || 0),
      tuitionFee: Number(tuitionFee || 0),
      otherFee: Number(otherFee || 0),
      otherFeeDescription: otherFeeDescription || "",

      concessionPercentage: Number(concessionPercentage || 0),
      tuitionConcession: Number(tuitionConcession || 0),
      otherFeeConcession: Number(otherFeeConcession || 0),
      concessionAmount: Number(concessionAmount || 0),
      concessionName: concessionName || "",
      appliedReferrals: Array.isArray(appliedReferrals)
        ? appliedReferrals
        : [],

      paymentOption: {
        paymentOptionId: paymentOption.paymentOptionId,
        type: paymentOption.type,
        name: paymentOption.name,
        installments: normalizedInstallments,
      },

      givenAmount: Number(givenAmount || 0),
      givenEntries: normalizedGivenEntries,
      offer: Boolean(offer),
      feeStructureVersion: `${academicYear ?? (student as any).academicYear ?? ""
        }-V1`,
    };

    /* ---------- 6. Upsert ---------- */
    const filter = {
      studentId: student._id,
      programId,
      instituteId,
      year: Number(year),
    };

    const updated = await StudentFeeStructure.findOneAndUpdate(
      filter,
      { $set: snapshotPayload },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
        runValidators: true,
        rawResult: true, // 🔹 needed to read upsert meta
      }
    );

    // 🔹 Determine create vs update reliably
    const wasCreated = !(updated as any)?.lastErrorObject
      ?.updatedExisting;

    const doc = (updated as any)?.value ?? updated;

    return ok(
      res,
      doc,
      wasCreated
        ? "Student fee structure created successfully"
        : "Student fee structure updated successfully",
      wasCreated ? 201 : 200
    );
  } catch (error: any) {
    console.error("Error upserting student fee structure:", error);

    if (error?.code === 11000) {
      return fail(
        res,
        409,
        "A fee structure already exists for this student/year"
      );
    }

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
      return ok(
        res,
        {
          studentId: feeStructure.studentId,
          studentCode: feeStructure.studentCode,
          academicYear: feeStructure.academicYear,
          totalAmount: feeStructure.totalAmount,
          status: "paid" as const,
        },
        "All installments are paid"
      );
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