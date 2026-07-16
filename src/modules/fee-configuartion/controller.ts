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

    // Get fee concession
    const feeConcession = await FeeConcession.findOne({
      studentId: student._id,
      instituteId: student.instituteId,
      status: "approved",
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

    const initallpaymentype =
      payments.length > 0 ? payments[0].paymentType : null;
    // Determine payment method
    const selectedPaymentMethod = initallpaymentype ? initallpaymentype : paymentmethod || "full_payment";



    const paidMap = new Map();

    payments.forEach((payment: any) => {
      const key = `${payment.courseId}-${payment.year}-${payment.installmentNumber}`;
      paidMap.set(key, payment);
    });

    // Build response based on payment method
    const enrichedYears = courseFee.years.map((year: any) => {
      const originalAmount = year.amount;

      const concessionAmount = (originalAmount * concessionPercentage) / 100;
      const payableAmount = originalAmount - concessionAmount;

      // Get payment options for this year
      const paymentOptions = year.paymentoptions || [];

      // Filter payment options based on selected method
      let filteredOptions = paymentOptions;

      if (selectedPaymentMethod === "full_payment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "full_payment"
        );
      } else if (selectedPaymentMethod === "installment") {
        filteredOptions = paymentOptions.filter(
          (option: any) => option.type === "installment"
        );
      }

      // Transform payment options to match expected response format
      const processedOptions = filteredOptions.map((option: any) => {
        const optionKey = `${courseFee.courseId}-${year.year}-${option.number}`;
        const payment = paidMap.get(optionKey);

        // Calculate discount for this specific option
        const optionDiscount = (option.amount * concessionPercentage) / 100;
        const payableOptionAmount = option.amount - optionDiscount;

        return {
          number: option.number,
          type: option.type,
          originalAmount: option.amount,
          discountAmount: optionDiscount,
          payableAmount: payableOptionAmount,
          dueDate: option.dueDate,
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
        paymentMethod: selectedPaymentMethod,
        paymentOptions: processedOptions, // Changed from 'installments' to 'paymentOptions'
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
        initallpaymentype,
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