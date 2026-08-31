import { Request, Response } from 'express';
import { additionalFeeConfigurationSchema } from './additional-feeconfiguartion.sanitize';
import AdditionalFeeConfiguration from './model';
import { StudentAuthRequest } from '../../middlewares/studentAuth';
import Student from '../students/model';

export const upsertAdditionalFeeConfiguration = async (
  req: Request,
  res: Response
) => {
  try {
    const { error } = additionalFeeConfigurationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: error.details[0].message,
      });
    }

    const { instituteId } = req.body;

    const feeConfig = await AdditionalFeeConfiguration.findOneAndUpdate(
      { instituteId },
      { $set: req.body },
      {
        new: true,
        upsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: 'Additional fee configuration saved successfully',
      data: feeConfig,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
};

export const getAdditionalFeeConfigurationByInstitute = async (
  req: Request,
  res: Response
) => {
  try {
    const { instituteId } = req.params;

    const feeConfig = await AdditionalFeeConfiguration.findOne({
      instituteId,
    });

    if (!feeConfig) {
      return res.status(404).json({
        message: 'Additional fee configuration not found',
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

export const getAdditionalFeeConfigurationByStudent = async (
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

    const additionalFeeConfig = await AdditionalFeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!additionalFeeConfig) {
      return res.status(404).json({
        success: false,
        message: "Additional fee configuration not found",
      });
    }

    // Find the hostel fee structure for the student's current year
    const hostelFee = additionalFeeConfig.hostelFeeStructure.find(
      (fee: any) => fee.year === student.year?.toString() || fee.year === "1"
    );

    if (!hostelFee) {
      return res.status(404).json({
        success: false,
        message: `Hostel fee structure not found for year ${student.year || 1}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        year: student.year || 1,
        hostelFee: hostelFee,
      },
    });
  } catch (error: any) {
    console.error("Error fetching additional fee configuration:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const getAdditionalFeeConfigurationByAdmin = async (
  req: Request,
  res: Response
) => {
  try {
    const { studentId } = req.params;

    if (!studentId) {
      return res.status(400).json({
        success: false,
        message: "Student ID is required",
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

    const additionalFeeConfig = await AdditionalFeeConfiguration.findOne({
      instituteId: student.instituteId,
    });

    if (!additionalFeeConfig) {
      return res.status(404).json({
        success: false,
        message: "Additional fee configuration not found",
      });
    }

    // Find the hostel fee structure for the student's current year
    const hostelFee = additionalFeeConfig.hostelFeeStructure.find(
      (fee: any) => fee.year === student.year?.toString() || fee.year === "1"
    );

    if (!hostelFee) {
      return res.status(404).json({
        success: false,
        message: `Hostel fee structure not found for year ${student.year || 1}`,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        studentId: student.studentId,
        studentName: `${student.firstname} ${student.lastname}`,
        programId: student.programId,
        year: student.year || 1,
        hostelFee: hostelFee,
      },
    });
  } catch (error: any) {
    console.error("Error fetching additional fee configuration:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export const deleteAdditionalFeeConfiguration = async (
  req: Request,
  res: Response
) => {
  try {
    const { instituteId } = req.params;

    const deleted = await AdditionalFeeConfiguration.findOneAndDelete({
      instituteId,
    });

    if (!deleted) {
      return res.status(404).json({
        message: 'Additional fee configuration not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Additional fee configuration deleted successfully',
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      message: 'Internal server error',
    });
  }
};