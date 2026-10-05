import { Request, Response } from 'express';
import { feeConfigurationSchema } from './feeconfiguartion.sanitize';
import FeeConfiguration from './model';
import { StudentAuthRequest } from '../../middlewares/studentAuth'
import Student from '../students/model';
import Settings from '../settings/model';
import TuitionFees from '../tuition-payment/model';
import FeeConcession from '../fees-concession/model';
import { AuthRequest } from '../auth';
import Permission from '../permissions/model'
import PaidFee from '../paidfee/model';
import StudentFeeStructure from '../StudentFeeStructure/model';

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

    const { instituteId } = req.body;

    const feeConfig = await FeeConfiguration.findOneAndUpdate(
      { instituteId },
      { $set: req.body },
      {
        new: true,
        upsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Fee configuration saved successfully',
      data: feeConfig,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const getFeeConfigurationByInstitute = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { instituteId } = req.params;

    const user = req.user

    if (!user) return res.status(401).json({ message: 'Not authorized' })


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

    const feeConfig = await FeeConfiguration.findOne({
      instituteId,
    });

    if (!feeConfig) {
      return res.status(404).json({
        message: 'Fee configuration not found',
      });
    }

    return res.status(200).json({
      success: true,
      data: feeConfig,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
};


const round2 = (n: number) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export const getFeeConfigurationByStudent = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const studentId = req.student?.id;
    const { paymentmethod, chooseunpaidyear } = req.query;

    if (!studentId) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    if (student.interactions !== "Admitted") {
      return res.status(400).json({
        success: false,
        message: "You are not admitted yet",
      });
    }

    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("gstPercentage paymentMethod courseYears");

    const selectedYear = Number(chooseunpaidyear || student.year || 1);
    const currentYear = Number(student.year || 1);

    // ------------------------------------------------------------------
    // 1) STUDENT FEE STRUCTURE (snapshot) – fetched once for ALL years.
    //    Used for: selected-year data + unpaidYears calculation.
    // ------------------------------------------------------------------
    const studentFeeStructures = await StudentFeeStructure.find({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
    }).lean();

    const yearSnapshot: any = studentFeeStructures.find(
      (rec: any) => Number(rec.year) === selectedYear
    );

    // ------------------------------------------------------------------
    // 2) FEE CONFIGURATION – only mandatory when no snapshot exists
    // ------------------------------------------------------------------
    const feeConfiguration: any = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!yearSnapshot && !feeConfiguration) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    const courseFee: any = feeConfiguration?.courseFeeStructure?.find(
      (course: any) => course.courseId === student.programId
    );

    if (!yearSnapshot && !courseFee) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found for this Course",
      });
    }

    // ------------------------------------------------------------------
    // 3) CONCESSION (referrals live in FeeConfiguration)
    // ------------------------------------------------------------------
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
      status: "approved",
    }).select("referralIds paymentOptionId");

    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length && feeConfiguration?.referrals?.length) {
      matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (sum: number, ref: any) => sum + (ref.percentage || 0),
        0
      );
    }

    // ------------------------------------------------------------------
    // 4) PAID FEE RECORDS (only for givenAmount info)
    // ------------------------------------------------------------------
    const paidFeeRecords = await PaidFee.find({
      studentId: student._id.toString(),
      instituteId: student.instituteId,
      programId: student.programId,
      year: selectedYear,
    }).lean();

    const currentYearPaidFeeTotal = paidFeeRecords.reduce(
      (sum, pf) => sum + Number(pf.totalAmount || 0),
      0
    );

    // ------------------------------------------------------------------
    // 5) PAYMENT METHOD
    //    snapshot exists  -> locked to what the student already chose
    //    no snapshot      -> requested method (default full_payment)
    // ------------------------------------------------------------------
    const initialPaymentType: string | null = yearSnapshot
      ? yearSnapshot.paymentOption?.type ?? null
      : currentYearPaidFeeTotal > 0
        ? "full_payment"
        : null;

    const selectedPaymentMethod: string =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // ------------------------------------------------------------------
    // 6) YEAR SOURCE: snapshot first, else fee configuration
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
      const originalTotalAmount = year.amount;
      const tuitionFee = Number(year.tuitionFee || 0);
      const otherFee = Number(year.otherFee || 0);
      const feedescription = year.otherFeeDescription;

      // Concession on tuition fee only
      const tuitionConcession = round2((tuitionFee * concessionPercentage) / 100);
      const totalPayableAmount = tuitionFee - tuitionConcession + otherFee;

      const paymentOptions = year.paymentOptions || [];

      // Pick which option(s) to show
      let filteredOptions: any[] = [];

      if (yearSnapshot) {
        // Snapshot already holds the single option the student chose
        filteredOptions = paymentOptions;
      } else if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        filteredOptions = paymentOptions.filter(
          (option: any) =>
            option.type === "installment" &&
            option.paymentOptionId ===
            (feeConcession?.paymentOptionId ??
              `${student.instituteId}-INSTALLMENT-2`)
        );
      }

      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          const isPaid = inst.status === "paid";

          const instTuitionFee = Number(inst.tuitionFee || 0);
          const instOtherFee = Number(inst.otherFee || 0);

          const instTuitionConcession = round2(
            (instTuitionFee * concessionPercentage) / 100
          );
          const payableInstAmount =
            instTuitionFee - instTuitionConcession + instOtherFee;

          // Without snapshot, keep the old behaviour of deducting what is
          // already paid for the year. With snapshot, per-installment status
          // already tracks payments, so nothing extra is deducted.
          const payable = isPaid
            ? 0
            : yearSnapshot
              ? payableInstAmount
              : payableInstAmount - currentYearPaidFeeTotal;

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
            dueDate: inst.dueDate,
            paid: isPaid,
            paidDate: inst.paidDate ?? null,
            paymentId: inst.paymentId ?? null,
            orderId: null,
            paymentAmount: isPaid ? inst.paidAmount ?? null : null,
          };
        })
      );

      // Year payable:
      //   snapshot    -> sum of installments still pending
      //   no snapshot -> total payable minus already paid
      const yearPayable = yearSnapshot
        ? processedOptions.reduce(
          (sum: number, i: any) => sum + Number(i.payableAmount || 0),
          0
        )
        : totalPayableAmount - currentYearPaidFeeTotal;

      return {
        year: year.year,
        originalAmount: originalTotalAmount,
        tuitionFee,
        FeeDescription: feedescription,
        otherFee,
        concessionPercentage,
        tuitionConcession,
        otherFeeConcession: 0,
        concessionAmount: tuitionConcession,
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
    // 7) UNPAID PREVIOUS YEARS (reuses studentFeeStructures from above)
    // ------------------------------------------------------------------
    const unpaidYears: number[] = [];

    for (let yearNumber = 1; yearNumber < currentYear; yearNumber++) {
      const yearFeeRecord: any = studentFeeStructures.find(
        (rec: any) => Number(rec.year) === yearNumber
      );

      // No record for this year -> unpaid
      if (!yearFeeRecord) {
        unpaidYears.push(yearNumber);
        continue;
      }

      const installments = yearFeeRecord.paymentOption?.installments || [];

      // No installments configured -> unpaid
      if (!installments.length) {
        unpaidYears.push(yearNumber);
        continue;
      }

      // ANY installment not "paid" -> year is unpaid
      const hasPending = installments.some(
        (inst: any) => inst.status !== "paid"
      );

      if (hasPending) {
        unpaidYears.push(yearNumber);
      }
    }

    // Previous years descending (2, 1)
    unpaidYears.sort((a, b) => b - a);

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        courseName: yearSnapshot?.courseName ?? courseFee?.name,
        paymentMethod: settingsDoc?.paymentMethod,
        initialPaymentType,
        givenAmount: currentYearPaidFeeTotal,
        givenAmountEntries: paidFeeRecords.map((pf) => ({
          amount: pf.totalAmount,
          entries: pf.entries || [],
        })),
        unpaidYears,
        feeConcession: {
          referralIds: feeConcession?.referralIds || [],
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
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
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
    // 1) STUDENT FEE STRUCTURE (snapshot) – fetched once for ALL years.
    //    Used for: selected-year data + unpaidYears calculation.
    // ------------------------------------------------------------------
    const studentFeeStructures = await StudentFeeStructure.find({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
    }).lean();

    const yearSnapshot: any = studentFeeStructures.find(
      (rec: any) => Number(rec.year) === selectedYear
    );

    // ------------------------------------------------------------------
    // 2) FEE CONFIGURATION – only mandatory when no snapshot exists
    // ------------------------------------------------------------------
    const feeConfiguration: any = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!yearSnapshot && !feeConfiguration) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    const courseFee: any = feeConfiguration?.courseFeeStructure?.find(
      (course: any) => course.courseId === student.programId
    );

    if (!yearSnapshot && !courseFee) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found for this Course",
      });
    }

    // ------------------------------------------------------------------
    // 3) CONCESSION (referrals live in FeeConfiguration)
    // ------------------------------------------------------------------
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      programId: student.programId,
      status: "approved",
    }).select("referralIds paymentOptionId");

    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length && feeConfiguration?.referrals?.length) {
      matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (sum: number, ref: any) => sum + (ref.percentage || 0),
        0
      );
    }

    // ------------------------------------------------------------------
    // 4) PAID FEE RECORDS (only for givenAmount info)
    // ------------------------------------------------------------------
    const paidFeeRecords = await PaidFee.find({
      studentId: student._id.toString(),
      instituteId: student.instituteId,
      programId: student.programId,
      year: selectedYear,
    }).lean();

    const currentYearPaidFeeTotal = paidFeeRecords.reduce(
      (sum, pf) => sum + Number(pf.totalAmount || 0),
      0
    );

    // ------------------------------------------------------------------
    // 5) PAYMENT METHOD
    //    snapshot exists  -> locked to what the student already chose
    //    no snapshot      -> requested method (default full_payment)
    // ------------------------------------------------------------------
    const initialPaymentType: string | null = yearSnapshot
      ? yearSnapshot.paymentOption?.type ?? null
      : currentYearPaidFeeTotal > 0
        ? "full_payment"
        : null;

    const selectedPaymentMethod: string =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // ------------------------------------------------------------------
    // 6) YEAR SOURCE: snapshot first, else fee configuration
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
      const originalTotalAmount = year.amount;
      const tuitionFee = Number(year.tuitionFee || 0);
      const otherFee = Number(year.otherFee || 0);
      const feedescription = year.otherFeeDescription;

      // Concession on tuition fee only
      const tuitionConcession = round2((tuitionFee * concessionPercentage) / 100);
      const totalPayableAmount = tuitionFee - tuitionConcession + otherFee;

      const paymentOptions = year.paymentOptions || [];

      // Pick which option(s) to show
      let filteredOptions: any[] = [];

      if (yearSnapshot) {
        // Snapshot already holds the single option the student chose
        filteredOptions = paymentOptions;
      } else if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        filteredOptions = paymentOptions.filter(
          (option: any) =>
            option.type === "installment" &&
            option.paymentOptionId ===
            (feeConcession?.paymentOptionId ??
              `${student.instituteId}-INSTALLMENT-2`)
        );
      }

      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          const isPaid = inst.status === "paid";

          const instTuitionFee = Number(inst.tuitionFee || 0);
          const instOtherFee = Number(inst.otherFee || 0);

          const instTuitionConcession = round2(
            (instTuitionFee * concessionPercentage) / 100
          );
          const payableInstAmount =
            instTuitionFee - instTuitionConcession + instOtherFee;

          // Without snapshot, keep the old behaviour of deducting what is
          // already paid for the year. With snapshot, per-installment status
          // already tracks payments, so nothing extra is deducted.
          const payable = isPaid
            ? 0
            : yearSnapshot
              ? payableInstAmount
              : payableInstAmount - currentYearPaidFeeTotal;

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
            dueDate: inst.dueDate,
            paid: isPaid,
            paidDate: inst.paidDate ?? null,
            paymentId: inst.paymentId ?? null,
            orderId: null,
            paymentAmount: isPaid ? inst.paidAmount ?? null : null,
          };
        })
      );

      // Year payable:
      //   snapshot    -> sum of installments still pending
      //   no snapshot -> total payable minus already paid
      const yearPayable = yearSnapshot
        ? processedOptions.reduce(
          (sum: number, i: any) => sum + Number(i.payableAmount || 0),
          0
        )
        : totalPayableAmount - currentYearPaidFeeTotal;

      return {
        year: year.year,
        originalAmount: originalTotalAmount,
        tuitionFee,
        FeeDescription: feedescription,
        otherFee,
        concessionPercentage,
        tuitionConcession,
        otherFeeConcession: 0,
        concessionAmount: tuitionConcession,
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
    // 7) UNPAID PREVIOUS YEARS (reuses studentFeeStructures from above)
    // ------------------------------------------------------------------
    const unpaidYears: number[] = [];

    for (let yearNumber = 1; yearNumber < currentYear; yearNumber++) {
      const yearFeeRecord: any = studentFeeStructures.find(
        (rec: any) => Number(rec.year) === yearNumber
      );

      // No record for this year -> unpaid
      if (!yearFeeRecord) {
        unpaidYears.push(yearNumber);
        continue;
      }

      const installments = yearFeeRecord.paymentOption?.installments || [];

      // No installments configured -> unpaid
      if (!installments.length) {
        unpaidYears.push(yearNumber);
        continue;
      }

      // ANY installment not "paid" -> year is unpaid
      const hasPending = installments.some(
        (inst: any) => inst.status !== "paid"
      );

      if (hasPending) {
        unpaidYears.push(yearNumber);
      }
    }

    // Previous years descending (2, 1)
    unpaidYears.sort((a, b) => b - a);

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        courseName: yearSnapshot?.courseName ?? courseFee?.name,
        paymentMethod: settingsDoc?.paymentMethod,
        unpaidYears,
        givenAmount: currentYearPaidFeeTotal,
        givenAmountEntries: paidFeeRecords.map((pf) => ({
          amount: pf.totalAmount,
          entries: pf.entries || [],
        })),
        initialPaymentType,
        feeConcession: {
          referralIds: feeConcession?.referralIds || [],
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

export const deleteFeeConfiguration = async (
  req: Request,
  res: Response
) => {
  try {
    const { instituteId } = req.params;

    const deleted = await FeeConfiguration.findOneAndDelete({
      instituteId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: 'Fee configuration not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Fee configuration deleted successfully',
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
};