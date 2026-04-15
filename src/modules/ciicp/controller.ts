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
    const { page = 1, limit = 10, search, batch, district } = req.query;

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

      if (!modulePermission?.view) {
        return res.status(403).json({
          message: "No permission to view data",
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

    // 🎓 Batch filter
    if (batch && batch !== "all") {
      filter.batch = batch;
    }

    // 📍 District filter
    if (district && district !== "all") {
      filter.district = district;
    }

    const result = await (CIICP as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    // 📊 Simple stats
    const total = await CIICP.countDocuments(filter);

    res.json({
      ...result,
      statistics: {
        totalRegistrations: total,
      },
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   EXPORT (NO PAGINATION)
========================= */
export const exportCIICP = async (req: AuthRequest, res: Response) => {
  try {
    const { search, batch, district } = req.query;

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

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { fatherName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { aadhaar: { $regex: search, $options: "i" } },
        { registrationId: { $regex: search, $options: "i" } },
      ];
    }

    if (batch && batch !== "all") {
      filter.batch = batch;
    }

    if (district && district !== "all") {
      filter.district = district;
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