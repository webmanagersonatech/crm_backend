import { Request, Response } from "express";
import csv from "csv-parse";
import XLSX from "xlsx";
import Event from "./model";
import { AuthRequest } from "../../middlewares/auth";

/* =========================
   CREATE SINGLE EVENT
========================= */
export const createEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { name, mobile, email, location, eventName, enrolledDate, instituteId } = req.body;
    const createdBy = req.user!.id;
    const instId = instituteId || req.user!.instituteId;

    if (!name || !mobile || !eventName) {
      return res.status(400).json({
        message: "Name, Mobile, and Event Name are required",
      });
    }

    const existing = await Event.findOne({
      mobile,
      instituteId: instId,
      eventName,
    });

    if (existing) {
      return res.status(400).json({
        message: "Event registration with this mobile already exists",
      });
    }

    const event = await Event.create({
      name,
      mobile,
      email,
      location,
      eventName,
      enrolledDate: enrolledDate ? new Date(enrolledDate) : undefined,
      instituteId: instId,
      createdBy,
    });

    res.json(event);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   IMPORT CSV / XLSX
========================= */
export const importEvents = async (req: AuthRequest, res: Response) => {
  try {
    /* =========================
       BASIC VALIDATION
    ========================= */
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    const createdBy = req.user!.id;
    const instituteId = req.body.instituteId || req.user!.instituteId;

    /* =========================
       HELPERS
    ========================= */
    const isValidMobile = (m: string) => /^\d{10,}$/.test(m);
    const isValidEmail = (e: string) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);

    const parseValidDate = (value: any): string | null => {
      if (!value) return null;

      let match = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      if (match) {
        const [, d, m, y] = match;
        const date = new Date(`${y}-${m}-${d}`);
        if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
      }

      match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match && !isNaN(new Date(value).getTime())) return value;

      return null;
    };

    /* =========================
       STATE
    ========================= */
    const records: any[] = [];
    const sheetErrors: any[] = [];
    const duplicatesInSheet: any[] = [];
    const mobileMap = new Map<string, number[]>();

    const ext = file.originalname.split(".").pop()?.toLowerCase();

    /* =========================
       ROW PROCESSOR
    ========================= */
    const processRow = (row: any, rowIndex: number) => {
      const name = row.Name || row.name;
      const mobile = String(row.Mobile || row.mobile || "").trim();
      const email = row.Email || row.email;
      const location = row.Location || row.location;
      const eventName = row["Event Name"] || row.eventName;
      const rawDate = row["Enrolled Date"] || row.enrolledDate;

      if (!name || !mobile || !email || !location || !eventName) {
        sheetErrors.push({
          row: rowIndex,
          message: "Missing Name, Mobile, Email, Location or Event Name",
        });
        return;
      }

      if (!isValidMobile(mobile)) {
        sheetErrors.push({
          row: rowIndex,
          message: "Invalid mobile number",
        });
        return;
      }

      if (!isValidEmail(email)) {
        sheetErrors.push({
          row: rowIndex,
          message: "Invalid email address",
        });
        return;
      }

      const enrolledDate = rawDate ? parseValidDate(rawDate) : null;
      if (rawDate && !enrolledDate) {
        sheetErrors.push({
          row: rowIndex,
          message: "Invalid Enrolled Date format (DD-MM-YYYY or YYYY-MM-DD)",
        });
        return;
      }

      // Track duplicates inside sheet
      if (!mobileMap.has(mobile)) mobileMap.set(mobile, []);
      mobileMap.get(mobile)!.push(rowIndex);

      records.push({
        name,
        mobile,
        email,
        location,
        eventName,
        enrolledDate,
        instituteId,
        createdBy,
        rowIndex,
      });
    };

    /* =========================
       FILE PARSING
    ========================= */
    if (ext === "csv") {
      const parser = csv.parse(file.buffer.toString("utf-8"), {
        columns: true,
        trim: true,
        skip_empty_lines: true,
      });

      let rowIndex = 2;
      for await (const row of parser) {
        processRow(row, rowIndex++);
      }
    } else if (ext === "xlsx") {
      const workbook = XLSX.read(file.buffer, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      data.forEach((row: any, index: number) => {
        processRow(row, index + 2);
      });
    } else {
      return res.status(400).json({
        message: "Only CSV or XLSX files are allowed",
      });
    }

    /* =========================
       SHEET DUPLICATES
    ========================= */
    mobileMap.forEach((rows, mobile) => {
      if (rows.length > 1) {
        duplicatesInSheet.push({
          mobile,
          rows,
          message: `Duplicate mobile found in rows ${rows.join(", ")}`,
          suggestion: "Keep only one row with this mobile number",
        });
      }
    });

    if (sheetErrors.length || duplicatesInSheet.length) {
      return res.status(400).json({
        message: "Sheet validation failed",
        sheetErrors,
        duplicatesInSheet,
      });
    }

    /* =========================
       DATABASE DUPLICATES (PHONE + EMAIL)
    ========================= */
    const mobiles = records.map(r => r.mobile);
    const emails = records.map(r => r.email);

    const existing = await Event.find({
      instituteId,
      $or: [
        { mobile: { $in: mobiles } },
        { email: { $in: emails } },
      ],
    }).select("mobile email").lean();

    if (existing.length) {
      const duplicatesInDB: any[] = [];

      records.forEach(r => {
        const conflict = existing.find(
          e => e.mobile === r.mobile || e.email === r.email
        );

        if (conflict) {
          duplicatesInDB.push({
            row: r.rowIndex,
            phone: r.mobile,
            email: r.email,
            message: `${conflict.mobile === r.mobile ? "Phone" : ""
              }${conflict.mobile === r.mobile && conflict.email === r.email
                ? " & "
                : ""
              }${conflict.email === r.email ? "Email" : ""
              } already exists in database`,
            suggestion:
              "Remove this row from the file or update the existing record instead of importing again.",
          });
        }
      });

      return res.status(400).json({
        message: "Duplicate records found in database",
        duplicatesInDB,
      });
    }

    /* =========================
       EVENT ID GENERATION
    ========================= */
    const allEvents = await Event.find({ instituteId })
      .select("eventId")
      .lean();

    let maxNum = 0;
    allEvents.forEach(e => {
      const match = e.eventId?.match(/-eve-(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });

    let nextNumber = maxNum + 1;

    records.forEach(r => {
      r.eventId = `${instituteId}-eve-${nextNumber++}`;
      delete r.rowIndex;
    });

    /* =========================
       INSERT
    ========================= */
    const inserted = await Event.insertMany(records);

    return res.json({
      message: `Imported ${inserted.length} events successfully`,
    });

  } catch (err: any) {
    console.error("IMPORT EVENTS ERROR:", err);
    return res.status(500).json({
      message: err.message || "Internal server error",
    });
  }
};


/* =========================
   LIST EVENTS
========================= */
export const listEvents = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, name, mobile, startDate, endDate, eventName } = req.query;

    const user = req.user!;
    let filter: any = {};

    if (user.role === 'superadmin') {
      if (req.query.instituteId) filter.instituteId = req.query.instituteId;
    } else {
      filter.instituteId = user.instituteId;
    }

    if (name) filter.name = { $regex: name, $options: "i" };
    if (mobile) filter.mobile = { $regex: mobile, $options: "i" };
    if (eventName) filter.eventName = { $regex: eventName, $options: "i" };
    if (startDate || endDate) {
      filter.enrolledDate = {
        ...(startDate ? { $gte: startDate } : {}),
        ...(endDate ? { $lte: endDate } : {}),
      };
    }

    const result = await Event.paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [{ path: "creator", select: "firstname lastname" }, { path: "institute", select: "name" }],
    });

    res.json(result);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================
   GET / UPDATE / DELETE
