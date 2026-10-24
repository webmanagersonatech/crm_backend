import { Request, Response } from "express";
import { feeConfigurationSchema } from "./feeconfiguartion.sanitize";
import FeeConfiguration from "./model";
import { StudentAuthRequest } from "../../middlewares/studentAuth";
import Student from "../students/model";
import Settings from "../settings/model";
import TuitionFees from "../tuition-payment/model";
import FeeConcession from "../fees-concession/model";
import { AuthRequest } from "../auth";
import Permission from "../permissions/model";
import PaidFee from "../paidfee/model";
import StudentFeeStructure from "../StudentFeeStructure/model";

const round2 = (n: number) =>
  Math.round((Number(n) + Number.EPSILON) * 100) / 100;


function pickInstallmentOption(
  paymentOptions: any[],
  pinnedOptionId?: string | null
): any[] {
  if (!Array.isArray(paymentOptions) || paymentOptions.length === 0) {
    return [];
  }

  const installments = paymentOptions.filter(
    (option: any) => option.type === "installment"
  );

  if (installments.length === 0) return [];

  if (pinnedOptionId) {
    const pinned = installments.find(
      (option: any) => option.paymentOptionId === pinnedOptionId
    );
    return pinned ? [pinned] : [];
  }

  const best = installments.reduce((a: any, b: any) =>
    (b.installments?.length ?? 0) > (a.installments?.length ?? 0) ? b : a
  );

  return [best];
}
/* ============================================================
   UPSERT FEE CONFIGURATION
   Scoped by (instituteId, academicYear)
   ============================================================ */

