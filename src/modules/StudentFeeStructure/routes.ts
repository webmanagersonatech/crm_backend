import express from "express";

import {
  createStudentFeeStructure,
  getStudentFeeStructure,
  getStudentFeeStructures,
  getNextPendingInstallment,
  updateInstallmentPayment,
  markInstallmentAsPaid,
  deleteStudentFeeStructure,
} from "./controller";

const router = express.Router();

/**
 * Create / assign locked fee structure
 *
 * POST /student-fee-structure/create
 */
router.post(
  "/create",
  createStudentFeeStructure
);

/**
 * Get one student's fee structure
 *
 * GET /student-fee-structure/student/:studentId
 */
router.get(
  "/student/:studentId",
  getStudentFeeStructure
);

/**
 * Get all fee structures of a student
 *
 * GET /student-fee-structure/student/:studentId/all
 */
router.get(
  "/student/:studentId/all",
  getStudentFeeStructures
);

/**
 * Get next pending installment
 *
 * GET /student-fee-structure/student/:studentId/next-installment?academicYear=2026-2027
 */
router.get(
  "/student/:studentId/next-installment",
  getNextPendingInstallment
);

/**
 * Update installment payment
 *
 * PATCH /student-fee-structure/student/:studentId/payment
 */
router.patch(
  "/student/:studentId/payment",
  updateInstallmentPayment
);

/**
 * Mark complete installment as paid
 *
 * PATCH /student-fee-structure/student/:studentId/mark-paid
 */
router.patch(
  "/student/:studentId/mark-paid",
  markInstallmentAsPaid
);

/**
 * Delete fee structure
 *
 * DELETE /student-fee-structure/student/:studentId
 */
router.delete(
  "/student/:studentId",
  deleteStudentFeeStructure
);

export default router;