========================= */
export const getEvent = async (req: Request, res: Response) => {
  const event = await Event.findById(req.params.id).populate(
    "creator",
    "firstname lastname"
  );
  if (!event) return res.status(404).json({ message: "Event not found" });
  res.json(event);
};

export const updateEvent = async (req: AuthRequest, res: Response) => {
  try {
    const { email, mobile } = req.body;
    const eventId = req.params.id;

    // 1️⃣ Get current event
    const currentEvent = await Event.findById(eventId);
    if (!currentEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    // 2️⃣ Check duplicate EMAIL in same institute
    if (email) {
      const emailExists = await Event.findOne({
        _id: { $ne: eventId },                 // ❗ exclude current record
        instituteId: currentEvent.instituteId,
        email,
      });

      if (emailExists) {
        return res
          .status(400)
          .json({ message: "Email already exists " });
      }
    }

    // 3️⃣ Check duplicate MOBILE in same institute
    if (mobile) {
      const mobileExists = await Event.findOne({
        _id: { $ne: eventId },                 // ❗ exclude current record
        instituteId: currentEvent.instituteId,
        mobile,
      });

      if (mobileExists) {
        return res
          .status(400)
          .json({ message: "Mobile already exists" });
      }
    }

    // 4️⃣ Update
    const updated = await Event.findByIdAndUpdate(
      eventId,
      req.body,
      { new: true, runValidators: true }
    );

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Failed to update event" });
  }
};


export const deleteEvent = async (req: AuthRequest, res: Response) => {
  const deleted = await Event.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: "Event not found" });
  res.json({ message: "Deleted successfully" });
};
