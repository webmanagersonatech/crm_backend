import { Request, Response } from 'express';
import Lead from './model';
import User from '../auth/auth.model';
import { createLeadSchema } from './lead.sanitize';
import Application from '../applications/model';
import { AuthRequest } from '../../middlewares/auth';
import multer from "multer";
import fs from "fs";
import csv from "csv-parser";
import path from "path";
import Student from '../students/model';

const upload = multer({
  dest: "uploads/",
});
const SibApiV3Sdk = require("sib-api-v3-sdk");

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
const sendLeadConfirmationEmail = async (
  email: string,
  name: string,
  program: string
) => {
  const emailData = {
    sender: { email: "no-reply@sonatech.ac.in", name: "HIKA" },
    to: [{ email, name: name || "Student" }],
    subject: "Enquiry Received – We Will Contact You Soon",
    htmlContent: `
      <div style="font-family: Arial, sans-serif; padding: 20px;">
        <h2>Thank You for Your Enquiry</h2>
        <p>Hello <b>${name || "Student"}</b>,</p>
        <p>We have successfully received your enquiry for the program <b>${program}</b>.</p>
        <p>Our team will contact you shortly.</p>
        <br/>
        <p>Thank you for choosing us.</p>
        <hr />
        <p style="font-size: 12px; color: #555;">
          Sona Institute — Admissions Team
        </p>
      </div>
    `,
  };

  await emailApi.sendTransacEmail(emailData);
};
const generateLeadId = async (instituteId: string) => {
  const random = Math.random().toString(16).substring(2, 8).toUpperCase();
  return `${instituteId}-LE-${random}`;
};
const generateUniqueLeadId = async (instituteId: string) => {
  let leadId;
  let exists = true;

  while (exists) {
    const random = Math.random().toString(16).substring(2, 8).toUpperCase();
    leadId = `${instituteId}-LE-${random}`;

    const existing = await Lead.findOne({ leadId });
    if (!existing) {
      exists = false;
    }
  }

  return leadId;
};

export const createLead = async (req: AuthRequest, res: Response) => {
  const { error, value } = createLeadSchema.validate(req.body);

  if (error) return res.status(400).json({ message: error.message });

  const createdBy = req.user?.id;
  if (!createdBy) return res.status(401).json({ message: 'Not authorized' });

  const instituteId = req.body.instituteId || req.user?.instituteId;

  const existingLeads = await Lead.find({
    phoneNumber: value.phoneNumber,
  });

  let duplicateReason = null;

  if (existingLeads.length > 0) {

    duplicateReason = `A lead with this phone number already exists in our Software. Please review before follow-up.`;
  }

  const user = await User.findById(createdBy).lean();

  const calltaken = (value.counsellorName || `${user?.firstname || ""} ${user?.lastname || ""}`).trim();
  const firstFollowUp = {
    status: value.status,
    calltaken,
    communication: value.communication,
    followUpDate: value.followUpDate,
    description: value.description,
  };



  const lead = await Lead.create({
    ...value, createdBy, instituteId, followups: [firstFollowUp], isduplicate: existingLeads.length > 0,
    duplicateReason,
  });

  if (value.applicationId) {
    // 1️⃣ Update Application & STORE result
    const application = await Application.findOneAndUpdate(
      { applicationId: value.applicationId },
      {
        $set: {
          leadId: lead.leadId,
          interactions: lead.status,
        },
      },
      { new: true }
    );

    // 2️⃣ Sync Student
    if (application?.studentId) {
      await Student.findOneAndUpdate(
        { studentId: application.studentId },
        { interactions: application.interactions },
        { new: true }
      );
    }
  }



  res.json(lead);
};
export const createThirdPartyLead = async (
  req: AuthRequest,
  res: Response
) => {
  req.body.instituteId = req.user?.instituteId;

  const { error, value } = createLeadSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const createdBy = req.user?._id;
  const instituteId = req.user?.instituteId;

  if (!createdBy || !instituteId) {
    return res.status(401).json({ message: "Unauthorized user" });
  }

  const existingLeads = await Lead.find({
    phoneNumber: value.phoneNumber,
  });

  const duplicateReason =
    existingLeads.length > 0
      ? "A lead with this phone number already exists in our Software."
      : null;

  const fullName = `${req.user?.firstname || ""} ${req.user?.lastname || ""
    }`.trim();

  const now = new Date();

  // ✅ Default Followup
  const firstFollowUp = {
    status: "New",
    calltaken: fullName || "Third Party Vendor",
    communication: value.communication || "Call",
    followUpDate: now,
    description: `Lead given by ${fullName || "Third Party Vendor"}`,
  };

  const lead = await Lead.create({
    ...value,

    // 🔥 Force system controlled fields
    status: "New",
    leadSource: "offline",
    createdBy,
    instituteId,
    followups: [firstFollowUp],
    followUpDate:now,
    isduplicate: existingLeads.length > 0,
    duplicateReason,
  });

  res.json({
    success: true,
    message: "Lead created successfully",
    leadId: lead.leadId,
  });
};

