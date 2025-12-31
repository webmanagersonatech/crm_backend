import { Request, Response } from 'express';
import csv from 'csv-parse';
import Other from './model';
import User from '../auth/auth.model';
import { AuthRequest } from '../../middlewares/auth';
import XLSX from 'xlsx';


// 🔹 Create single record
export const createOther = async (req: AuthRequest, res: Response) => {
  try {
    const { name, phone, date, dataSource, instituteId, description } = req.body;
    const createdBy = req.user?.id;

    if (!name || !phone || !dataSource) {
      return res.status(400).json({ message: 'Name, Phone and DataSource are required' });
    }

    const instId = instituteId || req.user?.instituteId;

    const existing = await Other.findOne({ phone, instituteId: instId });
    if (existing) {
      return res.status(400).json({ message: 'Record with this phone already exists' });
    }

    const other = await Other.create({
      name,
      phone,
      date: date ? new Date(date) : undefined,
      dataSource,
      instituteId: instId,
      description,
      createdBy
    });

    res.json(other);

  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// 🔹 Import CSV (memoryStorage)
// export const importOthers = async (req: AuthRequest, res: Response) => {
//   try {
//     const file = req.file;
//     if (!file) {
//       return res.status(400).json({ message: "File is required" });
//     }

//     const createdBy = req.user!.id;
//     const instituteId = req.body.instituteId || req.user!.instituteId;
//     const dataSource = req.body.dataSource || "import";

//     const records: any[] = [];
//     const sheetErrors: any[] = [];
//     const duplicatesInSheet: any[] = [];

//     const phoneMap = new Map<string, number[]>();
//     const ext = file.originalname.split(".").pop()?.toLowerCase();

//     const RESERVED_KEYS = [
//       "name",
//       "Name",
//       "phone",
//       "Phone",
//       "date",
//       "Date",
//     ];

//     /* =========================
//        STEP 1: READ FILE
//        ========================= */

//     const processRow = (row: any, rowIndex: number) => {
//       const name = row.Name || row.name;
//       const phone = row.Phone || row.phone;
//       const date = row.Date || row.date;

//       if (!name || !phone) {
//         sheetErrors.push({
//           row: rowIndex,
//           message: "Missing name or phone",
//         });
//         return;
//       }

//       if (!phoneMap.has(phone)) phoneMap.set(phone, []);
//       phoneMap.get(phone)!.push(rowIndex);

//       // 🔥 collect dynamic fields
//       const extraFields: any = { ...row };
//       RESERVED_KEYS.forEach(k => delete extraFields[k]);

//       records.push({
//         name,
//         phone,
//         date: date?.toString(),
//         extraFields,
//         dataSource,
//         instituteId,
//         createdBy,
//         rowIndex,
//       });
//     };

//     /* =========================
//        CSV
//        ========================= */

//     if (ext === "csv") {
//       const parser = csv.parse(file.buffer.toString("utf-8"), {
//         columns: true,
//         trim: true,
//         skip_empty_lines: true,
//       });

//       let rowIndex = 2;
//       for await (const row of parser) {
//         processRow(row, rowIndex);
//         rowIndex++;
//       }
//     }

//     /* =========================
//        XLSX
//        ========================= */

//     else if (ext === "xlsx") {
//       const workbook = XLSX.read(file.buffer, { type: "buffer" });
//       const sheet = workbook.Sheets[workbook.SheetNames[0]];
//       const data = XLSX.utils.sheet_to_json(sheet, { defval: "" });

//       data.forEach((row: any, index: number) => {
//         processRow(row, index + 2);
//       });
//     } else {
//       return res.status(400).json({
//         message: "Only CSV or XLSX files are allowed",
//       });
//     }

//     /* =========================
//        STEP 2: DUPLICATES IN SHEET
//        ========================= */

//     phoneMap.forEach((rows, phone) => {
//       if (rows.length > 1) {
//         duplicatesInSheet.push({
//           phone,
//           rows,
//           message: `Duplicate phone found at rows ${rows.join(", ")}`,
//         });
//       }
//     });

//     if (sheetErrors.length || duplicatesInSheet.length) {
//       return res.status(400).json({
//         message: "Sheet validation failed",
//         missingFields: sheetErrors,
//         duplicatesInSheet,
//       });
//     }

//     /* =========================
//        STEP 3: DUPLICATES IN DB
//        ========================= */

//     const phones = records.map(r => r.phone);
//     const existing = await Other.find({
//       instituteId,
//       phone: { $in: phones },
//     }).lean();

//     if (existing.length) {
//       const duplicatesInDB = existing.map(dbRec => {
//         const rows = records
//           .filter(r => r.phone === dbRec.phone)
//           .map(r => r.rowIndex);

//         return {
//           phone: dbRec.phone,
//           rows,
//           message: `Phone already exists in DB at rows ${rows.join(", ")}`,
//         };
//       });

//       return res.status(400).json({
//         message: "Duplicate records found in database",
//         duplicatesInDB,
//       });
//     }

//     /* =========================
//        STEP 4: ASSIGN recordId
//        ========================= */

//     // Fetch all recordIds for this institute and find max numeric suffix
//     const allRecords = await Other.find({ instituteId }).select('recordId').lean();
//     let maxNum = 0;
//     allRecords.forEach(r => {
//       const match = r.recordId.match(/-rec-(\d+)$/);
//       if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
//     });
//     let nextNumber = maxNum + 1;


//     records.forEach(rec => {
//       rec.recordId = `${instituteId}-rec-${nextNumber++}`;
//       delete rec.rowIndex;
//     });


//     /* =========================
//        STEP 5: INSERT
//        ========================= */

//     const inserted = await Other.insertMany(records);

//     return res.json({
//       message: `Imported ${inserted.length} records successfully`,
//     });
//   } catch (error: any) {
//     console.error(error);
//     return res.status(500).json({
//       message: error.message || "Internal server error",
//     });
//   }
// };
export const importOthers = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ message: "File is required" });
    }

    const createdBy = req.user!.id;
    const instituteId = req.body.instituteId || req.user!.instituteId;
    const dataSource = req.body.dataSource || "import";

    const records: any[] = [];
    const sheetErrors: any[] = [];
    const duplicatesInSheet: any[] = [];

    const phoneMap = new Map<string, number[]>();
    const ext = file.originalname.split(".").pop()?.toLowerCase();

    const RESERVED_KEYS = [
      "name",
      "Name",
      "phone",
      "Phone",
      "date",
      "Date",
    ];

    /* =========================
       HELPERS (ADDED)
       ========================= */

    const isValidPhone = (phone: string) => {
      return /^\d{10,}$/.test(phone);
    };

    const parseValidDate = (value: any): string | null => {
      if (!value) return null;

      let match = value.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
      if (match) {
        const [_, d, m, y] = match;
        const date = new Date(`${y}-${m}-${d}`);
        if (!isNaN(date.getTime())) return `${y}-${m}-${d}`;
      }

      match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (match) {
        const date = new Date(value);
        if (!isNaN(date.getTime())) return value;
      }

      return null;
    };

    /* =========================
       STEP 1: READ FILE
       ========================= */

    const processRow = (row: any, rowIndex: number) => {
      const name = row.Name || row.name;
      const phone = String(row.Phone || row.phone || "").trim();
      const rawDate = row.Date || row.date;

      if (!name || !phone) {
        sheetErrors.push({
          row: rowIndex,
          message: "Missing name or phone",
        });
        return;
      }

      // ✅ phone validation (ADDED)
      if (!isValidPhone(phone)) {
        sheetErrors.push({
          row: rowIndex,
          message: "Invalid phone number (minimum 10 digits required)",
        });
        return;
      }

      // ✅ date validation (ADDED)
      const parsedDate = rawDate ? parseValidDate(String(rawDate)) : null;
      if (rawDate && !parsedDate) {
        sheetErrors.push({
          row: rowIndex,
          message: "Invalid date format (use DD-MM-YYYY or YYYY-MM-DD)",
        });
        return;
      }

      if (!phoneMap.has(phone)) phoneMap.set(phone, []);
      phoneMap.get(phone)!.push(rowIndex);

      // 🔥 collect dynamic fields
      const extraFields: any = { ...row };
      RESERVED_KEYS.forEach(k => delete extraFields[k]);

      records.push({
        name,
        phone,
        date: parsedDate,
        extraFields,
        dataSource,
        instituteId,
        createdBy,
        rowIndex,
      });
    };

    /* =========================
       CSV
       ========================= */

    if (ext === "csv") {
      const parser = csv.parse(file.buffer.toString("utf-8"), {
        columns: true,
        trim: true,
        skip_empty_lines: true,
      });

      let rowIndex = 2;
      for await (const row of parser) {
        processRow(row, rowIndex);
        rowIndex++;
      }
    }

    /* =========================
       XLSX
       ========================= */

    else if (ext === "xlsx") {
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
       STEP 2: DUPLICATES IN SHEET
       ========================= */

    phoneMap.forEach((rows, phone) => {
      if (rows.length > 1) {
        duplicatesInSheet.push({
          phone,
          rows,
          message: `Duplicate phone found at rows ${rows.join(", ")}`,
        });
      }
    });

    if (sheetErrors.length || duplicatesInSheet.length) {
      return res.status(400).json({
        message: "Sheet validation failed",
        missingFields: sheetErrors,
        duplicatesInSheet,
      });
    }

    /* =========================
       STEP 3: DUPLICATES IN DB
       ========================= */

    const phones = records.map(r => r.phone);
    const existing = await Other.find({
      instituteId,
      phone: { $in: phones },
    }).lean();

    if (existing.length) {
      const duplicatesInDB = existing.map(dbRec => {
        const rows = records
          .filter(r => r.phone === dbRec.phone)
          .map(r => r.rowIndex);

        return {
          phone: dbRec.phone,
          rows,
          message: `Phone already exists in DB at rows ${rows.join(", ")}`,
        };
      });

      return res.status(400).json({
        message: "Duplicate records found in database",
        duplicatesInDB,
      });
    }

    /* =========================
       STEP 4: ASSIGN recordId
       ========================= */

    const allRecords = await Other.find({ instituteId })
      .select("recordId")
      .lean();

    let maxNum = 0;
    allRecords.forEach(r => {
      const match = r.recordId.match(/-rec-(\d+)$/);
      if (match) maxNum = Math.max(maxNum, parseInt(match[1], 10));
    });

    let nextNumber = maxNum + 1;

    records.forEach(rec => {
      rec.recordId = `${instituteId}-rec-${nextNumber++}`;
      delete rec.rowIndex;
    });

    /* =========================
       STEP 5: INSERT
       ========================= */

    const inserted = await Other.insertMany(records);

    return res.json({
      message: `Imported ${inserted.length} records successfully`,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(500).json({
      message: error.message || "Internal server error",
    });
  }
};



// 🔹 List with pagination & filters
export const listOthers = async (req: AuthRequest, res: Response) => {
  try {
    const { page = 1, limit = 10, name, phone, startDate, endDate, dataSource } = req.query;
    const user = req.user;

    let filter: any = {};

    if (user.role === 'superadmin') {
      if (req.query.instituteId) filter.instituteId = req.query.instituteId;
    } else {
      filter.instituteId = user.instituteId;
    }

    if (name) filter.name = { $regex: name, $options: 'i' };
    if (phone) filter.phone = { $regex: phone, $options: 'i' };
    if (dataSource) filter.dataSource = dataSource;

  if (startDate || endDate) {
      const dateFilter: any = {};
      if (startDate) dateFilter.$gte = startDate;
      if (endDate) dateFilter.$lte = endDate;
      filter.date = dateFilter;
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [

        { path: 'creator', select: 'firstname lastname' },
        { path: "institute", select: "name" }
      ]
    };

    const result = await Other.paginate(filter, options);

    const dataSources = await Other.distinct("dataSource", {
      instituteId: filter.instituteId
    });

    res.json({
      ...result,
      dataSources
    });

  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// 🔹 Get single record
export const getOther = async (req: Request, res: Response) => {
  try {
    const other = await Other.findById(req.params.id).populate('creator', 'firstname lastname');
    if (!other) return res.status(404).json({ message: 'Not found' });
    res.json(other);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// 🔹 Update
export const updateOther = async (req: AuthRequest, res: Response) => {
  try {
    const updated = await Other.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!updated) return res.status(404).json({ message: 'Not found' });
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

// 🔹 Delete
export const deleteOther = async (req: AuthRequest, res: Response) => {
  try {
    const deleted = await Other.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Not found' });
    res.json({ message: 'Deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
