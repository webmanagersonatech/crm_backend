import { Request, Response } from "express";
import mongoose from "mongoose";
import PaidFee from "./model";
import Student from "../students/model";
import Settings from "../settings/model";
import { addPaidFeeSchema } from "./paidfee.sanitize";
import StudentFeeStructure from "../StudentFeeStructure/model";
import FeeConfiguration from "../fee-configuartion/model";
import FeeConcession from "../fees-concession/model";
/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface CleanedEntry {
  date: Date;              // ✅ added
  amount: number;
  description: string;
}

interface RawEntry {
  date?: string | Date;    // ✅ added
  amount?: number | string;
  description?: string;
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

const cleanEntries = (entries: RawEntry[]): CleanedEntry[] => {
  return entries.map((e, index) => {
    const label = `Entry ${index + 1}`;

    // ── date is required ──────────────────────────────────────
    if (!e.date) {
      throw new Error(`${label}: Date is required`);
    }

    const parsedDate = new Date(e.date);
    if (isNaN(parsedDate.getTime())) {
      throw new Error(`${label}: Invalid date`);
    }

    // ── amount is required + must be > 0 ──────────────────────
    const amt = Number(e.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error(`${label}: Amount must be greater than 0`);
    }

    return {
      date: parsedDate,
      amount: amt,
      description: (e.description || "").trim(),
    };
  });
};

const sumEntries = (entries: CleanedEntry[]): number => {
  return entries.reduce<number>((sum, e) => sum + e.amount, 0);
};

/* ─────────────────────────────────────────────
   POST /paid-fees/:studentId
   Create or update paid-fee entry
───────────────────────────────────────────── */

export const addPaidFee = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { year, entries, programId } = req.body;