export const bulkUploadLeads = async (req: any, res: any) => {
  let filePath: string | null = null;

  try {
    // ============================
    // ✅ BASIC VALIDATION
    // ============================

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "CSV file required",
      });
    }

    const createdBy = req.user?.id;
    const instituteId = req.user?.instituteId;

    if (!createdBy || !instituteId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    filePath = path.resolve(req.file.path);
    const rows: any[] = [];

    // ============================
    // ✅ READ CSV
    // ============================

    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath!)
        .pipe(csv())
        .on("data", (data) => rows.push(data))
        .on("end", resolve)
        .on("error", reject);
    });

    if (!rows.length) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "CSV is empty",
      });
    }

    // ============================
    // ✅ HELPER: SAFE DATE PARSER
    // ============================

    const parseValidDate = (value: any): Date | null => {
      if (!value || value === "") return null;

      const date = new Date(value);
      return isNaN(date.getTime()) ? null : date;
    };

    // ============================
    // ✅ STEP 1: SHEET VALIDATION
    // ============================

    const errors: { row: number; field: string; message: string }[] = [];
    const phoneMap = new Map<string, number[]>();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;

      let phone = row.phoneNumber?.toString().trim();

      if (!phone) {
        errors.push({
          row: rowNumber,
          field: "phoneNumber",
          message: "Phone number is required",
        });
        return;
      }

      // Remove non-digits
      phone = phone.replace(/\D/g, "");

      if (phone.length !== 10) {
        errors.push({
          row: rowNumber,
          field: "phoneNumber",
          message: "Phone number must be exactly 10 digits",
        });
        return;
      }

      row.phoneNumber = phone;

      if (!row.candidateName || row.candidateName.trim() === "") {
        errors.push({
          row: rowNumber,
          field: "candidateName",
          message: "Candidate name is required",
        });
      }

      // Track duplicates inside sheet
      if (!phoneMap.has(phone)) {
        phoneMap.set(phone, []);
      }
      phoneMap.get(phone)!.push(rowNumber);
    });

    // Sheet duplicate check
    phoneMap.forEach((rowsList, phone) => {
      if (rowsList.length > 1) {
        rowsList.forEach((r) => {
          errors.push({
            row: r,
            field: "phoneNumber",
            message: `Duplicate phone number in sheet (${phone})`,
          });
        });
      }
    });

    if (errors.length > 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({
        success: false,
        message: "Sheet validation failed",
        errors,
      });
    }

    // ============================
    // ✅ STEP 2: CHECK DB DUPLICATES
    // ============================

    const phoneNumbers = rows.map((r) => r.phoneNumber);

    const existingLeads = await Lead.find({
      phoneNumber: { $in: phoneNumbers },
      instituteId,
    }).select("phoneNumber leadId");

    const existingMap = new Map<string, string[]>();

    existingLeads.forEach((lead: any) => {
      if (!existingMap.has(lead.phoneNumber)) {
        existingMap.set(lead.phoneNumber, []);
      }
      existingMap.get(lead.phoneNumber)!.push(lead.leadId);
    });

    // ============================
    // ✅ STEP 3: PREPARE INSERT DATA
    // ============================

    const leadsToInsert = [];

    for (const row of rows) {
      const isDuplicate = existingMap.has(row.phoneNumber);

      const duplicateReason = isDuplicate
        ? `Duplicate phone exists. Lead IDs: ${existingMap
          .get(row.phoneNumber)
          ?.join(", ")}`
        : null;

      const leadId = await generateUniqueLeadId(instituteId);

      const safeDOB = parseValidDate(row.dateOfBirth);
      const safeFollowUpDate = parseValidDate(row.followUpDate);

      const followUp = {
        status: row.status || "New",
        communication: row.communication || "Offline",
        followUpDate: safeFollowUpDate,
        description: row.description || "",
        calltaken: row.counsellorName || "",
      };

      leadsToInsert.push({
        leadId,
        instituteId,
        program: row.program || "",
        candidateName: row.candidateName.trim(),
        ugDegree: row.ugDegree || "",
        phoneNumber: row.phoneNumber,
        email: row.email || "",
        dateOfBirth: safeDOB,
        country: row.country || "",
        state: row.state || "",
        city: row.city || "",
        counsellorName: row.counsellorName || "",
        leadSource: row.leadSource || "offline",
        status: row.status || "New",
        communication: row.communication || "Offline",
        followUpDate: safeFollowUpDate,
        description: row.description || "",
        followups: [followUp],
        createdBy,
        isduplicate: isDuplicate,
        duplicateReason,
      });
    }

    // ============================
    // ✅ STEP 4: INSERT SAFELY
    // ============================

    const insertedLeads = await Lead.insertMany(leadsToInsert, {
      ordered: false, // prevents stopping on first error
    });

    fs.unlinkSync(filePath);

    return res.json({
      success: true,
      message: "Bulk upload completed successfully 🚀",
      totalRows: rows.length,
      inserted: insertedLeads.length,
      duplicatesInSystem: existingLeads.length,
    });

  } catch (error) {
    console.error("Bulk Upload Error:", error);

    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return res.status(500).json({
      success: false,
      message: "Bulk upload failed",
    });
  }
};



