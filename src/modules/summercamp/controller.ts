import { Request, Response } from "express";
import SummerCamp from "./model";
import { summerCampSchema } from "./summercamp.sanitize";

/* =========================
   CREATE REGISTRATION
========================= */
export const createSummerCamp = async (req: Request, res: Response) => {
  try {
    const { error, value } = summerCampSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    // Optional: prevent duplicate regno
    const existing = await SummerCamp.findOne({ regno: value.regno });
    if (existing) {
      return res.status(400).json({
        message: "Registration number already exists",
      });
    }

    const existingMobile = await SummerCamp.findOne({
      mobile_no: value.mobile_no,
    });

    if (existingMobile) {
      return res.status(400).json({
        message: "Mobile number already registered",
      });
    }

    const camp = await SummerCamp.create(value);

    res.status(201).json({
      message: "Registration successful",
      data: camp,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   LIST (PAGINATION + FILTER)
========================= */
export const listSummerCamps = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      name,
      regno,
      mobile_no,
      sport,
      startDate,
      endDate,
    } = req.query;

    let filter: any = {};

    if (name) {
      filter.name = { $regex: name, $options: "i" };
    }

    if (regno) {
      filter.regno = { $regex: regno, $options: "i" };
    }

    if (mobile_no) {
      filter.mobile_no = { $regex: mobile_no, $options: "i" };
    }

    if (sport) {
      filter["sportsData.sport_name"] = sport;
    }

    // Date filter
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

    const result = await (SummerCamp as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   GET SINGLE
========================= */
export const getSummerCamp = async (req: Request, res: Response) => {
  try {
    const camp = await SummerCamp.findById(req.params.id);

    if (!camp) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(camp);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE
========================= */
export const updateSummerCamp = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { error, value } = summerCampSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    const updated = await SummerCamp.findByIdAndUpdate(
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
export const deleteSummerCamp = async (req: Request, res: Response) => {
  try {
    const deleted = await SummerCamp.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};