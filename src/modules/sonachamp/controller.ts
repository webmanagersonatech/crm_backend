import { Request, Response } from "express";
import SonaChamps from "./model";
import csv from "csv-parse";
import XLSX from "xlsx";
import crypto from "crypto";
import { sonaChampsSchema, attendanceSchema } from "./sonacamp.sanitize";
import { AuthRequest } from "../auth";
import Permission from "../permissions/model";
import axios from "axios";

/* =========================
   SMS HELPER
========================= */
export const sendChampsSMS = async (
  mobile: string,
  name: string,
  regId: string
) => {
  try {
    const formattedMobile = mobile.startsWith("91")
      ? mobile
      : "91" + mobile.replace(/\D/g, "");

    const message = `Hello ${name}, Your SONA CHAMPS '26 Registration ID is: ${regId}. Please bring this ID with you when coming to the event. It is required for entry.`;

    const url = "http://promo.smso2.com/api/sendhttp.php";

    const response = await axios.get(url, {
      params: {
        authkey: "35386c6c65676537353621",
        mobiles: formattedMobile,
        message,
        sender: "SONACT",
        route: "2",
        country: "91",
        DLT_TE_ID: "1107177634604023642",
      },
    });

    console.log("SMS Sent:", response.data);
  } catch (error: any) {
    console.error("SMS Error:", error.response?.data || error.message);
  }
};

/* =========================
   PERMISSION HELPER
========================= */
const checkPermission = async (
  user: any,
  action: "view" | "filter"
): Promise<{ allowed: boolean; message?: string }> => {
  if (!user) {
    return { allowed: false, message: "Unauthorized - user not found" };
  }

  if (user.role === "superadmin") {
    return { allowed: true };
  }

  const permissionDoc = await Permission.findOne({
    instituteId: user.instituteId,
    userId: user.id,
  });

  const champsPermission = permissionDoc?.permissions.find(
    (p: any) => p.moduleName === "Sona Champs"
  );

  if (action === "view" && !champsPermission?.view) {
    return {
      allowed: false,
      message: "You have no permission to view this data",
    };
  }

  if (action === "filter" && !champsPermission?.filter) {
    return {
      allowed: false,
      message: "You have no permission to export this data",
    };
  }

  return { allowed: true };
};

/* =========================
   FILTER BUILDER (shared)
========================= */
const buildFilter = (query: any): any => {
  const filter: any = {};
  const { search, event, category, gender, present, startDate, endDate } =
    query;

  if (search) {
    filter.$or = [
      { studentName: { $regex: search, $options: "i" } },
      { regId: { $regex: search, $options: "i" } },
      { teacherCoordinatorMobile: { $regex: search, $options: "i" } },
      { parentGuardianMobile: { $regex: search, $options: "i" } },
      { schoolName: { $regex: search, $options: "i" } },
    ];
  }

  if (event) {
    const values = (event as string).split(",");
    filter.event = values.length === 1 ? values[0] : { $in: values };
  }

  if (category && category !== "all") {
    filter.category = category;
  }

  if (gender && gender !== "all") {
    filter.gender = gender;
  }

  if (present === "true" || present === "false") {
    filter.present = present === "true";
  }

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

  return filter;
};

/* =========================
   CREATE REGISTRATION
========================= */
export const createSonaChamps = async (req: Request, res: Response) => {
  try {
    const { error, value } = sonaChampsSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    const champs = await SonaChamps.create(value);

    // Only send SMS if parentGuardianMobile is provided
    if (champs.parentGuardianMobile) {
      sendChampsSMS(champs.parentGuardianMobile, champs.studentName, champs.regId);
    }

    return res.status(201).json({
      status: "success",
      message: "Registration is successful",
      regId: champs.regId,
    });
  } catch (error: any) {
    return res.status(500).json({ message: error.message });
  }
};

/* =========================
   LIST (PAGINATION + FILTER + STATS)
========================= */
export const listSonaChamps = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    const perm = await checkPermission(req.user, "view");
    if (!perm.allowed) {
      return res
        .status(perm.message?.includes("Unauthorized") ? 401 : 403)
        .json({ message: perm.message });
    }

    const filter = buildFilter(req.query);

    const result = await (SonaChamps as any).paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
    });

    const stats = await SonaChamps.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalRegistrations: { $sum: 1 },
          totalPresent: {
            $sum: { $cond: [{ $eq: ["$present", true] }, 1, 0] },
          },
          totalAbsent: {
            $sum: { $cond: [{ $eq: ["$present", false] }, 1, 0] },
          },
        },
      },
    ]);

    const statistics = stats[0] || {
      totalRegistrations: 0,
      totalPresent: 0,
      totalAbsent: 0,
    };

    res.json({ ...result, statistics });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   EXPORT (NO PAGINATION)