// export const createLeadfromonline = async (req: AuthRequest, res: Response) => {
//   const { error, value } = createLeadSchema.validate(req.body);
//   if (error) {
//     return res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }

//   const instituteId = req.body.instituteId;

//   // Find all existing leads with the same phone number for this institute
//   const existingLeads = await Lead.find({
//     phoneNumber: value.phoneNumber,
//     instituteId,
//   });

//   let duplicateReason = null;

//   if (existingLeads.length > 0) {
//     // Collect all existing lead IDs
//     const duplicateLeadIds = existingLeads.map(lead => lead.leadId.toString());

//     // Set duplicate reason
//     duplicateReason = `A lead with this phone number already exists in our system (${existingLeads.length} duplicate${existingLeads.length > 1 ? 's' : ''}). Existing Lead IDs: ${duplicateLeadIds.join(", ")}. Please review before follow-up.`;
//   }

//   const firstFollowUp = {
//     status: value.status || "New",
//     calltaken: value.calltaken || "",
//     communication: value.communication || "Online",
//     followUpDate: value.followUpDate ? new Date(value.followUpDate) : new Date(),
//     description: value.description || "This lead enquiry has come from online",
//   };

//   const lead = await Lead.create({
//     ...value,
//     instituteId,
//     followups: [firstFollowUp],
//     isduplicate: existingLeads.length > 0,
//     duplicateReason,
//   });

//   return res.status(201).json({
//     success: true,
//     message: "Enquiry submitted successfully",
//     data: lead,

//   });
// };


// export const createLeadfromonline = async (req: AuthRequest, res: Response) => {
//   const { error, value } = createLeadSchema.validate(req.body);

//   if (error) {
//     return res.status(400).json({
//       success: false,
//       message: error.message,
//     });
//   }

//   const { instituteId, phoneNumber } = value;

//   try {
//     const existingLead = await Lead.findOne({ instituteId, phoneNumber });

