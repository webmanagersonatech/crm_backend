import Joi from "joi";
import mongoose from "mongoose";

/* ============================================================
 * REUSABLE PRIMITIVES
 * ============================================================ */

const objectId = Joi.string()
  .trim()
  .custom((value, helpers) => {
    if (!mongoose.Types.ObjectId.isValid(value)) {
      return helpers.error("any.invalid");
    }
    return value;
  })
  .messages({
    "any.invalid": "Student ID must be a valid MongoDB ObjectId",
    "string.empty": "Student ID is required",
    "any.required": "Student ID is required",
  });

const academicYear = Joi.string()
  .trim()
  .pattern(/^\d{4}-\d{4}$/)
  .custom((value, helpers) => {
    const [start, end] = value.split("-").map(Number);
    if (end !== start + 1) {
      return helpers.error("any.invalid");
    }
    return value;
  })
  .messages({
    "string.empty": "Academic year is required",
    "string.pattern.base": "Academic year must be in YYYY-YYYY format",
    "any.invalid": "Academic year must be consecutive years (e.g. 2025-2026)",
    "any.required": "Academic year is required",
  });

const installmentNumber = Joi.number()
  .integer()
  .min(1)
  .messages({
    "number.base": "Installment number must be a number",
    "number.integer": "Installment number must be an integer",
    "number.min": "Installment number must be at least 1",
    "any.required": "Installment number is required",
  });

const paidAmount = Joi.number()
  .positive()
  .precision(2)
  .messages({
    "number.base": "Paid amount must be a number",
    "number.positive": "Paid amount must be greater than 0",
    "any.required": "Paid amount is required",
  });

const paymentId = Joi.string().trim().min(1).optional();

const paymentOptionType = Joi.string()
  .valid("full_payment", "installment")
  .default("installment")
  .messages({
    "any.only": "Payment option must be full_payment or installment",
  });

/* ============================================================
 * CREATE STUDENT FEE STRUCTURE
 * ============================================================ */
export const studentFeeStructureSchema = Joi.object({
  studentId: objectId.required(),
  academicYear: academicYear.required(),
  paymentOptionType,
});

/* ============================================================
 * GET STUDENT FEE STRUCTURE  (params + query)
 * ============================================================ */
export const getStudentFeeStructureParamsSchema = Joi.object({
  studentId: objectId.required(),
});

export const getStudentFeeStructureQuerySchema = Joi.object({
  academicYear: academicYear.optional(),
});

/* ============================================================
 * UPDATE INSTALLMENT PAYMENT  (body)
 * ============================================================ */
export const updateInstallmentPaymentSchema = Joi.object({
  academicYear: academicYear.required(),
  installmentNumber: installmentNumber.required(),
  paidAmount: paidAmount.required(),
  paymentId,
});

/* ============================================================
 * MARK INSTALLMENT AS PAID  (body)
 * ============================================================ */
export const markInstallmentPaidSchema = Joi.object({
  academicYear: academicYear.required(),
  installmentNumber: installmentNumber.required(),
  paymentId,
});

/* ============================================================
 * DELETE STUDENT FEE STRUCTURE  (params + query)
 * ============================================================ */
export const deleteStudentFeeStructureParamsSchema = Joi.object({
  studentId: objectId.required(),
});

export const deleteStudentFeeStructureQuerySchema = Joi.object({
  academicYear: academicYear.required(),
});