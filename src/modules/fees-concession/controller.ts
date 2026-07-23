import { Request, Response } from "express";
import FeeConcession from "./model";
import Student from "../students/model";
import { AuthRequest } from "../../middlewares/auth";
import { createFeeConcessionSchema } from "./feesconcession.sanitize";
import Permission from '../permissions/model';
import FeeConfiguration from "../fee-configuartion/model"
import Institution from "../institutions/model";
/**
 * Create or Update Fee Concession (Upsert with Status Check)
 */
export const createFeeConcession = async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = createFeeConcessionSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const createdBy = req.user?.id;

  if (!createdBy) {
    return res.status(401).json({
      success: false,
      message: "Not authorized",
    });
  }

  try {
    // Check if the student exists
    const student = await Student.findById(value.studentId);
    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // Find existing fee concession for this student
    const existingFeeConcession = await FeeConcession.findOne({
      studentId: value.studentId,
    });

    let feeConcession;
    let isUpdate = false;

    if (existingFeeConcession) {
      if (existingFeeConcession.status === "approved") {
        return res.status(400).json({
          success: false,
          message: "Cannot modify an already approved fee concession",
        });
      }

      // Update existing fee concession
      const updateData: any = {
        ...value,
        instituteId: student.instituteId,
        updatedBy: createdBy,
        updatedAt: new Date(),
      };



      feeConcession = await FeeConcession.findByIdAndUpdate(
        existingFeeConcession._id,
        updateData,
        {
          new: true,
          runValidators: true,
        }
      );
      isUpdate = true;
    } else {
      // Create new fee concession
      feeConcession = await FeeConcession.create({
        ...value,
        instituteId: student.instituteId,
        createdBy,
        status: "pending",
      });
    }

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate
        ? "Fee concession updated successfully"
        : "Fee concession created successfully",
      data: feeConcession,
    });
  } catch (err: any) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

/**
 * List Fee Concessions with Pagination and Filters
 */