//     // 🚨 DUPLICATE
//     if (existingLead) {
//       return res.status(409).json({
//         success: false,                 // important
//         alreadyEnquired: true,
//         message: "You have already enquired. Our team will respond to you shortly.",
//         data: existingLead,
//       });
//     }

//     const firstFollowUp = {
//       status: value.status || "New",
//       calltaken: value.calltaken || "",
//       communication: value.communication || "Online",
//       followUpDate: value.followUpDate ? new Date(value.followUpDate) : new Date(),
//       description: value.description || "This lead enquiry has come from online",
//     };

//     const lead = await Lead.create({
//       ...value,
//       instituteId,
//       followups: [firstFollowUp],
//       isduplicate: false,
//       duplicateReason: null,
//     });

//     // ✅ CREATED
//     return res.status(201).json({
//       success: true,
//       alreadyEnquired: false,
//       message: "Enquiry submitted successfully. Our team will contact you shortly.",
//       data: lead,
//     });

//   } catch (err) {
//     console.error(err);
//     return res.status(500).json({
//       success: false,
//       message: "Unable to submit enquiry. Please try again later.",
//     });
//   }
// };

export const createLeadfromonline = async (req: Request, res: Response) => {
  const { error, value } = createLeadSchema.validate(req.body);

  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const { instituteId, phoneNumber } = value;

  try {
    // 🔍 Check Duplicate
    const existingLead = await Lead.findOne({ instituteId, phoneNumber });

    if (existingLead) {
      return res.status(409).json({
        success: false,
        alreadyEnquired: true,
        message:
          "You have already enquired. Our team will respond to you shortly.",
        data: existingLead,
      });
    }

    // 📝 First Followup
    const firstFollowUp = {
      status: value.status || "New",
      calltaken: value.calltaken || "",
      communication: value.communication || "Online",
      followUpDate: value.followUpDate
        ? new Date(value.followUpDate)
        : new Date(),
      description:
        value.description || "This lead enquiry has come from online",
    };

    // ✅ Create Lead
    const lead = await Lead.create({
      ...value,
      instituteId,
      followups: [firstFollowUp],
      isduplicate: false,
      duplicateReason: null,
    });

    // 📧 Send Confirmation Email (Don't break if fails)
    try {
      if (value.email) {
        await sendLeadConfirmationEmail(
          value.email,
          value.candidateName,
          value.program
        );
      }
    } catch (mailError) {
      console.error("Lead email sending failed:", mailError);
    }

    // 🎉 Success Response
    return res.status(201).json({
      success: true,
      alreadyEnquired: false,
      message:
        "Enquiry submitted successfully. Our team will contact you shortly.",
      data: lead,
    });
  } catch (err) {
    console.error("Lead creation error:", err);
    return res.status(500).json({
      success: false,
      message: "Unable to submit enquiry. Please try again later.",
    });
  }
};

// Export middleware
export const uploadMiddleware = upload.single("file");