    // ── Validate studentId ──────────────────────────────────────
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid student ID is required",
      });
    }

    // ── Validate year ───────────────────────────────────────────
    if (year === undefined || isNaN(Number(year))) {
      return res.status(400).json({
        success: false,
        message: "Valid year is required",
      });
    }

    // ── Validate entries ────────────────────────────────────────
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one amount entry is required",
      });
    }

    // ── Clean + validate entries (date + amount required) ───────
    let cleanedEntries: CleanedEntry[];
    try {
      cleanedEntries = cleanEntries(entries);
    } catch (validationErr: any) {
      return res.status(400).json({
        success: false,
        message: validationErr.message || "Invalid entries",
      });
    }

    // ── Find student ────────────────────────────────────────────
    const student = await Student.findById(studentId).select(
      "studentId instituteId programId"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const finalProgramId: string | undefined =
      programId || student.programId;

    if (!finalProgramId) {
      return res.status(400).json({
        success: false,
        message:
          "programId is required (pass in body or ensure student has programId)",
      });
    }

    const totalAmount: number = sumEntries(cleanedEntries);

    // ── Check existing record ───────────────────────────────────
    const existing = await PaidFee.findOne({
      studentId: student._id,
      programId: finalProgramId,
      year: Number(year),
    });

    const isUpdate: boolean = !!existing;

    // ── Upsert ──────────────────────────────────────────────────
    const paidFee = await PaidFee.findOneAndUpdate(
      {
        studentId: student._id,
        programId: finalProgramId,
        year: Number(year),
      },
      {
        $set: {
          studentId: student._id,
          studentCode: student.studentId,
          instituteId: student.instituteId,
          programId: finalProgramId,
          year: Number(year),
          entries: cleanedEntries,
          totalAmount,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate
        ? "Paid fee updated successfully"
        : "Paid fee added successfully",
      data: paidFee,
    });
  } catch (err: any) {
    console.error("Error adding/updating paid fee:", err);

    // ── Race condition fallback ─────────────────────────────────
    if (err.code === 11000) {
      try {
        const { studentId } = req.params;
        const { year, entries, programId } = req.body;

        const student = await Student.findById(studentId).select(
          "studentId instituteId programId"
        );

        if (!student) {
          return res.status(404).json({
            success: false,
            message: "Student not found",
          });
        }

        const finalProgramId: string | undefined =
          programId || student.programId;

        let cleanedEntries: CleanedEntry[];
        try {
          cleanedEntries = cleanEntries(entries);
        } catch (validationErr: any) {
          return res.status(400).json({
            success: false,
            message: validationErr.message || "Invalid entries",
          });
        }

        const totalAmount: number = sumEntries(cleanedEntries);

        const updated = await PaidFee.findOneAndUpdate(
          {
            studentId: student._id,
            programId: finalProgramId,
            year: Number(year),
          },
          {
            $set: {
              entries: cleanedEntries,
              totalAmount,
            },
          },
          { new: true, runValidators: true }
        );

        return res.status(200).json({
          success: true,
          message: "Paid fee updated successfully",
          data: updated,
        });
      } catch (retryErr: any) {
        return res.status(500).json({
          success: false,
          message: retryErr.message || "Internal server error",
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   GET /paid-fees/:studentId
   List all paid fees for a student
───────────────────────────────────────────── */
const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
export const getPaidFeesByStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const { studentId } = req.params;
    const { year, programId, academicYear: academicYearQuery } = req.query;

    // ── Validate studentId ──────────────────────────────────────
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid student ID is required",
      });
    }

    // ── Find student ────────────────────────────────────────────
    const student = await Student.findById(studentId).select(
      "studentId instituteId programId firstname lastname academicYear year"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // ── Settings (courseYears) ──────────────────────────────────
    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("courseYears");

    const courseYears: number = settingsDoc?.courseYears ?? 1;

    // ── Scope used for EVERY search below ───────────────────────
    //    studentId + instituteId + programId (+ academicYear)
    const studentAcademicYear: string | undefined =
      (student as any).academicYear;

    // FIX: programId defaults to the student's own program (before, snapshots
    // of any program were returned when no programId query was sent)
    const effectiveProgramId: string | undefined = programId
      ? String(programId)
      : student.programId;

    if (!effectiveProgramId) {
      return res.status(400).json({
        success: false,
        message: "Student has no program assigned",
      });
    }

    // Optional strict academic-year filter sent by the client
    const requestedAcademicYear: string | undefined = academicYearQuery
      ? String(academicYearQuery)
      : undefined;

    // Academic year used to read the FeeConfiguration fallback
    const configAcademicYear: string | undefined =
      requestedAcademicYear ?? studentAcademicYear;

    // ── 1) STUDENT FEE STRUCTURE SNAPSHOTS (primary) ────────────
    const snapshotFilter: Record<string, any> = {
      studentId: student._id,
      instituteId: student.instituteId,
      programId: effectiveProgramId,
    };

    if (year !== undefined && year !== "") {
      snapshotFilter.year = Number(year);
    }

    // Strict only when the client asks for it. Earlier years of a promoted
    // student belong to older academic years, so by default we search all
    // academic years and PREFER the student's current one (below).
    if (requestedAcademicYear) {
      snapshotFilter.academicYear = requestedAcademicYear;
    }

    const snapshotRecords: any[] = await StudentFeeStructure.find(
      snapshotFilter
    )
      .sort({ year: 1, createdAt: -1 })
      .lean();

    // One snapshot per year: prefer the student's academicYear,
    // else the newest record of that year
    const preferredAcademicYear = requestedAcademicYear ?? studentAcademicYear;
    const snapshotByYear = new Map<number, any>();

    snapshotRecords.forEach((rec: any) => {
      const y = Number(rec.year);
      const current = snapshotByYear.get(y);

      if (!current) {
        snapshotByYear.set(y, rec);
        return;
      }

      if (
        preferredAcademicYear &&
        rec.academicYear === preferredAcademicYear &&
        current.academicYear !== preferredAcademicYear
      ) {
        snapshotByYear.set(y, rec);
      }
    });

    const studentFeeStructures: any[] = Array.from(snapshotByYear.values());

    // ── 2) FEE CONFIGURATION FALLBACK (per academic year) ───────
    let feeConfiguration: any = null;

    if (configAcademicYear) {
      feeConfiguration = await FeeConfiguration.findOne({
        instituteId: student.instituteId,
        academicYear: configAcademicYear,
      }).lean();
    }

    // Build a lookup: year -> courseFee year data
    const configCourse = feeConfiguration?.courseFeeStructure?.find(
      (c: any) => c.courseId === effectiveProgramId
    );

    const configYearMap = new Map<number, any>();
    if (configCourse?.years?.length) {
      configCourse.years.forEach((y: any) => {
        configYearMap.set(Number(y.year), y);
      });
    }

    // ── 3) FEE CONCESSION (applies to config fallback too) ──────
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: effectiveProgramId,
      status: "approved",
    }).select("referralIds reason counsellorName paymentOptionId");

    // Match referral IDs against this academic year's config
    let matchedReferrals: Array<{
      referralId: string;
      name: string;
      percentage: number;
    }> = [];

    if (
      feeConcession?.referralIds?.length &&
      feeConfiguration?.referrals?.length
    ) {
      matchedReferrals = feeConfiguration.referrals
        .filter((ref: any) =>
          feeConcession.referralIds.includes(ref.referralId)
        )
        .map((ref: any) => ({
          referralId: ref.referralId,
          name: ref.name || "",
          percentage: Number(ref.percentage || 0),
        }));
    }

    const concessionPercentage = matchedReferrals.reduce(
      (sum, r) => sum + r.percentage,
      0
    );

    const concessionName =
      (feeConcession?.reason && String(feeConcession.reason).trim()) ||
      matchedReferrals.map((r) => r.name).filter(Boolean).join(" + ");

    // ────────────────────────────────────────────────────────────
    // Payment option type + installment count resolution
    // ────────────────────────────────────────────────────────────

    type PaymentMode = "full_payment" | "installment";

    let concessionPaymentOptionId: string | null = null;
    let concessionPaymentMode: PaymentMode | null = null;
    let allowedInstallmentCount = 2; // default for installment mode

    if (feeConcession?.paymentOptionId) {
      concessionPaymentOptionId = feeConcession.paymentOptionId;
      const pid = String(feeConcession.paymentOptionId).toUpperCase();

      if (pid.includes("INSTALLMENT")) {
        concessionPaymentMode = "installment";
        const match = pid.match(/INSTALLMENT-(\d+)$/);
        allowedInstallmentCount =
          match && Number(match[1]) > 0 ? Number(match[1]) : 2;
      } else if (pid.includes("FULL")) {
        concessionPaymentMode = "full_payment";
        allowedInstallmentCount = 1;
      }
    }

    // Set of years that already have snapshots
    const snapshotYearSet = new Set(
      studentFeeStructures.map((s: any) => Number(s.year))
    );

    // ── Helper: resolve option + filter installments by type ────
    //    isSnapshot = true -> installments are NOT cut. A snapshot already
    //    holds exactly what the student chose; cutting it by the concession
    //    count would drop installments when the dialog saves again.
    const resolveOption = (allOptions: any[], isSnapshot = false) => {
      if (!Array.isArray(allOptions) || allOptions.length === 0) {
        return { chosenOption: null, filtered: [] as any[] };
      }

      let chosen: any = null;

      // 1) Exact match by concession's paymentOptionId
      if (concessionPaymentOptionId) {
        chosen = allOptions.find(
          (o: any) => o.paymentOptionId === concessionPaymentOptionId
        );
      }

      // 2) Match by mode (full vs installment)
      if (!chosen && concessionPaymentMode) {
        chosen =
          allOptions.find((o: any) => o.type === concessionPaymentMode) ||
          null;
      }

      // 3) Default: prefer installment option, else first
      if (!chosen) {
        chosen =
          allOptions.find((o: any) => o.type === "installment") ||
          allOptions[0];
      }

      const rawInstallments: any[] = chosen?.installments || [];

      if (isSnapshot) {
        return { chosenOption: chosen, filtered: rawInstallments };
      }

      let filtered = rawInstallments;

      if (chosen?.type === "installment") {
        const limit =
          allowedInstallmentCount > 0 ? allowedInstallmentCount : 2;
        if (limit < rawInstallments.length) {
          filtered = rawInstallments.slice(0, limit);
        }
      } else {
        // Full payment → always 1 installment
        filtered = rawInstallments.slice(0, 1);
      }

      return { chosenOption: chosen, filtered };
    };

    // ── 4) Build unified year payload ───────────────────────────
    const yearsPayload = Array.from({ length: courseYears }, (_, i) => {
      const yearNum = i + 1;

      const snapshot: any = snapshotByYear.get(yearNum);

      // ────────────────────────────────────────────────────────
      // Branch A: Snapshot exists
      // ────────────────────────────────────────────────────────
      if (snapshot) {
        const allSnapshotOptions = snapshot.paymentOption
          ? [snapshot.paymentOption]
          : [];

        const { chosenOption, filtered } = resolveOption(
          allSnapshotOptions,
          true
        );

        return {
          year: yearNum,
          source: "studentFeeStructure" as const,

          academicYear:
            snapshot.academicYear || studentAcademicYear || null,
          courseId: snapshot.programId || null,
          courseName: snapshot.courseName || "",
          totalAmount: snapshot.totalAmount || 0,
          tuitionFee: snapshot.tuitionFee || 0,
          otherFee: snapshot.otherFee || 0,
          otherFeeDescription: snapshot.otherFeeDescription || "",

          concessionPercentage: snapshot.concessionPercentage || 0,
          concessionName: snapshot.concessionName || "",
          appliedReferrals: snapshot.appliedReferrals || [],
          tuitionConcession: snapshot.tuitionConcession || 0,
          otherFeeConcession: snapshot.otherFeeConcession || 0,
          concessionAmount: snapshot.concessionAmount || 0,

          discountedTuition:
            Number(snapshot.tuitionFee || 0) -
            Number(snapshot.tuitionConcession || 0),
          discountedTotal:
            Number(snapshot.tuitionFee || 0) -
            Number(snapshot.tuitionConcession || 0) +
            Number(snapshot.otherFee || 0),

          // Given-amount block from snapshot
          givenAmount: Number(snapshot.givenAmount || 0),
          givenEntries: Array.isArray(snapshot.givenEntries)
            ? snapshot.givenEntries.map((e: any) => ({
              date: e.date,
              amount: Number(e.amount || 0),
              description: e.description || "",
            }))
            : [],

          // Resolved payment option (snapshot installments kept as stored)
          paymentOption: chosenOption
            ? {
              paymentOptionId: chosenOption.paymentOptionId,
              name: chosenOption.name,
              type: chosenOption.type,
              installments: filtered.map((inst: any) => ({
                number: inst.number,
                amount: inst.amount,
                tuitionFee: inst.tuitionFee,
                otherFee: inst.otherFee,
                tuitionConcession: inst.tuitionConcession || 0,
                otherFeeConcession: inst.otherFeeConcession || 0,
                concessionPercentage: inst.concessionPercentage || 0,
                // FIX: ?? instead of || - a fully covered installment has
                // payableAmount 0 and must not fall back to the full amount
                payableAmount: inst.payableAmount ?? inst.amount,
                dueDate: inst.dueDate,
                status: inst.status,
                paidAmount: inst.paidAmount || 0,
                paidDate: inst.paidDate || null,
                paymentId: inst.paymentId || null,
                appliedNow: Number(inst.appliedNow || 0),
              })),
            }
            : null,
        };
      }

      // ────────────────────────────────────────────────────────
      // Branch B: No snapshot → fallback to FeeConfiguration
      // ────────────────────────────────────────────────────────
      const configYear = configYearMap.get(yearNum);

      const baseTuition = Number(configYear?.tuitionFee || 0);
      const baseOther = Number(configYear?.otherFee || 0);
      const baseTotal = Number(configYear?.amount || 0);

      const tuitionConcession = round2(
        (baseTuition * concessionPercentage) / 100
      );
      const otherFeeConcession = 0;
      const concessionAmount = tuitionConcession;

      const discountedTuition = round2(baseTuition - tuitionConcession);
      const discountedTotal = round2(
        baseTuition - tuitionConcession + baseOther
      );

      const allOptions: any[] = configYear?.paymentOptions || [];
      const { chosenOption } = resolveOption(allOptions);

      // Re-compute installments per option with concession applied,
      // then filter based on option type
      const buildOptionWithConcession = (opt: any) => {
        const rawInstallments: any[] = opt.installments || [];

        let filtered = rawInstallments;
        if (opt.type === "installment") {
          const limit =
            allowedInstallmentCount > 0 ? allowedInstallmentCount : 2;
          if (limit < rawInstallments.length) {
            filtered = rawInstallments.slice(0, limit);
          }
        } else {
          // full_payment → 1 installment
          filtered = rawInstallments.slice(0, 1);
        }

        return {
          paymentOptionId: opt.paymentOptionId,
          name: opt.name,
          type: opt.type,
          installments: filtered.map((inst: any) => {
            const instTuition = Number(inst.tuitionFee || 0);
            const instOther = Number(inst.otherFee || 0);
            const instTuitionConcession = round2(
              (instTuition * concessionPercentage) / 100
            );
            const instPayable = round2(
              instTuition - instTuitionConcession + instOther
            );

            return {
              number: inst.number,
              amount: inst.amount,
              tuitionFee: instTuition,
              otherFee: instOther,
              tuitionConcession: instTuitionConcession,
              otherFeeConcession: 0,
              concessionPercentage,
              payableAmount: instPayable,
              dueDate: inst.dueDate,
            };
          }),
        };
      };

      const paymentOptionsWithConcession = allOptions.map(
        buildOptionWithConcession
      );

      return {
        year: yearNum,
        source: "feeConfiguration" as const,

        academicYear: configAcademicYear || null,
        courseId: configCourse?.courseId || null,
        courseName: configCourse?.name || "",
        totalAmount: baseTotal,
        tuitionFee: baseTuition,
        otherFee: baseOther,
        otherFeeDescription: configYear?.otherFeeDescription || "",

        concessionPercentage,
        concessionName,
        appliedReferrals: matchedReferrals,
        tuitionConcession,
        otherFeeConcession,
        concessionAmount,

        discountedTuition,
        discountedTotal,

        // No given-amount block for config-only years
        givenAmount: 0,
        givenEntries: [],

        // Chosen option (full vs installment, filtered)
        paymentOption: chosenOption
          ? buildOptionWithConcession(chosenOption)
          : null,

        // All available options (each filtered)
        paymentOptions: paymentOptionsWithConcession,
      };
    });

    // ── 5) Legacy paidFees payload ──────────────────────────────
    //    Same scope: studentId + instituteId + programId
    const paidFilter: Record<string, any> = {
      studentId: student._id,
      instituteId: student.instituteId,
      programId: effectiveProgramId,
    };
    if (year !== undefined && year !== "") {
      paidFilter.year = Number(year);
    }

    const paidFees = await PaidFee.find(paidFilter).sort({ year: 1 });

    const grandTotal: number = paidFees.reduce<number>(
      (sum, p) => sum + (p.totalAmount || 0),
      0
    );

    const yearOptions = Array.from(
      { length: Math.max(courseYears, 1) },
      (_, i) => {
        const value = i + 1;
        const suffix =
          value === 1
            ? "st"
            : value === 2
              ? "nd"
              : value === 3
                ? "rd"
                : "th";
        return {
          value,
          label: `${value}${suffix} Year`,
          hasEntry: paidFees.some((p) => Number(p.year) === value),
          hasSnapshot: snapshotYearSet.has(value),
        };
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        years: yearsPayload,

        feeConcession: {
          referralIds: feeConcession?.referralIds || [],
          matchedReferrals,
          concessionPercentage,
          concessionName,
          appliedOn: "tuitionFee",
          paymentOptionId: concessionPaymentOptionId,
          paymentMode: concessionPaymentMode,
          allowedInstallmentCount,
        },

        paidFees,
        grandTotal,

        courseYears,
        yearOptions,

        student: {
          _id: student._id,
          studentId: student.studentId,
          firstname: student.firstname,
          lastname: student.lastname,
          programId: student.programId,
          instituteId: student.instituteId,
          year:student.year|| 1,
          academicYear: studentAcademicYear || null,
        },
      },
    });
  } catch (err: any) {
    console.error("Error getting paid fees:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   PUT /paid-fees/:id
   Update a single paid-fee doc
───────────────────────────────────────────── */

export const updatePaidFee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { entries, year } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paid fee ID",
      });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one entry is required",
      });
    }

    const cleanedEntries: CleanedEntry[] = cleanEntries(entries);
    const totalAmount: number = sumEntries(cleanedEntries);

    const updated = await PaidFee.findByIdAndUpdate(
      id,
      {
        $set: {
          entries: cleanedEntries,
          totalAmount,
          ...(year !== undefined && { year: Number(year) }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Paid fee record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Paid fee updated successfully",
      data: updated,
    });
  } catch (err: any) {
    console.error("Error updating paid fee:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Another paid fee already exists for this year",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   DELETE /paid-fees/:id
   Delete a paid-fee doc
───────────────────────────────────────────── */

export const deletePaidFee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paid fee ID",
      });
    }

    const deleted = await PaidFee.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Paid fee record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Paid fee deleted successfully",
    });
  } catch (err: any) {
    console.error("Error deleting paid fee:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};