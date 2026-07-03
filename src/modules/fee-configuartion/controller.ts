import { Request, Response } from 'express';
import { feeConfigurationSchema } from './feeconfiguartion.sanitize';
import FeeConfiguration from './model';
import { StudentAuthRequest } from '../../middlewares/studentAuth'
import Student from '../students/model';
import Settings from '../settings/model';
import TuitionFees from '../tuition-payment/model';
import FeeConcession from '../fees-concession/model';
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

    // Get fee concession
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      status: "approved", // Remove this line if pending concessions should also apply
    }).select("referralIds");

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
      status: "paid",
    });

    const paidMap = new Map();

    payments.forEach((payment: any) => {
      const key = `${payment.courseId}-${payment.year}-${payment.installmentNumber}`;
      paidMap.set(key, payment);
    });

    // Build response
    const enrichedYears = courseFee.years.map((year: any) => {
      const originalAmount = year.amount;

      const concessionAmount =
        (originalAmount * concessionPercentage) / 100;

      const payableAmount = originalAmount - concessionAmount;

      const installments = year.installments.map((installment: any) => {
        const originalInstallmentAmount = installment.amount;

        const installmentDiscount =
          (originalInstallmentAmount * concessionPercentage) / 100;

        const payableInstallmentAmount =
          originalInstallmentAmount - installmentDiscount;

        const key = `${courseFee.courseId}-${year.year}-${installment.number}`;
        const payment = paidMap.get(key);

        return {
          number: installment.number,
          originalAmount: originalInstallmentAmount,
          discountAmount: installmentDiscount,
          payableAmount: payableInstallmentAmount,
          dueDate: installment.dueDate,
          paid: payment ? true : false,
          paidDate: payment?.paidDate || null,
          paymentId: payment?.paymentId || null,
        };
      });

      return {
        year: year.year,
        originalAmount,
        concessionPercentage,
        concessionAmount,
        payableAmount,
        installments,
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

        feeConcession: {
          referralIds: feeConcession?.referralIds || [],
          matchedReferrals,
          concessionPercentage,
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