export const upsertFeeConfiguration = async (
  req: Request,
  res: Response
) => {
  try {
    const { error } = feeConfigurationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const { instituteId, academicYear } = req.body;

    // 🔹 academicYear is required by the schema, but double-check
    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: "academicYear is required",
      });
    }

    const feeConfig = await FeeConfiguration.findOneAndUpdate(
      { instituteId, academicYear },        // ✅ year-scoped
      { $set: req.body },
      { new: true, upsert: true }
    );

    return res.status(200).json({
      success: true,
      message: `Fee configuration for ${academicYear} saved successfully`,
      data: feeConfig,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

/* ============================================================
   GET FEE CONFIGURATION BY INSTITUTE (per year)
   ============================================================ */

export const getFeeConfigurationByInstitute = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { instituteId } = req.params;
    const academicYear = req.query.academicYear as string | undefined;

    const user = req.user;

    if (!user) return res.status(401).json({ message: "Not authorized" });

    if (user.role !== "superadmin") {
      if (instituteId !== user.instituteId) {
        return res.status(403).json({
          message: "You are not authorized to access this institution",
        });
      }

      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const Permissionallow = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Tuition Fee Configuration"
      );

      if (!Permissionallow?.view) {
        return res.status(403).json({
          message: "You have no permission to view this data",
        });
      }
    }

    // 🔹 academicYear is required to know which year's config to fetch
    if (!academicYear || typeof academicYear !== "string") {
      return res.status(400).json({
        success: false,
        message: "academicYear query param is required (e.g. 2023-2024)",
      });
    }

    const feeConfig = await FeeConfiguration.findOne({
      instituteId,
      academicYear,                     // ✅ year-scoped
    });

    // 🔹 Not an error — just "doesn't exist yet". Frontend handles this.
    return res.status(200).json({
      success: true,
      exists: !!feeConfig,
      data: feeConfig,                  // null when not created yet
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};

/* ============================================================
   GET FEE CONFIGURATION FOR STUDENT
   Snapshot first → FeeConfiguration fallback
   ============================================================ */

export const getFeeConfigurationByStudent = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const studentId = req.student?.id;
    const { paymentmethod, chooseunpaidyear } = req.query;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const student: any = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (student.interactions !== "Admitted") {
      return res.status(400).json({ success: false, message: "You are not admitted yet" });
    }

    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("gstPercentage paymentMethod courseYears");

    const selectedYear = Number(chooseunpaidyear || student.year || 1);
    const currentYear = Number(student.year || 1);

    // ------------------------------------------------------------------
    // 1) STUDENT FEE STRUCTURE (snapshot) - FIRST PRIORITY
    //    Fetched once for ALL years (needed for unpaidYears too).
    //    Selected year: prefer the record matching student's academicYear,
    //    else any record of that year (e.g. previous unpaid year, which
    //    belongs to an older academic year).
    // ------------------------------------------------------------------
    const studentFeeStructures: any[] = await StudentFeeStructure.find({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
    }).lean();

    const yearSnapshot: any =
      studentFeeStructures.find(
        (rec: any) =>
          Number(rec.year) === selectedYear &&
          (!student.academicYear || rec.academicYear === student.academicYear)
      ) ||
      studentFeeStructures.find((rec: any) => Number(rec.year) === selectedYear);

    // ------------------------------------------------------------------
    // 2) FEE CONFIGURATION - FALLBACK (only when no snapshot)
    //    Filtered by instituteId + student's academicYear
    // ------------------------------------------------------------------
    let feeConfiguration: any = null;
    let courseFee: any = null;

    if (!yearSnapshot) {
      const configFilter: any = { instituteId: student.instituteId };
      if (student.academicYear) configFilter.academicYear = student.academicYear;

      feeConfiguration = await FeeConfiguration.findOne(configFilter);

      if (!feeConfiguration) {
        return res.status(404).json({
          success: false,
          message: "Fee configuration not found",
        });
      }

      courseFee = feeConfiguration.courseFeeStructure?.find(
        (course: any) => course.courseId === student.programId
      );

      if (!courseFee) {
        return res.status(404).json({
          success: false,
          message: "Fee structure not found for this Course",
        });
      }
    }

    // ------------------------------------------------------------------
    // 3) CONCESSION
    //    snapshot    -> use what is already stored
    //    no snapshot -> calculate from approved FeeConcession + referrals
    // ------------------------------------------------------------------
    let feeConcession: any = null;
    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (yearSnapshot) {
      matchedReferrals = yearSnapshot.appliedReferrals || [];
      concessionPercentage = Number(yearSnapshot.concessionPercentage || 0);
    } else {
      feeConcession = await FeeConcession.findOne({
        studentId: student._id,
        instituteId: student.instituteId,
        programId: student.programId,
        status: "approved",
      }).select("referralIds paymentOptionId");

      if (feeConcession?.referralIds?.length && feeConfiguration?.referrals?.length) {
        matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
          feeConcession.referralIds.includes(ref.referralId)
        );

        concessionPercentage = matchedReferrals.reduce(
          (sum: number, ref: any) => sum + (ref.percentage || 0),
          0
        );
      }
    }

    // ------------------------------------------------------------------
    // 4) PAYMENT METHOD
    //    snapshot  -> locked to the type the student already chose
    //    otherwise -> requested method (default full_payment)
    // ------------------------------------------------------------------
    const initialPaymentType: string | null = yearSnapshot
      ? yearSnapshot.paymentOption?.type ?? null
      : null;

    const selectedPaymentMethod: string =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // ------------------------------------------------------------------
    // 5) YEAR SOURCE
    // ------------------------------------------------------------------
    const yearsSource: any[] = yearSnapshot
      ? [
        {
          year: yearSnapshot.year,
          amount: yearSnapshot.totalAmount,
          tuitionFee: yearSnapshot.tuitionFee,
          otherFee: yearSnapshot.otherFee,
          otherFeeDescription: yearSnapshot.otherFeeDescription,
          paymentOptions: yearSnapshot.paymentOption
            ? [yearSnapshot.paymentOption]
            : [],
        },
      ]
      : (courseFee.years || []).filter(
        (y: any) => Number(y.year) === selectedYear
      );

    const enrichedYears = yearsSource.map((year: any) => {
      const tuitionFee = Number(year.tuitionFee || 0);
      const otherFee = Number(year.otherFee || 0);

      let tuitionConcession: number;
      let totalPayableAmount: number;

      if (yearSnapshot) {
        // Already calculated & stored
        tuitionConcession = Number(yearSnapshot.tuitionConcession || 0);
        totalPayableAmount = tuitionFee - tuitionConcession + otherFee;
      } else {
        tuitionConcession = round2((tuitionFee * concessionPercentage) / 100);
        totalPayableAmount = tuitionFee - tuitionConcession + otherFee;
      }

      const paymentOptions = year.paymentOptions || [];

      // Pick which option(s) to show
      let filteredOptions: any[] = [];

      if (yearSnapshot) {
        filteredOptions = paymentOptions;
      } else if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        // ✅ One line — the helper decides the count from the data.
        filteredOptions = pickInstallmentOption(
          paymentOptions,
          feeConcession?.paymentOptionId ?? null
        );
      }

      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          const isPaid = inst.status === "paid";
          const instTuitionFee = Number(inst.tuitionFee || 0);
          const instOtherFee = Number(inst.otherFee || 0);

          // Snapshot: use stored values (payableAmount already has
          // concession and given amount deducted).
          // Config: calculate fresh.
          const instTuitionConcession = yearSnapshot
            ? Number(inst.tuitionConcession || 0)
            : round2((instTuitionFee * concessionPercentage) / 100);

          const payable = isPaid
            ? 0
            : yearSnapshot
              ? Number(inst.payableAmount ?? 0)
              : instTuitionFee - instTuitionConcession + instOtherFee;

          return {
            paymentOptionId: option.paymentOptionId,
            name: option.name,
            number: inst.number,
            type: option.type,
            originalAmount: inst.amount,
            tuitionFee: instTuitionFee,
            otherFee: instOtherFee,

            tuitionConcession: isPaid ? 0 : instTuitionConcession,
            otherFeeConcession: 0,
            discountAmount: isPaid ? 0 : instTuitionConcession,
            payableAmount: round2(Math.max(payable, 0)),
            appliedNow: yearSnapshot ? Number(inst.appliedNow || 0) : 0,
            dueDate: inst.dueDate,
            paid: isPaid,
            paidDate: inst.paidDate ?? null,
            paymentId: inst.paymentId ?? null,
            orderId: null,
            paymentAmount: isPaid ? inst.paidAmount ?? null : null,
          };
        })
      );

      // Year payable = sum of installments still pending
      const yearPayable = processedOptions.reduce(
        (sum: number, i: any) => sum + Number(i.payableAmount || 0),
        0
      );

      return {
        year: year.year,
        originalAmount: year.amount,
        tuitionFee,
        FeeDescription: year.otherFeeDescription,
        otherFee,
        concessionPercentage,
        tuitionConcession,
        otherFeeConcession: 0,
        concessionAmount: tuitionConcession,
        totalPayableAmount: round2(totalPayableAmount),
        payableAmount: round2(Math.max(yearPayable, 0)),
        paymentMethod: selectedPaymentMethod,
        source: yearSnapshot ? "studentFeeStructure" : "feeConfiguration",

        paymentOptions: processedOptions,
        ...(processedOptions.length === 0 && {
          message:
            selectedPaymentMethod === "installment"
              ? "Installment option not available for this course"
              : "Full payment option not available for this course",
        }),
      };
    });

    // ------------------------------------------------------------------
    // 6) UNPAID PREVIOUS YEARS (reuses studentFeeStructures)
    // ------------------------------------------------------------------
    const unpaidYears: number[] = [];

    for (let yearNumber = 1; yearNumber < currentYear; yearNumber++) {
      const yearFeeRecord: any = studentFeeStructures.find(
        (rec: any) => Number(rec.year) === yearNumber
      );

      if (!yearFeeRecord) {
        unpaidYears.push(yearNumber);
        continue;
      }

      const installments = yearFeeRecord.paymentOption?.installments || [];

      if (!installments.length) {
        unpaidYears.push(yearNumber);
        continue;
      }

      if (installments.some((inst: any) => inst.status !== "paid")) {
        unpaidYears.push(yearNumber);
      }
    }

    unpaidYears.sort((a, b) => b - a);

    // ------------------------------------------------------------------
    // 7) GIVEN AMOUNT - straight from the snapshot
    // ------------------------------------------------------------------
    const givenAmount = Number(yearSnapshot?.givenAmount || 0);
    const givenEntries = yearSnapshot?.givenEntries || [];

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        academicYear: yearSnapshot?.academicYear ?? student.academicYear ?? null,
        courseName: yearSnapshot?.courseName ?? courseFee?.name,
        paymentMethod: settingsDoc?.paymentMethod,
        initialPaymentType,
        givenAmount,
        givenAmountEntries: givenEntries.length
          ? [{ amount: givenAmount, entries: givenEntries }]
          : [],
        unpaidYears,
        feeConcession: {
          referralIds: yearSnapshot
            ? matchedReferrals.map((r: any) => r.referralId)
            : feeConcession?.referralIds || [],
          matchedReferrals,
          concessionPercentage,
          appliedOn: "tuitionFee",
        },
        years: enrichedYears,
      },
    });
  } catch (error: any) {
    console.error("Error fetching fee configuration:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ============================================================
   GET FEE CONFIGURATION FOR ADMIN
   Same as student, but admin-authenticated
   ============================================================ */

export const getFeeConfigurationByadmin = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) return res.status(401).json({ message: "Not authorized" });

    const { paymentmethod, chooseunpaidyear } = req.query;
    const { studentId } = req.params;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const student: any = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    if (student.interactions !== "Admitted") {
      return res.status(400).json({
        success: false,
        message: "Student is not admitted yet",
      });
    }

    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("gstPercentage paymentMethod");

    const selectedYear = Number(chooseunpaidyear || student.year || 1);
    const currentYear = Number(student.year || 1);

    // ------------------------------------------------------------------
    // 1) STUDENT FEE STRUCTURE (snapshot) - FIRST PRIORITY
    //    Fetched once for ALL years (needed for unpaidYears too).
    //    Selected year: prefer the record matching student's academicYear,
    //    else any record of that year (e.g. previous unpaid year).
    // ------------------------------------------------------------------
    const studentFeeStructures: any[] = await StudentFeeStructure.find({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
    }).lean();

    const yearSnapshot: any =
      studentFeeStructures.find(
        (rec: any) =>
          Number(rec.year) === selectedYear &&
          (!student.academicYear || rec.academicYear === student.academicYear)
      ) ||
      studentFeeStructures.find((rec: any) => Number(rec.year) === selectedYear);

    // ------------------------------------------------------------------
    // 2) FEE CONFIGURATION - FALLBACK (only when no snapshot)
    //    Filtered by instituteId + student's academicYear
    // ------------------------------------------------------------------
    let feeConfiguration: any = null;
    let courseFee: any = null;

    if (!yearSnapshot) {
      const configFilter: any = { instituteId: student.instituteId };
      if (student.academicYear) configFilter.academicYear = student.academicYear;

      feeConfiguration = await FeeConfiguration.findOne(configFilter);

      if (!feeConfiguration) {
        return res.status(404).json({
          success: false,
          message: "Fee configuration not found",
        });
      }

      courseFee = feeConfiguration.courseFeeStructure?.find(
        (course: any) => course.courseId === student.programId
      );

      if (!courseFee) {
        return res.status(404).json({
          success: false,
          message: "Fee structure not found for this Course",
        });
      }
    }

    // ------------------------------------------------------------------
    // 3) CONCESSION
    //    snapshot    -> use what is already stored
    //    no snapshot -> calculate from approved FeeConcession + referrals
    // ------------------------------------------------------------------
    let feeConcession: any = null;
    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (yearSnapshot) {
      matchedReferrals = yearSnapshot.appliedReferrals || [];
      concessionPercentage = Number(yearSnapshot.concessionPercentage || 0);
    } else {
      feeConcession = await FeeConcession.findOne({
        studentId: student._id,
        instituteId: student.instituteId,
        programId: student.programId,
        status: "approved",
      }).select("referralIds paymentOptionId");

      if (feeConcession?.referralIds?.length && feeConfiguration?.referrals?.length) {
        matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
          feeConcession.referralIds.includes(ref.referralId)
        );

        concessionPercentage = matchedReferrals.reduce(
          (sum: number, ref: any) => sum + (ref.percentage || 0),
          0
        );
      }
    }

    // ------------------------------------------------------------------
    // 4) PAYMENT METHOD
    //    snapshot  -> locked to the type already chosen
    //    otherwise -> requested method (default full_payment)
    // ------------------------------------------------------------------
    const initialPaymentType: string | null = yearSnapshot
      ? yearSnapshot.paymentOption?.type ?? null
      : null;

    const selectedPaymentMethod: string =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // ------------------------------------------------------------------
    // 5) YEAR SOURCE
    // ------------------------------------------------------------------
    const yearsSource: any[] = yearSnapshot
      ? [
        {
          year: yearSnapshot.year,
          amount: yearSnapshot.totalAmount,
          tuitionFee: yearSnapshot.tuitionFee,
          otherFee: yearSnapshot.otherFee,
          otherFeeDescription: yearSnapshot.otherFeeDescription,
          paymentOptions: yearSnapshot.paymentOption
            ? [yearSnapshot.paymentOption]
            : [],
        },
      ]
      : (courseFee.years || []).filter(
        (y: any) => Number(y.year) === selectedYear
      );

    const enrichedYears = yearsSource.map((year: any) => {
      const tuitionFee = Number(year.tuitionFee || 0);
      const otherFee = Number(year.otherFee || 0);

      // Snapshot: already calculated & stored. Config: calculate fresh.
      const tuitionConcession = yearSnapshot
        ? Number(yearSnapshot.tuitionConcession || 0)
        : round2((tuitionFee * concessionPercentage) / 100);

      const totalPayableAmount = tuitionFee - tuitionConcession + otherFee;

      const paymentOptions = year.paymentOptions || [];

      // Pick which option(s) to show
      let filteredOptions: any[] = [];

      if (yearSnapshot) {
        filteredOptions = paymentOptions;
      } else if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        // ✅ One line — the helper decides the count from the data.
        filteredOptions = pickInstallmentOption(
          paymentOptions,
          feeConcession?.paymentOptionId ?? null
        );
      }

      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          const isPaid = inst.status === "paid";
          const instTuitionFee = Number(inst.tuitionFee || 0);
          const instOtherFee = Number(inst.otherFee || 0);

          // Snapshot: use stored values (payableAmount already has
          // concession and given amount deducted).
          // Config: calculate fresh.
          const instTuitionConcession = yearSnapshot
            ? Number(inst.tuitionConcession || 0)
            : round2((instTuitionFee * concessionPercentage) / 100);

          const payable = isPaid
            ? 0
            : yearSnapshot
              ? Number(inst.payableAmount ?? 0)
              : instTuitionFee - instTuitionConcession + instOtherFee;

          return {
            paymentOptionId: option.paymentOptionId,
            name: option.name,
            number: inst.number,
            type: option.type,
            originalAmount: inst.amount,
            tuitionFee: instTuitionFee,
            otherFee: instOtherFee,

            tuitionConcession: isPaid ? 0 : instTuitionConcession,
            otherFeeConcession: 0,
            discountAmount: isPaid ? 0 : instTuitionConcession,
            payableAmount: round2(Math.max(payable, 0)),
            appliedNow: yearSnapshot ? Number(inst.appliedNow || 0) : 0,
            dueDate: inst.dueDate,
            paid: isPaid,
            paidDate: inst.paidDate ?? null,
            paymentId: inst.paymentId ?? null,
            orderId: null,
            paymentAmount: isPaid ? inst.paidAmount ?? null : null,
          };
        })
      );

      // Year payable = sum of installments still pending
      const yearPayable = processedOptions.reduce(
        (sum: number, i: any) => sum + Number(i.payableAmount || 0),
        0
      );

      return {
        year: year.year,
        originalAmount: year.amount,
        tuitionFee,
        FeeDescription: year.otherFeeDescription,
        otherFee,
        concessionPercentage,
        tuitionConcession,
        otherFeeConcession: 0,
        concessionAmount: tuitionConcession,
        totalPayableAmount: round2(totalPayableAmount),
        payableAmount: round2(Math.max(yearPayable, 0)),
        paymentMethod: selectedPaymentMethod,
        source: yearSnapshot ? "studentFeeStructure" : "feeConfiguration",

        paymentOptions: processedOptions,
        ...(processedOptions.length === 0 && {
          message:
            selectedPaymentMethod === "installment"
              ? "Installment option not available for this course"
              : "Full payment option not available for this course",
        }),
      };
    });

    // ------------------------------------------------------------------
    // 6) UNPAID PREVIOUS YEARS (reuses studentFeeStructures)
    // ------------------------------------------------------------------
    const unpaidYears: number[] = [];

    for (let yearNumber = 1; yearNumber < currentYear; yearNumber++) {
      const yearFeeRecord: any = studentFeeStructures.find(
        (rec: any) => Number(rec.year) === yearNumber
      );

      if (!yearFeeRecord) {
        unpaidYears.push(yearNumber);
        continue;
      }

      const installments = yearFeeRecord.paymentOption?.installments || [];

      if (!installments.length) {
        unpaidYears.push(yearNumber);
        continue;
      }

      if (installments.some((inst: any) => inst.status !== "paid")) {
        unpaidYears.push(yearNumber);
      }
    }

    unpaidYears.sort((a, b) => b - a);

    // ------------------------------------------------------------------
    // 7) GIVEN AMOUNT - straight from the snapshot
    // ------------------------------------------------------------------
    const givenAmount = Number(yearSnapshot?.givenAmount || 0);
    const givenEntries = yearSnapshot?.givenEntries || [];

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        academicYear: yearSnapshot?.academicYear ?? student.academicYear ?? null,
        courseName: yearSnapshot?.courseName ?? courseFee?.name,
        paymentMethod: settingsDoc?.paymentMethod,
        unpaidYears,
        givenAmount,
        givenAmountEntries: givenEntries.length
          ? [{ amount: givenAmount, entries: givenEntries }]
          : [],
        initialPaymentType,
        feeConcession: {
          referralIds: yearSnapshot
            ? matchedReferrals.map((r: any) => r.referralId)
            : feeConcession?.referralIds || [],
          matchedReferrals,
          concessionPercentage,
          appliedOn: "tuitionFee",
        },
        years: enrichedYears,
      },
    });
  } catch (error: any) {
    console.error("Error fetching fee configuration:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

/* ============================================================
   DELETE FEE CONFIGURATION (per year)
   ============================================================ */

export const deleteFeeConfiguration = async (
  req: Request,
  res: Response
) => {
  try {
    const { instituteId } = req.params;
    const academicYear = req.query.academicYear as string | undefined;

    if (!academicYear) {
      return res.status(400).json({
        success: false,
        message: "academicYear query param is required",
      });
    }

    const deleted = await FeeConfiguration.findOneAndDelete({
      instituteId,
      academicYear,                     // ✅ year-scoped
    });

    if (!deleted) {
      return res.status(404).json({
        message: `Fee configuration for ${academicYear} not found`,
      });
    }

    return res.status(200).json({
      success: true,
      message: `Fee configuration for ${academicYear} deleted successfully`,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: "Internal server error",
    });
  }
};