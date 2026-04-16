import { Request, Response } from "express";
import CIICP from "./model";
import { ciicpSchema } from "./ciicp.sanitize";
import { AuthRequest } from "../auth";
import Permission from "../permissions/model";

/* =========================
   CREATE REGISTRATION
========================= */
export const createCIICP = async (req: Request, res: Response) => {
  try {
    const { error, value } = ciicpSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    // 🔒 Optional duplicate check
    const existingPhone = await CIICP.findOne({ phone: value.phone });
    if (existingPhone) {
      return res.status(400).json({
        message: "Phone already registered",
      });
    }

    const existingAadhaar = await CIICP.findOne({ aadhaar: value.aadhaar });
    if (existingAadhaar) {
      return res.status(400).json({
        message: "Aadhaar already registered",
      });
    }

    const data = await CIICP.create(value);

    res.status(201).json({
      status: "success",
      message: "Registration successful",
      registrationId: data.registrationId,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   LIST (PAGINATION + SEARCH)
========================= */
export const listCIICP = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      batch,
      district,
      startDate,
      endDate,
      course,
      paymentStatus,
      gender,
    } = req.query;

    const user = req.user;

    // 🔐 Auth check
    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    // 🔐 Permission check
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const modulePermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "CIICP"
      );

      if (!modulePermission?.view) {
        return res.status(403).json({
          message: "No permission to view data",
        });
      }
    }

    // 🧠 Build filter
    let filter: any = {};

    // 🔍 Search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { aadhaar: { $regex: search, $options: "i" } },
        { registrationId: { $regex: search, $options: "i" } },
      ];
    }

    // 📅 Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    // 🎓 Batch filter
    if (batch && batch !== "all") {
      filter.batch = batch;
    }

    // 📍 District filter
    if (district && district !== "all") {
      filter.district = district;
    }

    // 💰 Payment Status filter
    if (paymentStatus && paymentStatus !== "all") {
      filter.paymentStatus = paymentStatus;
    }

    // 👤 Gender filter
    if (gender && gender !== "all") {
      filter.gender = gender;
    }

    // 📘 Course filter (OR logic - matches if student has ANY of the selected courses)
    if (course && course !== "all") {
      let courseArray: string[] = [];

      if (typeof course === 'string') {
        courseArray = course.split(',');
      } else if (Array.isArray(course)) {
        courseArray = course.map(c => String(c));
      } else if (course) {
        courseArray = [String(course)];
      }

      if (courseArray.length > 0) {
        filter.courses = { $in: courseArray }; // OR logic
      }
    }

    // 📄 Pagination
    const result = await (CIICP as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    // 📊 Courses grouping (based on filtered data)
    const courseStats = await CIICP.aggregate([
      { $match: filter },
      { $unwind: "$courses" },
      {
        $group: {
          _id: "$courses",
          count: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          course: "$_id",
          count: 1,
        },
      },
      { $sort: { count: -1 } },
    ]);

    // 📍 Get distinct districts for filter dropdown (from ALL records)
    const distinctDistricts = await CIICP.distinct("district");
    const validDistricts = distinctDistricts.filter(d => d && d !== "");

    // 📚 Get distinct courses for filter dropdown (from ALL records)
    const distinctCourses = await CIICP.distinct("courses");
    const flattenedCourses = [...new Set(distinctCourses.flat())];
    const validCourses = flattenedCourses.filter(c => c && c !== "");

    // ✅ Final response
    res.json({
      ...result,
      courses: courseStats,
      courseOptions: validCourses,
      districtOptions: validDistricts,
    });
  } catch (error: any) {
    res.status(500).json({
      message: error.message,
    });
  }
};
export const exportCIICP = async (req: AuthRequest, res: Response) => {
  try {
    const {
      search,
      batch,
      district,
      startDate,
      endDate,
      course,
      paymentStatus,
      gender,
    } = req.query;

    const user = req.user;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized",
      });
    }

    // 🔐 Permission check
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const modulePermission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "CIICP"
      );

      if (!modulePermission?.filter) {
        return res.status(403).json({
          message: "No permission to export data",
        });
      }
    }

    let filter: any = {};

    // 🔍 Search
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { aadhaar: { $regex: search, $options: "i" } },
        { registrationId: { $regex: search, $options: "i" } },
      ];
    }

    // 📅 Date filter
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    // 🎓 Batch filter
    if (batch && batch !== "all") {
      filter.batch = batch;
    }

    // 📍 District filter
    if (district && district !== "all") {
      filter.district = district;
    }

    // 💰 Payment Status filter
    if (paymentStatus && paymentStatus !== "all") {
      filter.paymentStatus = paymentStatus;
    }

    // 👤 Gender filter
    if (gender && gender !== "all") {
      filter.gender = gender;
    }

    // 📘 Course filter (OR logic - matches if student has ANY of the selected courses)
    if (course && course !== "all") {
      let courseArray: string[] = [];

      if (typeof course === 'string') {
        courseArray = course.split(',');
      } else if (Array.isArray(course)) {
        courseArray = course.map(c => String(c));
      } else if (course) {
        courseArray = [String(course)];
      }

      if (courseArray.length > 0) {
        filter.courses = { $in: courseArray }; // OR logic
      }
    }

    const data = await CIICP.find(filter).sort({ createdAt: -1 });

    res.json({
      total: data.length,
      data,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updatePaymentStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const updatedData = await CIICP.findByIdAndUpdate(
      id,
      { paymentStatus: "paid" },
      { new: true } // return updated document
    );

    if (!updatedData) {
      return res.status(404).json({
        message: "Record not found",
      });
    }

    res.json({
      message: "Payment updated successfully",
      data: updatedData,
    });
  } catch (err: any) {
    res.status(500).json({
      message: err.message,
    });
  }
};
/* =========================
   EXPORT (NO PAGINATION)
========================= */


/* =========================
   GET SINGLE
========================= */
export const getCIICP = async (req: Request, res: Response) => {
  try {
    const data = await CIICP.findById(req.params.id);

    if (!data) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(data);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE
========================= */
export const updateCIICP = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error, value } = ciicpSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    const updated = await CIICP.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({
      message: "Updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   DELETE
========================= */
export const deleteCIICP = async (req: Request, res: Response) => {
  try {
    const deleted = await CIICP.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};