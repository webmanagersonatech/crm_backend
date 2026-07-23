import { Request, Response } from 'express';
import { feeConfigurationSchema } from './feeconfiguartion.sanitize';
import FeeConfiguration from './model';
import { StudentAuthRequest } from '../../middlewares/studentAuth'
import Student from '../students/model';
import Settings from '../settings/model';
import TuitionFees from '../tuition-payment/model';
import FeeConcession from '../fees-concession/model';
import { AuthRequest } from '../auth';
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
  req: Request,
  res: Response
) => {
  try {
    const { instituteId } = req.params;

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


export const getFeeConfigurationByStudent = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const studentId = req.student?.id;
    const { paymentmethod } = req.query;

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
    }).select("gstPercentage paymentMethod");

    const feeConfiguration = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfiguration) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    const courseFee = feeConfiguration.courseFeeStructure.find(
      (course: any) => course.courseId === student.programId
    );

    if (!courseFee) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found for this Course",
      });
    }

    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      status: "approved",
    }).select("referralIds paymentOptionId");

    // Match referral IDs with configured referrals
    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length) {
      matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (sum: number, ref: any) => sum + (ref.percentage || 0),
        0
      );
    }

    // Which payment method was requested — default to full_payment


    // ✅ FIX: Fetch actual payment records for this student
    const payments = await TuitionFees.find({
      studentId: student.studentId,
      instituteId: student.instituteId,
      courseId: student.programId,
      status: "paid",
    }).lean();

    const initialPaymentType =
      payments.length > 0 ? payments[0].paymentType : null;

    const selectedPaymentMethod =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // ✅ Build paidMap from actual payment records
    const paidMap = new Map<string, any>();

    payments.forEach((payment: any) => {
      // Construct key matching the format used in the response
      const key = `${payment.courseId}-${payment.year}-${payment.paymentOptionId}-${payment.installmentNumber}`;
      paidMap.set(key, {
        paid: true,
        paymentId: payment.paymentId,
        paidDate: payment.paidDate,
        orderId: payment.orderId,
        amount: payment.amount,
        totalAmount: payment.totalAmount,
      });
    });

    // Build response based on payment method
    const enrichedYears = courseFee.years.map((year: any) => {
      const originalTotalAmount = year.amount;
      const tuitionFee = year.tuitionFee;
      const otherFee = year.otherFee;

      // Calculate concession on tuition fee only
      const tuitionConcession = (tuitionFee * concessionPercentage) / 100;
      const discountedTuitionFee = tuitionFee - tuitionConcession;

      // Other fee remains unchanged (add-on)
      const totalPayableAmount = discountedTuitionFee + otherFee;

      // Total concession amount (only from tuition fee)
      const totalConcessionAmount = tuitionConcession;

      const paymentOptions = year.paymentOptions || [];

      // Filter payment options based on selected method.
      let filteredOptions: any[] = [];

      if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        filteredOptions = paymentOptions.filter(
          (option: any) =>
            option.type === "installment" &&
            option.paymentOptionId === (feeConcession?.paymentOptionId ??
              `${student.instituteId}-INSTALLMENT-2`)
        );
      }

      // Flatten each matched option's installments into the response
      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          // ✅ Use the exact same key format for lookups
          const optionKey = `${courseFee.courseId}-${year.year}-${option.paymentOptionId}-${inst.number}`;
          const payment = paidMap.get(optionKey);

          // Calculate concession on tuition fee portion of installment only
          const installmentTuitionFee = inst.tuitionFee;
          const installmentOtherFee = inst.otherFee;

          const installmentTuitionConcession = (installmentTuitionFee * concessionPercentage) / 100;
          const discountedInstallmentTuition = installmentTuitionFee - installmentTuitionConcession;

          // Other fee remains unchanged
          const payableInstAmount = discountedInstallmentTuition + installmentOtherFee;
          const instDiscount = installmentTuitionConcession;

          return {
            paymentOptionId: option.paymentOptionId,
            name: option.name,
            number: inst.number,
            type: option.type,
            originalAmount: inst.amount,
            tuitionFee: installmentTuitionFee,
            otherFee: installmentOtherFee,
            tuitionConcession: instDiscount,
            otherFeeConcession: 0,
            discountAmount: instDiscount,
            payableAmount: payableInstAmount,
            dueDate: inst.dueDate,
            paid: !!payment, // ✅ Will be true for installment 1 with full payment
            paidDate: payment?.paidDate || null, // ✅ Will be "2026-07-23T04:55:33.363Z"
            paymentId: payment?.paymentId || null, // ✅ Will be "pay_TGotTkaJqGggZt"
            orderId: payment?.orderId || null,
            paymentAmount: payment?.amount || null,
          };
        })
      );

      return {
        year: year.year,
        originalAmount: originalTotalAmount,
        tuitionFee: tuitionFee,
        otherFee: otherFee,
        concessionPercentage,
        tuitionConcession: totalConcessionAmount,
        otherFeeConcession: 0,
        concessionAmount: totalConcessionAmount,
        payableAmount: totalPayableAmount,
        paymentMethod: selectedPaymentMethod,
        paymentOptions: processedOptions,
        ...(processedOptions.length === 0 && {
          message:
            selectedPaymentMethod === "installment"
              ? "Installment option not available for this course"
              : "Full payment option not available for this course",
        }),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        courseName: courseFee.name,
        paymentMethod: settingsDoc?.paymentMethod,
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

export const getFeeConfigurationByadmin = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) return res.status(401).json({ message: 'Not authorized' });

    const { paymentmethod } = req.query;
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

    const feeConfiguration = await FeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!feeConfiguration) {
      return res.status(404).json({
        success: false,
        message: "Fee configuration not found",
      });
    }

    const courseFee = feeConfiguration.courseFeeStructure.find(
      (course: any) => course.courseId === student.programId
    );

    if (!courseFee) {
      return res.status(404).json({
        success: false,
        message: "Fee structure not found for this Course",
      });
    }

    // Get fee concession with paymentOptionId
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      status: "approved",
    }).select("referralIds paymentOptionId");

    // Match referral IDs with configured referrals
    let matchedReferrals: any[] = [];
    let concessionPercentage = 0;

    if (feeConcession?.referralIds?.length) {
      matchedReferrals = feeConfiguration.referrals.filter((ref: any) =>
        feeConcession.referralIds.includes(ref.referralId)
      );

      concessionPercentage = matchedReferrals.reduce(
        (sum: number, ref: any) => sum + (ref.percentage || 0),
        0
      );
    }

    // Get paid transactions
    const payments = await TuitionFees.find({
      studentId: student.studentId,
      instituteId: student.instituteId,
      courseId: student.programId,
      status: "paid",
    }).lean();

    const initialPaymentType =
      payments.length > 0 ? payments[0].paymentType : null;

    const selectedPaymentMethod =
      initialPaymentType ?? (paymentmethod as string) ?? "full_payment";

    // Build paidMap from actual payment records
    const paidMap = new Map<string, any>();

    payments.forEach((payment: any) => {
      // Construct key matching the format used in the response
      const key = `${payment.courseId}-${payment.year}-${payment.paymentOptionId}-${payment.installmentNumber}`;
      paidMap.set(key, {
        paid: true,
        paymentId: payment.paymentId,
        paidDate: payment.paidDate,
        orderId: payment.orderId,
        amount: payment.amount,
        totalAmount: payment.totalAmount,
      });
    });

    // Build response based on payment method
    const enrichedYears = courseFee.years.map((year: any) => {
      const originalTotalAmount = year.amount;
      const tuitionFee = year.tuitionFee;
      const otherFee = year.otherFee;

      // Calculate concession on tuition fee only
      const tuitionConcession = (tuitionFee * concessionPercentage) / 100;
      const discountedTuitionFee = tuitionFee - tuitionConcession;

      // Other fee remains unchanged (add-on)
      const totalPayableAmount = discountedTuitionFee + otherFee;

      // Total concession amount (only from tuition fee)
      const totalConcessionAmount = tuitionConcession;

      const paymentOptions = year.paymentOptions || [];

      // Filter payment options based on selected method.
      let filteredOptions: any[] = [];

      if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        filteredOptions = paymentOptions.filter(
          (option: any) =>
            option.type === "installment" &&
            option.paymentOptionId === (feeConcession?.paymentOptionId ??
              `${student.instituteId}-INSTALLMENT-2`)
        );
      }

      // Flatten each matched option's installments into the response
      const processedOptions = filteredOptions.flatMap((option: any) =>
        (option.installments || []).map((inst: any) => {
          // Use the exact same key format for lookups
          const optionKey = `${courseFee.courseId}-${year.year}-${option.paymentOptionId}-${inst.number}`;
          const payment = paidMap.get(optionKey);

          // Calculate concession on tuition fee portion of installment only
          const installmentTuitionFee = inst.tuitionFee;
          const installmentOtherFee = inst.otherFee;

          const installmentTuitionConcession = (installmentTuitionFee * concessionPercentage) / 100;
          const discountedInstallmentTuition = installmentTuitionFee - installmentTuitionConcession;

          // Other fee remains unchanged
          const payableInstAmount = discountedInstallmentTuition + installmentOtherFee;
          const instDiscount = installmentTuitionConcession;

          return {
            paymentOptionId: option.paymentOptionId,
            name: option.name,
            number: inst.number,
            type: option.type,
            originalAmount: inst.amount,
            tuitionFee: installmentTuitionFee,
            otherFee: installmentOtherFee,
            tuitionConcession: instDiscount,
            otherFeeConcession: 0,
            discountAmount: instDiscount,
            payableAmount: payableInstAmount,
            dueDate: inst.dueDate,
            paid: !!payment,
            paidDate: payment?.paidDate || null,
            paymentId: payment?.paymentId || null,
            orderId: payment?.orderId || null,
            paymentAmount: payment?.amount || null,
          };
        })
      );

      return {
        year: year.year,
        originalAmount: originalTotalAmount,
        tuitionFee: tuitionFee,
        otherFee: otherFee,
        concessionPercentage,
        tuitionConcession: totalConcessionAmount,
        otherFeeConcession: 0,
        concessionAmount: totalConcessionAmount,
        payableAmount: totalPayableAmount,
        paymentMethod: selectedPaymentMethod,
        paymentOptions: processedOptions,
        ...(processedOptions.length === 0 && {
          message:
            selectedPaymentMethod === "installment"
              ? "Installment option not available for this course"
              : "Full payment option not available for this course",
        }),
      };
    });

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        courseName: courseFee.name,
        paymentMethod: settingsDoc?.paymentMethod,
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