export const listFeeConcessions = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Permission Check
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const permission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Fee Concession Approval"
      );

      if (!permission?.view) {
        return res.status(403).json({
          success: false,
          message: "You have no permission to view this data",
        });
      }
    }

    // Query Params
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = (req.query.search as string)?.trim() || "";
    const status = (req.query.status as string) || "all";
    const instituteId = req.query.instituteId as string;

    // Build Query
    const query: any = {};

    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        query.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      query.instituteId = user.instituteId;
    } else {
      query.instituteId = user.instituteId;
      query.createdBy = user.id;
    }

    if (status !== "all") {
      query.status = status;
    }

    // Enhanced Search - Now searches across student fields and counselor name
    if (search) {
      // First, find students that match the search criteria
      const studentMatchQuery: any = {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { mobileNo: { $regex: search, $options: "i" } },
        ]
      };

      // Apply institute filter to student search if applicable
      if (query.instituteId) {
        studentMatchQuery.instituteId = query.instituteId;
      }

      // Find matching student IDs
      const matchingStudents = await Student.find(studentMatchQuery)
        .select('_id')
        .lean();

      const studentIds = matchingStudents.map((s: any) => s._id);

      // Build the final search query for fee concessions
      query.$or = [
        // Search by counselor name
        { counsellorName: { $regex: search, $options: "i" } },
        // Search by reason
        { reason: { $regex: search, $options: "i" } },
        // Search by student ID from the matching students
        ...(studentIds.length > 0 ? [{ studentId: { $in: studentIds } }] : [])
      ];
    }

    // Get Fee Concessions
    const feeConcessions = await (FeeConcession as any).paginate(query, {
      page,
      limit,
      sort: {
        createdAt: -1,
      },
      populate: [
        {
          path: "student",
          select:
            "studentId firstname lastname applicationId programId admissionNumber classSection mobileNo email instituteId",
        },
        {
          path: "creator",
          select: "firstname lastname designation role",
        },
        {
          path: "approver",
          select: "firstname lastname designation role",
        },
      ],
      lean: true,
    });

    // Get all Fee Configurations
    const feeConfigurations = await FeeConfiguration.find().lean();

    const feeConfigMap = new Map();

    feeConfigurations.forEach((config: any) => {
      feeConfigMap.set(config.instituteId, config);
    });

    // Get all institutions for the students
    const instituteIds = feeConcessions.docs
      .map((item: any) => item.student?.instituteId)
      .filter(Boolean);

    // Get unique institute IDs
    const uniqueInstituteIds = [...new Set(instituteIds)];

    // Fetch all institutions
    const institutions = await Institution.find({
      instituteId: { $in: uniqueInstituteIds }
    }).lean();

    const institutionMap = new Map();
    institutions.forEach((inst: any) => {
      institutionMap.set(inst.instituteId, inst);
    });

    // Response
    const docs = feeConcessions.docs.map((item: any) => {
      const student = item.student || {};
      const creator = item.creator || {};
      const approver = item.approver || {};

      const feeConfiguration = feeConfigMap.get(item.instituteId);

      const referralMap = new Map();
      const courseFeeMap = new Map();

      feeConfiguration?.referrals?.forEach((ref: any) => {
        referralMap.set(ref.referralId, ref);
      });

      feeConfiguration?.courseFeeStructure?.forEach((course: any) => {
        courseFeeMap.set(course.courseId, course);
      });

      const course = courseFeeMap.get(student.programId);
      const year = course?.years?.[0];

      // Get institution from map
      const institution = institutionMap.get(student.instituteId);

      // Build referrals array
      const referrals = (item.referralIds || []).map((id: string) => {
        const referral = referralMap.get(id);
        return {
          referralId: id,
          name: referral?.name || "",
          percentage: referral?.percentage || 0,
        };
      });

      // Calculate total discount percentage
      const totalDiscountPercentage = referrals.reduce((sum: number, ref: any) => {
        return sum + (ref.percentage || 0);
      }, 0);

      // Get tuition fee and other fee from the year
      const tuitionFee = year?.tuitionFee || 0;
      const otherFee = year?.otherFee || 0;
      const originalAmount = tuitionFee + otherFee;

      // Calculate discount amount - ONLY ON TUITION FEE
      const discountAmount = (tuitionFee * totalDiscountPercentage) / 100;

      // Calculate discounted tuition fee
      const discountedTuition = tuitionFee - discountAmount;

      // Final amount = discounted tuition + other fee (other fee remains static)
      const finalAmount = discountedTuition + otherFee;

      // Get payment option details from fee configuration
      let paymentOption = null;
      if (item.paymentOptionId && feeConfiguration) {
        // Find the payment option from the course structure
        const courseWithPayment = feeConfiguration.courseFeeStructure?.find(
          (c: any) => c.courseId === student.programId
        );

        if (courseWithPayment) {
          const yearData = courseWithPayment.years?.[0];
          if (yearData) {
            const foundOption = yearData.paymentOptions?.find(
              (opt: any) => opt.paymentOptionId === item.paymentOptionId
            );
            if (foundOption) {
              paymentOption = {
                paymentOptionId: foundOption.paymentOptionId,
                name: foundOption.name,
                type: foundOption.type,
                installmentCount: foundOption.installments?.length || 0
              };
            }
          }
        }
      }

      return {
        _id: item._id,
        student: {
          _id: student._id,
          studentId: student.studentId,
          applicationId: student.applicationId,
          programId: student.programId,
          firstname: student.firstname,
          lastname: student.lastname,
          fullName: `${student.firstname ?? ""} ${student.lastname ?? ""}`.trim(),
          email: student.email,
          mobileNo: student.mobileNo,
          institute: institution ? institution.name : "",
          feeConcessiondeatils: {
            courseId: course?.courseId || "",
            name: course?.name || "",
            amount: originalAmount,
            tuitionFee: tuitionFee,
            otherFee: otherFee,
            discountedTuition: discountedTuition,
            discountAmount: discountAmount,
            totalDiscountPercentage: totalDiscountPercentage,
            finalAmount: finalAmount,
            referrals: referrals,
            reason: item.reason,
            counsellorName: item.counsellorName,
            status: item.status,
            createdAt: item.createdAt,
            paymentOptionId: item.paymentOptionId || null, // ADDED: payment option ID
            paymentOption: paymentOption, // ADDED: full payment option details
            breakdown: {
              tuitionFee: tuitionFee,
              otherFee: otherFee,
              discountApplied: `-₹${discountAmount.toLocaleString()} (${totalDiscountPercentage}% on tuition)`,
              finalTuition: discountedTuition,
              finalTotal: finalAmount
            }
          }
        },
        createdBy: creator?._id
          ? {
            _id: creator._id,
            firstname: creator.firstname,
            lastname: creator.lastname,
            designation: creator.designation,
            role: creator.role,
          }
          : null,
        approvedBy: approver?._id
          ? {
            _id: approver._id,
            firstname: approver.firstname,
            lastname: approver.lastname,
            designation: approver.designation,
            role: approver.role,
          }
          : null,
      };
    });

    const statsQuery: any = {};

    // Apply same filters as list
    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        statsQuery.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      statsQuery.instituteId = user.instituteId;
    } else {
      statsQuery.instituteId = user.instituteId;
      statsQuery.createdBy = user.id;
    }

    // Apply search filter also if needed for stats
    if (search) {
      // Reuse the same search logic for stats
      const studentMatchQuery: any = {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { mobileNo: { $regex: search, $options: "i" } },
        ]
      };

      if (statsQuery.instituteId) {
        studentMatchQuery.instituteId = statsQuery.instituteId;
      }

      const matchingStudents = await Student.find(studentMatchQuery)
        .select('_id')
        .lean();

      const studentIds = matchingStudents.map((s: any) => s._id);

      statsQuery.$or = [
        { counsellorName: { $regex: search, $options: "i" } },
        { reason: { $regex: search, $options: "i" } },
        ...(studentIds.length > 0 ? [{ studentId: { $in: studentIds } }] : [])
      ];
    }

    // Get Counts
    const [pendingCount, approvedCount, rejectedCount, totalCount] =
      await Promise.all([
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "pending",
        }),
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "approved",
        }),
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "rejected",
        }),
        FeeConcession.countDocuments(statsQuery),
      ]);

    const stats = {
      total: totalCount,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };

    return res.status(200).json({
      success: true,
      data: {
        docs,
        stats,
        totalDocs: feeConcessions.totalDocs,
        limit: feeConcessions.limit,
        totalPages: feeConcessions.totalPages,
        page: feeConcessions.page,
        pagingCounter: feeConcessions.pagingCounter,
        hasPrevPage: feeConcessions.hasPrevPage,
        hasNextPage: feeConcessions.hasNextPage,
        prevPage: feeConcessions.prevPage,
        nextPage: feeConcessions.nextPage,
      },
    });
  } catch (err: any) {
    console.error("List Fee Concessions Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};
export const updateFeeConcessionStatus = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Fee concession ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required. Please provide 'approved' or 'rejected'",
      });
    }

    // Validate status value
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Only 'approved' or 'rejected' are allowed",
      });
    }

    // Check authorization
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Find the fee concession
    const feeConcession = await FeeConcession.findById(id);

    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found",
      });
    }



    // Permission Check - User should have permission to approve/reject
    if (req.user?.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: req.user?.instituteId,
        userId: req.user?.id,
      });

      const permission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Fee Concession Approval"
      );

      if (!permission?.edit) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to update fee concession status",
        });
      }
    }

    // Prepare update data based on status
    const updateData: any = {
      status: status,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    // Set appropriate fields based on status
    if (status === 'approved') {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
      // Clear rejection fields if any
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
    } else if (status === 'rejected') {
      updateData.rejectedBy = userId;
      updateData.rejectedAt = new Date();
      // Clear approval fields if any
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    // Update the fee concession
    const updatedFeeConcession = await FeeConcession.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )


    // Return success response
    const statusMessages = {
      approved: "Fee concession approved successfully",
      rejected: "Fee concession rejected successfully"
    };

    return res.status(200).json({
      success: true,
      message: statusMessages[status as keyof typeof statusMessages],
      data: updatedFeeConcession,
    });

  } catch (err: any) {
    console.error("Update Fee Concession Status Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};
/**
 * Get Single Fee Concession by ID
 */
export const getFeeConcession = async (
  req: Request,
  res: Response
) => {
  try {
    const feeConcession = await FeeConcession.findById(req.params.id)
      .populate("studentId")
      .populate("createdBy", "firstname lastname")
      .populate("approvedBy", "firstname lastname")
      .populate("rejectedBy", "firstname lastname")
      .populate("cancelledBy", "firstname lastname")
      .populate("updatedBy", "firstname lastname");

    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: feeConcession,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};


export const updateFeeConcession = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const feeConcession = await FeeConcession.findById(req.params.id);

    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found",
      });
    }

    // Check if already approved
    if (feeConcession.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot update an already approved fee concession",
      });
    }

    // Check if already rejected
    if (feeConcession.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Cannot update a rejected fee concession",
      });
    }

    const updatedFeeConcession = await FeeConcession.findByIdAndUpdate(
      req.params.id,
      {
        ...req.body,
        updatedBy: req.user?.id,
        updatedAt: new Date(),
      },
      {
        new: true,
        runValidators: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "Fee concession updated successfully",
      data: updatedFeeConcession,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * Delete Fee Concession (Hard Delete)
 */
export const deleteFeeConcession = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const feeConcession = await FeeConcession.findById(req.params.id);

    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found",
      });
    }

    // Check if already approved - prevent deletion
    if (feeConcession.status === "approved") {
      return res.status(400).json({
        success: false,
        message: "Cannot delete an approved fee concession",
      });
    }

    await FeeConcession.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: "Fee concession deleted successfully",
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * Get Fee Concession by Student ID
 */
export const getFeeConcessionByStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const studentId = req.params.studentId;

    const feeConcession = await FeeConcession.findOne({ studentId })
      .populate("studentId")
      .populate("createdBy", "firstname lastname")
      .populate("approvedBy", "firstname lastname")
      .populate("rejectedBy", "firstname lastname")
      .populate("cancelledBy", "firstname lastname")
      .populate("updatedBy", "firstname lastname");

    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found for this student",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      data: feeConcession,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

/**
 * Get Fee Concession Statistics
 */
