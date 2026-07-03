import { Request, Response } from "express";
import FeeConcession from "./model";
import Student from "../students/model";
import { AuthRequest } from "../../middlewares/auth";
import { createFeeConcessionSchema } from "./feesconcession.sanitize";
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
  req: Request,
  res: Response
) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "all";

    const query: any = {};

    if (search.trim()) {
      query.$or = [
        { counsellorName: { $regex: search, $options: "i" } },
        { reason: { $regex: search, $options: "i" } },
      ];
    }

    if (status !== "all") {
      query.status = status;
    }

    const feeConcessions = await (FeeConcession as any).paginate(query, {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        {
          path: "studentId",
          select: "firstname lastname studentId email mobileNo",
        },
        {
          path: "createdBy",
          select: "firstname lastname",
        },
        {
          path: "approvedBy",
          select: "firstname lastname",
        },
        {
          path: "rejectedBy",
          select: "firstname lastname",
        },
        {
          path: "cancelledBy",
          select: "firstname lastname",
        },
        {
          path: "updatedBy",
          select: "firstname lastname",
        },
      ],
    });

    return res.status(200).json({
      success: true,
      data: feeConcessions,
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

/**
 * Approve Fee Concession
 */
export const approveFeeConcession = async (
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
        message: "Fee concession is already approved",
      });
    }

    // Check if already rejected
    if (feeConcession.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Cannot approve a rejected fee concession",
      });
    }

    feeConcession.status = "approved";
    feeConcession.approvedBy = req.user?.id;
    feeConcession.approvedAt = new Date();

    await feeConcession.save();

    return res.status(200).json({
      success: true,
      message: "Fee concession approved successfully",
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
 * Reject Fee Concession
 */
export const rejectFeeConcession = async (
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
        message: "Cannot reject an already approved fee concession",
      });
    }

    // Check if already rejected
    if (feeConcession.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Fee concession is already rejected",
      });
    }

    feeConcession.status = "rejected";
    feeConcession.rejectedBy = req.user?.id;
    feeConcession.rejectedAt = new Date();

    await feeConcession.save();

    return res.status(200).json({
      success: true,
      message: "Fee concession rejected successfully",
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
 * Cancel Fee Concession
 */
export const cancelFeeConcession = async (
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
        message: "Cannot cancel an already approved fee concession",
      });
    }

    // Check if already rejected
    if (feeConcession.status === "rejected") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel a rejected fee concession",
      });
    }

    // Check if already cancelled
    if (feeConcession.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Fee concession is already cancelled",
      });
    }

    feeConcession.status = "cancelled";
    feeConcession.cancelledBy = req.user?.id;
    feeConcession.cancelledAt = new Date();

    await feeConcession.save();

    return res.status(200).json({
      success: true,
      message: "Fee concession cancelled successfully",
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
 * Update Fee Concession (Manual Update)
 */
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
export const getFeeConcessionStats = async (
  req: Request,
  res: Response
) => {
  try {
    const stats = await FeeConcession.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await FeeConcession.countDocuments();

    return res.status(200).json({
      success: true,
      data: {
        total,
        stats,
      },
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};