========================= */
export const exportSonaChamps = async (req: AuthRequest, res: Response) => {
  try {
    const perm = await checkPermission(req.user, "filter");
    if (!perm.allowed) {
      return res
        .status(perm.message?.includes("Unauthorized") ? 401 : 403)
        .json({ message: perm.message });
    }

    const filter = buildFilter(req.query);
    const data = await SonaChamps.find(filter).sort({ createdAt: -1 });

    res.json({ total: data.length, data });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   GET SINGLE
========================= */
export const getSonaChamps = async (req: Request, res: Response) => {
  try {
    const champs = await SonaChamps.findById(req.params.id);
    if (!champs) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json(champs);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE (full)
========================= */
export const updateSonaChamps = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { error, value } = sonaChampsSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    delete (value as any).regId;

    const updated = await SonaChamps.findByIdAndUpdate(
      id,
      { $set: value },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Updated successfully", data: updated });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   UPDATE ATTENDANCE
========================= */
export const updateAttendance = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { error, value } = attendanceSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        message: "Validation failed",
        errors: error.details.map((e) => e.message),
      });
    }

    const update: any = { present: value.present };

    if (value.present) {
      update.presentAt = new Date();
      update.markedBy = value.markedBy || req.user?.id || "system";
    } else {
      update.presentAt = null;
      update.markedBy = value.markedBy || req.user?.id || "system";
    }

    const updated = await SonaChamps.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({
      message: "Attendance updated successfully",
      data: updated,
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   DELETE
========================= */
export const deleteSonaChamps = async (req: Request, res: Response) => {
  try {
    const deleted = await SonaChamps.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Not found" });
    }
    res.json({ message: "Deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================
   HELPERS
========================= */
const isValidPhone = (phone: string) => /^[6-9]\d{9}$/.test(phone);

const normalizeKey = (key: string) =>
  key.toLowerCase().replace(/[\s_\-]+/g, "");

const getValue = (row: any, aliases: string[]): any => {
  const normalized: Record<string, any> = {};
  Object.keys(row).forEach((k) => {
    normalized[normalizeKey(k)] = row[k];
  });
  for (const alias of aliases) {
    const key = normalizeKey(alias);
    if (
      normalized[key] !== undefined &&
      normalized[key] !== null &&
      String(normalized[key]).trim() !== ""
    ) {
      return normalized[key];
    }
  }
  return undefined;
};

const normalizeGender = (value: any): "Male" | "Female" | "Other" | null => {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (["male", "m", "boy"].includes(v)) return "Male";
  if (["female", "f", "girl"].includes(v)) return "Female";
  if (["other", "o", "others"].includes(v)) return "Other";
  return null;
};

const normalizeCategory = (
  value: any
): "Junior" | "Senior" | null => {
  if (!value) return null;
  const v = String(value).trim().toLowerCase();
  if (["junior", "jun"].includes(v)) return "Junior";
  if (["senior", "sen"].includes(v)) return "Senior";
  return null;
};

/* =========================
   BULK UPLOAD
========================= */
export const bulkUploadSonaChamps = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    const ext = file.originalname.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "xlsx" && ext !== "xls") {
      return res
        .status(400)
        .json({ message: "Only CSV, XLS, or XLSX files are allowed" });
    }

    let rawRows: any[] = [];

    if (ext === "csv") {
      const parser = csv.parse(file.buffer.toString("utf-8"), {
        columns: true,
        trim: true,
        skip_empty_lines: true,
        bom: true,
      });

      for await (const row of parser) {
        rawRows.push(row);
      }
    } else {
      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    }

    if (!rawRows.length) {
      return res.status(400).json({ message: "File is empty" });
    }

    const records: any[] = [];
    const rowErrors: any[] = [];

    rawRows.forEach((row, idx) => {
      const rowIndex = idx + 2; // header is row 1

      const studentName = getValue(row, ["studentname", "student", "name"]);
      const classVal = getValue(row, ["class", "grade", "standard"]);
      const genderRaw = getValue(row, ["gender", "sex"]);
      const schoolName = getValue(row, ["schoolname", "school"]);
      const schoolLocation = getValue(row, ["schoollocation", "location", "schoolloc"]);
      
      // ✅ OPTIONAL FIELDS
      const teacherCoordinatorName = getValue(row, ["teachercoordinatorname", "teachername", "teacher", "coordinator"]);
      const teacherCoordinatorMobile = getValue(row, ["teachercoordinatorMobile".toLowerCase(), "teachermobile", "teacherphone", "teachercontact"]);
      const parentGuardianName = getValue(row, ["parentguardianname", "parentname", "guardianname", "parent"]);

      // ✅ REQUIRED FIELDS
      const parentGuardianMobile = getValue(row, ["parentguardianMobile".toLowerCase(), "parentmobile", "parentphone", "guardianmobile"]);
      const categoryRaw = getValue(row, ["category", "studentcategory"]);
      const event = getValue(row, ["event", "eventname", "competition"]);

      const missing: string[] = [];
      if (!studentName) missing.push("studentName");
      if (!classVal) missing.push("class");
      if (!genderRaw) missing.push("gender");
      if (!schoolName) missing.push("schoolName");
      if (!schoolLocation) missing.push("schoolLocation");
      if (!parentGuardianMobile) missing.push("parentGuardianMobile");
      if (!categoryRaw) missing.push("category");
      if (!event) missing.push("event");

      if (missing.length) {
        rowErrors.push({
          row: rowIndex,
          message: `Missing required field(s): ${missing.join(", ")}`,
        });
        return;
      }

      const gender = normalizeGender(genderRaw);
      if (!gender) {
        rowErrors.push({
          row: rowIndex,
          message: `Invalid gender "${genderRaw}" (allowed: Male, Female, Other)`,
        });
        return;
      }

      const category = normalizeCategory(categoryRaw);
      if (!category) {
        rowErrors.push({
          row: rowIndex,
          message: `Invalid category "${categoryRaw}" (allowed: Junior, Senior)`,
        });
        return;
      }

      const pMobile = String(parentGuardianMobile).trim();
      const tMobile = teacherCoordinatorMobile ? String(teacherCoordinatorMobile).trim() : "";

      if (!isValidPhone(pMobile)) {
        rowErrors.push({
          row: rowIndex,
          message: `Invalid parentGuardianMobile "${pMobile}" (must be 10 digits starting 6-9)`,
        });
        return;
      }

      if (tMobile && !isValidPhone(tMobile)) {
        rowErrors.push({
          row: rowIndex,
          message: `Invalid teacherCoordinatorMobile "${tMobile}" (must be 10 digits starting 6-9)`,
        });
        return;
      }

      records.push({
        studentName: String(studentName).trim(),
        class: String(classVal).trim(),
        gender,
        schoolName: String(schoolName).trim(),
        schoolLocation: String(schoolLocation).trim(),
        teacherCoordinatorName: teacherCoordinatorName ? String(teacherCoordinatorName).trim() : "",
        teacherCoordinatorMobile: tMobile,
        parentGuardianName: parentGuardianName ? String(parentGuardianName).trim() : "",
        parentGuardianMobile: pMobile,
        category,
        event: String(event).trim(),
        present: false,
      });
    });

    if (rowErrors.length) {
      return res.status(400).json({
        message: "Sheet validation failed",
        totalRows: rawRows.length,
        validRows: records.length,
        rowErrors,
      });
    }

    const generateRegId = (): string =>
      `SNC-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;

    const existingRegIds = new Set(
      (await SonaChamps.find().select("regId").lean()).map((d) => d.regId)
    );

    records.forEach((r) => {
      let candidate: string;
      do {
        candidate = generateRegId();
      } while (existingRegIds.has(candidate));
      existingRegIds.add(candidate);
      r.regId = candidate;
    });

    const inserted = await SonaChamps.insertMany(records, {
      ordered: false, 
    });

    return res.status(201).json({
      status: "success",
      message: `Imported ${inserted.length} Sona Champs registrations successfully`,
      totalInserted: inserted.length,
    });
  } catch (error: any) {
    console.error("Bulk upload error:", error);
    return res
      .status(500)
      .json({ message: error.message || "Internal server error" });
  }
};