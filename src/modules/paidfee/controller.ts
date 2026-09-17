import { Request, Response } from "express";
import mongoose from "mongoose";
import PaidFee from "./model";
import Student from "../students/model";
import Settings from "../settings/model";

/* ─────────────────────────────────────────────
   Types
───────────────────────────────────────────── */

interface CleanedEntry {
  amount: number;
  description: string;
}

interface RawEntry {
  amount?: number | string;
  description?: string;
}

/* ─────────────────────────────────────────────
   Helpers
───────────────────────────────────────────── */

const cleanEntries = (entries: RawEntry[]): CleanedEntry[] => {
  return entries.map((e) => {
    const amt = Number(e.amount);
    if (isNaN(amt) || amt <= 0) {
      throw new Error("Each entry must have a valid amount greater than 0");
    }
    return {
      amount: amt,
      description: (e.description || "").trim(),
    };
  });
};

const sumEntries = (entries: CleanedEntry[]): number => {
  return entries.reduce<number>((sum, e) => sum + e.amount, 0);
};

/* ─────────────────────────────────────────────
   POST /paid-fees/:studentId
   Create or update paid-fee entry
───────────────────────────────────────────── */

export const addPaidFee = async (req: Request, res: Response) => {
  try {
    const { studentId } = req.params;
    const { year, entries, programId } = req.body;

    // ── Validate studentId ──────────────────────────────────────
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid student ID is required",
      });
    }

    // ── Validate year ───────────────────────────────────────────
    if (year === undefined || isNaN(Number(year))) {
      return res.status(400).json({
        success: false,
        message: "Valid year is required",
      });
    }

    // ── Validate entries ────────────────────────────────────────
    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one amount entry is required",
      });
    }

    const cleanedEntries: CleanedEntry[] = cleanEntries(entries);

    // ── Find student ────────────────────────────────────────────
    const student = await Student.findById(studentId).select(
      "studentId instituteId programId"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    const finalProgramId: string | undefined =
      programId || student.programId;

    if (!finalProgramId) {
      return res.status(400).json({
        success: false,
        message:
          "programId is required (pass in body or ensure student has programId)",
      });
    }

    const totalAmount: number = sumEntries(cleanedEntries);

    // ── Check existing record ───────────────────────────────────
    const existing = await PaidFee.findOne({
      studentId: student._id,
      programId: finalProgramId,
      year: Number(year),
    });

    const isUpdate: boolean = !!existing;

    // ── Upsert ──────────────────────────────────────────────────
    const paidFee = await PaidFee.findOneAndUpdate(
      {
        studentId: student._id,
        programId: finalProgramId,
        year: Number(year),
      },
      {
        $set: {
          studentId: student._id,
          studentCode: student.studentId,
          instituteId: student.instituteId,
          programId: finalProgramId,
          year: Number(year),
          entries: cleanedEntries,
          totalAmount,
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(isUpdate ? 200 : 201).json({
      success: true,
      message: isUpdate
        ? "Paid fee updated successfully"
        : "Paid fee added successfully",
      data: paidFee,
    });
  } catch (err: any) {
    console.error("Error adding/updating paid fee:", err);

    // ── Race condition fallback ─────────────────────────────────
    if (err.code === 11000) {
      try {
        const { studentId } = req.params;
        const { year, entries, programId } = req.body;

        const student = await Student.findById(studentId).select(
          "studentId instituteId programId"
        );

        if (!student) {
          return res.status(404).json({
            success: false,
            message: "Student not found",
          });
        }

        const finalProgramId: string | undefined =
          programId || student.programId;

        const cleanedEntries: CleanedEntry[] = cleanEntries(entries);
        const totalAmount: number = sumEntries(cleanedEntries);

        const updated = await PaidFee.findOneAndUpdate(
          {
            studentId: student._id,
            programId: finalProgramId,
            year: Number(year),
          },
          {
            $set: {
              entries: cleanedEntries,
              totalAmount,
            },
          },
          { new: true, runValidators: true }
        );

        return res.status(200).json({
          success: true,
          message: "Paid fee updated successfully",
          data: updated,
        });
      } catch (retryErr: any) {
        return res.status(500).json({
          success: false,
          message: retryErr.message || "Internal server error",
        });
      }
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   GET /paid-fees/:studentId
   List all paid fees for a student
───────────────────────────────────────────── */

export const getPaidFeesByStudent = async (
  req: Request,
  res: Response
) => {
  try {
    const { studentId } = req.params;
    const { year, programId } = req.query;

    // ── Validate studentId ──────────────────────────────────────
    if (!studentId || !mongoose.Types.ObjectId.isValid(studentId)) {
      return res.status(400).json({
        success: false,
        message: "Valid student ID is required",
      });
    }

    // ── Find student ────────────────────────────────────────────
    const student = await Student.findById(studentId).select(
      "studentId instituteId programId firstname lastname"
    );

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Student not found",
      });
    }

    // ── Settings (courseYears) ──────────────────────────────────
    const settingsDoc = await Settings.findOne({
      instituteId: student.instituteId,
    }).select("courseYears");

    const courseYears: number = settingsDoc?.courseYears ?? 1;

    // ── Build filter ────────────────────────────────────────────
    const filter: Record<string, any> = {
      studentId: student._id,
    };

    if (year !== undefined && year !== "") {
      filter.year = Number(year);
    }

    if (programId) {
      filter.programId = programId;
    }

    // ── Fetch paid fees ─────────────────────────────────────────
    const paidFees = await PaidFee.find(filter).sort({ year: 1 });

    const grandTotal: number = paidFees.reduce<number>(
      (sum, p) => sum + (p.totalAmount || 0),
      0
    );

    // ── Year options for dropdown ───────────────────────────────
    const yearOptions = Array.from(
      { length: Math.max(courseYears, 1) },
      (_, i) => {
        const value = i + 1;
        const suffix =
          value === 1 ? "st" :
            value === 2 ? "nd" :
              value === 3 ? "rd" : "th";
        return {
          value,
          label: `${value}${suffix} Year`,
          hasEntry: paidFees.some((p) => Number(p.year) === value),
        };
      }
    );

    return res.status(200).json({
      success: true,
      data: {
        paidFees,
        grandTotal,
        courseYears,
        yearOptions,
        student: {
          _id: student._id,
          studentId: student.studentId,
          firstname: student.firstname,
          lastname: student.lastname,
          programId: student.programId,
          instituteId: student.instituteId,
        },
      },
    });
  } catch (err: any) {
    console.error("Error getting paid fees:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   PUT /paid-fees/:id
   Update a single paid-fee doc
───────────────────────────────────────────── */

export const updatePaidFee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { entries, year } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paid fee ID",
      });
    }

    if (!Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: "At least one entry is required",
      });
    }

    const cleanedEntries: CleanedEntry[] = cleanEntries(entries);
    const totalAmount: number = sumEntries(cleanedEntries);

    const updated = await PaidFee.findByIdAndUpdate(
      id,
      {
        $set: {
          entries: cleanedEntries,
          totalAmount,
          ...(year !== undefined && { year: Number(year) }),
        },
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: "Paid fee record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Paid fee updated successfully",
      data: updated,
    });
  } catch (err: any) {
    console.error("Error updating paid fee:", err);

    if (err.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Another paid fee already exists for this year",
      });
    }

    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};

/* ─────────────────────────────────────────────
   DELETE /paid-fees/:id
   Delete a paid-fee doc
───────────────────────────────────────────── */

export const deletePaidFee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid paid fee ID",
      });
    }

    const deleted = await PaidFee.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: "Paid fee record not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Paid fee deleted successfully",
    });
  } catch (err: any) {
    console.error("Error deleting paid fee:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal server error",
    });
  }
};