export const getduplicateLeads = async (req: AuthRequest, res: Response) => {
  try {
    const { phoneNumber } = req.query;
    const user = req.user;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        message: "Phone number is required",
      });
    }

    // ✅ Fetch leads by phone number
    const leads = await Lead.find({ phoneNumber })
      .sort({ createdAt: -1 })
      .populate([
        { path: "creator", select: "firstname lastname instituteId role" },
        { path: "institute", select: "name" },
      ]);

    // ✅ Separate original & duplicate
    const originalData = leads.filter((lead) => lead.isduplicate === false);
    const duplicateData = leads.filter((lead) => lead.isduplicate === true);

    res.status(200).json({
      success: true,
      message: "Duplicate leads fetched successfully",
      totalCount: leads.length,
      originalCount: originalData.length,
      duplicateCount: duplicateData.length,
      originalData,
      duplicateData,
    });

  } catch (error: any) {
    console.error("Error fetching duplicate leads:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};


export const listLeads = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      instituteId,
      status,
      candidateName,
      communication,
      startDate,
      endDate,
      userId,
      phoneNumber, // ✅ added
      leadId,      // ✅ added
      country, state, city,
      isduplicate,
      leadSource,
    } = req.query;
    const user = req.user;

    let filter: any = {};

    // 🔹 Role-based filters
    if (user.role === "superadmin") {
      if (instituteId) filter.instituteId = instituteId;
    } else if (user.role === "admin") {
      filter.instituteId = user.instituteId;
    } else if (user.role === "user") {
      filter = { instituteId: user.instituteId, createdBy: user.id };
    }

    // 🔹 Optional filters
    if (leadSource) filter.leadSource = leadSource;
    if (status) filter.status = status;
    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) {
      if (Array.isArray(city)) {
        filter.city = { $in: city };
      } else {
        filter.city = city;
      }
    }

    if (communication) filter.communication = communication;
    if (candidateName) filter.candidateName = { $regex: candidateName, $options: "i" };
    if (userId && user.role !== "user") {
      filter.createdBy = userId;
    }

    // 🔹 Phone number search
    if (phoneNumber) {
      filter.phoneNumber = { $regex: phoneNumber, $options: "i" };
    }

    // 🔹 Lead ID search
    if (leadId) {
      filter.leadId = { $regex: leadId, $options: "i" };
    }

    // 🔹 Duplicate filter
    if (isduplicate === "true") {
      filter.isduplicate = true;
    } else if (isduplicate === "false") {
      filter.isduplicate = false;
    }

    // 🔹 Date range filter (createdAt between startDate and endDate)
    if (startDate || endDate) {
      const dateFilter: any = {};

      if (startDate) {
        const start = new Date(startDate as string);
        start.setHours(0, 0, 0, 0); // 00:00:00
        dateFilter.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate as string);
        end.setHours(23, 59, 59, 999); // 23:59:59
        dateFilter.$lte = end;
      }

      filter.createdAt = dateFilter;
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: "creator", select: "firstname lastname instituteId role" },
        { path: "institute", select: "name" },
        { path: "application", select: "_id" },
      ],
    };

    const result = await Lead.paginate(filter, options);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const exportLeads = async (req: AuthRequest, res: Response) => {
  try {
    const {
      instituteId,
      status,
      candidateName,
      communication,
      startDate,
      endDate,
      userId,
      phoneNumber,
      leadId,
      country,
      state,
      city,
      leadSource,
    } = req.query;

    const user = req.user;

    let filter: any = {};

    // 🔹 Role-based filters
    if (user.role === "superadmin") {
      if (instituteId) filter.instituteId = instituteId;
    } else if (user.role === "admin") {
      filter.instituteId = user.instituteId;
    } else if (user.role === "user") {
      filter = { instituteId: user.instituteId, createdBy: user.id };
    }

    // 🔹 Optional filters
    if (leadSource) filter.leadSource = leadSource;
    if (status) filter.status = status;
    if (country) filter.country = country;
    if (state) filter.state = state;
    if (city) {
      if (Array.isArray(city)) {
        filter.city = { $in: city };
      } else {
        filter.city = city;
      }
    }

    if (communication) filter.communication = communication;
    if (candidateName) filter.candidateName = { $regex: candidateName, $options: "i" };
    if (userId && user.role !== "user") {
      filter.createdBy = userId;
    }

    // 🔹 Phone number search
    if (phoneNumber) {
      filter.phoneNumber = { $regex: phoneNumber, $options: "i" };
    }

    // 🔹 Lead ID search
    if (leadId) {
      filter.leadId = { $regex: leadId, $options: "i" };
    }

    // 🔹 Date range filter (createdAt between startDate and endDate)
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

    // 📦 Get ALL leads without pagination
    const leads = await Lead.find(filter)
      .sort({ createdAt: -1 })
      .populate([
        { path: "creator", select: "firstname lastname instituteId role" },
        { path: "institute", select: "name" },
        { path: "application", select: "_id" },
      ]);

    res.status(200).json({
      success: true,
      message: 'Leads exported successfully',
      data: leads,
      totalCount: leads.length
    });

  } catch (error: any) {
    console.error('Error exporting leads:', error);
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};


export const getLead = async (req: Request, res: Response) => {
  try {
    const lead = await Lead.findById(req.params.id)
      .populate('creator', 'firstname lastname instituteId role');

    if (!lead) return res.status(404).json({ message: 'Not found' });
    res.json(lead);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


export const updateLead = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;

    const {
      status,
      communication,
      followUpDate,
      description,
      phoneNumber,
      followups,
      isduplicate: _ignore1,
      duplicateReason: _ignore2,
      ...rest
    } = req.body;

    const lead = await Lead.findById(id);

    if (!lead) {
      return res.status(404).json({ message: "Not found" });
    }

    const oldPhone = lead.phoneNumber;

    let isduplicate = false;
    let duplicateReason = "";

    // ===============================
    // 🔥 STEP 1: Handle NEW phone group
    // ===============================
    if (phoneNumber && phoneNumber !== oldPhone) {

      const sameNewPhoneLeads = await Lead.find({
        phoneNumber,
        _id: { $ne: id },
      }).sort({ createdAt: 1 });

      if (sameNewPhoneLeads.length > 0) {
        isduplicate = true;
        duplicateReason =
          "A lead with this phone number already exists in our Software. Please review before follow-up.";
      }
    } else {
      // If phone not changed, keep existing duplicate status
      isduplicate = lead.isduplicate;
      duplicateReason = lead.duplicateReason || "";
    }

    // ===============================
    // 🔹 Normalize date
    // ===============================
    const oldDate = lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().split("T")[0]
      : "";

    const newDate = followUpDate
      ? new Date(followUpDate).toISOString().split("T")[0]
      : "";

    const isFollowUpChanged =
      status !== lead.status ||
      communication !== lead.communication ||
      description !== lead.description ||
      newDate !== oldDate;

    // ===============================
    // ✅ Build Update Query
    // ===============================
    const updateQuery: any = {
      $set: {
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(status !== undefined && { status }),
        ...(communication !== undefined && { communication }),
        ...(followUpDate !== undefined && { followUpDate }),
        ...(description !== undefined && { description }),
        isduplicate,
        duplicateReason,
        ...rest,
      },
    };

    if (isFollowUpChanged) {
      const user = await User.findById(req.user?.id).lean();
      const calltaken = (
        rest.counsellorName ||
        `${user?.firstname || ""} ${user?.lastname || ""}`
      ).trim();

      updateQuery.$push = {
        followups: {
          status,
          communication,
          followUpDate,
          calltaken,
          description,
        },
      };
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    );

    // ===============================
    // 🔥 STEP 2: Recalculate OLD phone group
    // ===============================
    if (phoneNumber && phoneNumber !== oldPhone) {

      const remainingOldPhoneLeads = await Lead.find({
        phoneNumber: oldPhone,
      }).sort({ createdAt: 1 });

      if (remainingOldPhoneLeads.length > 0) {

        const originalLead = remainingOldPhoneLeads[0];

        await Lead.findByIdAndUpdate(originalLead._id, {
          isduplicate: false,
          duplicateReason: "",
        });

        const duplicateIds = remainingOldPhoneLeads
          .slice(1)
          .map(l => l._id);

        if (duplicateIds.length > 0) {
          await Lead.updateMany(
            { _id: { $in: duplicateIds } },
            {
              isduplicate: true,
              duplicateReason:
                "A lead with this phone number already exists in our Software. Please review before follow-up.",
            }
          );
        }
      }
    }

    // ===============================
    // 🔁 Sync Application & Student
    // ===============================
    if (updatedLead?.applicationId) {
      const application = await Application.findOneAndUpdate(
        { applicationId: updatedLead.applicationId },
        { interactions: updatedLead.status },
        { new: true }
      );

      if (application?.studentId) {
        await Student.findOneAndUpdate(
          { studentId: application.studentId },
          { interactions: application.interactions },
          { new: true }
        );
      }
    }

    res.json(updatedLead);

  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};




export const deleteLead = async (req: AuthRequest, res: Response) => {
  try {
    const lead = await Lead.findByIdAndDelete(req.params.id);
    if (!lead) return res.status(404).json({ message: 'Not found' });

    res.json({ message: 'deleted' });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
