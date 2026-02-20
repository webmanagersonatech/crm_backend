import { Request, Response } from 'express'
import Application from './model'
import { createApplicationSchema } from './application.sanitize'
import { AuthRequest } from '../../middlewares/auth'
import formmanager from '../form-manage/model'
import Student from '../students/model'
import LeadModel from '../lead/model'
import crypto from "crypto";
import { StudentAuthRequest } from '../../middlewares/studentAuth'
import Settings from '../settings/model'
import emailtemplates from '../email-templates/model';
import fs from "fs";
import csv from "csv-parser";

// 🧾 Create Application
const SibApiV3Sdk = require('sib-api-v3-sdk');

const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();
const smsApi = new SibApiV3Sdk.TransactionalSMSApi(); // ✅ Correct

const mapSiblingStatus = (value: string) => {
  if (!value) return "none";
  return value.toLowerCase() === "yes" ? "studying" : "none";
};

const buildSearchTextFromSections = (
  personalDetails: any[],
  educationDetails: any[]
): string => {
  const tokens: string[] = [];

  const addField = (label: string, value: any) => {
    if (value === null || value === undefined) return;

    if (Array.isArray(value)) {
      // Include even if empty array
      tokens.push(`${label}:${value.map(v => String(v).toLowerCase().trim()).join(",")}`);
    } else if (value !== "") {
      // Include non-empty strings and numbers
      tokens.push(`${label}:${String(value).toLowerCase().trim()}`);
    } else {
      // For empty string, still include with empty value
      tokens.push(`${label}:`);
    }
  };

  const processSections = (sections: any[]) => {
    sections.forEach((section) => {
      Object.entries(section.fields || {}).forEach(([key, value]) => {
        // Convert key to lowercase and remove spaces
        const label = key.replace(/\s+/g, "").toLowerCase();
        addField(label, value);
      });
    });
  };

  processSections(personalDetails);
  processSections(educationDetails);

  return tokens.join(" ");
};



const ALLOWED_FILTER_TYPES = ["select", "radio", "checkbox", "text", "number"];

const extractKeyOptionsForFilter = (sections: any[]) => {
  const result: any[] = [];

  sections.forEach(section => {
    section.fields.forEach((field: any) => {
      // 🚫 Ignore file & textarea
      if (!ALLOWED_FILTER_TYPES.includes(field.type)) return;

      result.push({
        key: field.fieldName,
        label: field.label,
        type: field.type,
        options: field.options || [],
        multiple: field.multiple || false
      });
    });
  });

  return result;
};



const extractAddress = (personalDetails: any[]) => {
  let country = "";
  let state = "";
  let city = "";

  personalDetails.forEach(section => {
    Object.entries(section.fields || {}).forEach(([key, value]) => {
      const field = key.toLowerCase();

      if (field.includes("country") && !country) {
        country = value as string;
      }
      if (field.includes("state") && !state) {
        state = value as string;
      }
      if (field.includes("city") && !city) {
        city = value as string;
      }
    });
  });

  return { country, state, city };
};


export const generatePassword = (length = 10) =>
  crypto
    .randomBytes(length)
    .toString("base64")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, length);

export const sendTemplateMails = async (req: Request, res: Response) => {
  try {
    const { templateId, recipients } = req.body;

    if (!templateId || !recipients || !recipients.length) {
      return res
        .status(400)
        .json({ success: false, message: "Missing templateId or recipients" });
    }

    // Fetch template from DB
    const template = await emailtemplates.findById(templateId);
    if (!template) {
      return res
        .status(404)
        .json({ success: false, message: "Template not found" });
    }

    const results: Array<any> = [];

    for (const recipient of recipients) {
      const htmlContent = template.description
        .replace(/candidatename/g, recipient.name)
        .replace(/{{applicationId}}/g, recipient.applicationId || "N/A")
        .replace(
          /<a href="(.*?)"(.*?)>(.*?)<\/a>/g,
          `<a href="$1"$2 style="color: blue;">$3</a>`
        );

      const emailData = {
        sender: { email: "no-reply@sonatech.ac.in", name: "HIKA" },
        to: [{ email: recipient.email, name: recipient.name }],
        subject: template.title,
        htmlContent,
      };

      try {
        const response = await emailApi.sendTransacEmail(emailData);
        results.push({
          email: recipient.email,
          success: true,
          messageId: response.messageId,
        });
      } catch (err: any) {
        // Extract detailed error info
        let errorMsg = "Unknown error";
        if (err.response && err.response.body) {
          // API-specific error
          errorMsg = JSON.stringify(err.response.body);
        } else if (err.message) {
          errorMsg = err.message;
        }

        results.push({
          email: recipient.email,
          success: false,
          error: errorMsg,
        });
      }
    }

    return res.status(200).json({ success: true, results });
  } catch (err: any) {
    console.error("SendTemplateMail failed:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send emails",
      error: err.message,
    });
  }
};

export const sendPasswordEmail = async (
  email: string,
  name: string,
  password: string
) => {
  const htmlContent = `
    <h3>Welcome ${name}</h3>
    <p>Your student account has been created.</p>
    <p><strong>Email:</strong> ${email}</p>
    <p><strong>Password:</strong> ${password}</p>
    <p>Please change your password after login.</p>
  `;

  await emailApi.sendTransacEmail({
    sender: { email: "no-reply@sonatech.ac.in", name: "HIKA" },
    to: [{ email, name }],
    subject: "Student Account Created",
    htmlContent,
  });
};


// Send SMS from payload
export const sendSMS = async (req: AuthRequest, res: Response) => {
  try {
    const { recipientNumber, message } = req.body;

    // Validate payload
    if (!recipientNumber || !message) {
      return res.status(400).json({
        success: false,
        message: "recipientNumber and message are required in payload",
      });
    }

    const sendSms = new SibApiV3Sdk.SendTransacSms();
    sendSms.sender = "TESTSMS"; // Replace with your Brevo sender ID
    sendSms.recipient = recipientNumber; // e.g., +919XXXXXXXXX
    sendSms.content = message;

    // Send SMS via Brevo
    const response = await smsApi.sendTransacSms(sendSms);

    // Return JSON response
    return res.status(200).json({
      success: true,
      message: `SMS sent successfully to ${recipientNumber}`,
      response,
    });
  } catch (err: any) {
    console.error("Failed to send SMS:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to send SMS",
      error: err.message || err,
    });
  }
};


export const createApplication = async (req: AuthRequest, res: Response) => {
  try {
    const instituteId = req.body.instituteId || req.user?.instituteId;

    const program = req.body.program;

    const settings = await Settings.findOne({ instituteId })

    if (!settings && !req.body.academicYear) {
      return res.status(400).json({ message: 'Academic year not found' })
    }
    const academicYear = req.body.academicYear || settings?.academicYear
    const leadId = req.body.leadId;

    const applicationSource =
      req.body.applicationSource || "offline";

    // Parse JSON fields (sent via multipart/form-data)
    const personalDetails =
      typeof req.body.personalDetails === "string"
        ? JSON.parse(req.body.personalDetails)
        : req.body.personalDetails || [];
    const educationDetails =
      typeof req.body.educationDetails === "string"
        ? JSON.parse(req.body.educationDetails)
        : req.body.educationDetails || [];

    // Validate
    const { error } = createApplicationSchema.validate({
      instituteId,
      program,
      academicYear,
      personalDetails,
      educationDetails,
    });
    if (error)
      return res.status(400).json({ success: false, message: error.message });

    const createdBy = req.user?.id;
    if (!createdBy)
      return res.status(401).json({ success: false, message: "Not authorized" });

    // Handle file uploads
    const files = req.files as Express.Multer.File[] | undefined;


    if (files?.length) {
      files.forEach((file) => {
        const fieldName = file.fieldname;

        // Replace in personalDetails
        personalDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename;
          }
        });

        // Replace in educationDetails
        educationDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename;
          }
        });
      });
    }

    // Extract main student info for applicantName
    const flattenedPersonalFields = Object.assign(
      {},
      ...personalDetails.map((s: any) => s.fields)
    );
    // 👇 ADD THIS AFTER flattenedPersonalFields creation
    const { country, state, city } = extractAddress(personalDetails);


    const email = flattenedPersonalFields["Email Address"];
    const mobileNo = flattenedPersonalFields["Contact Number"];
    const firstname =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!email || !firstname || !mobileNo)
      return res
        .status(400)
        .json({ success: false, message: "Required student fields missing" });

    const existingByMobile = await Student.findOne({ instituteId, mobileNo });

    if (existingByMobile) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered with an existing student account. Please use a different number or sign in to continue",
      });
    }

    // 2️⃣ Then check by EMAIL
    const existingByEmail = await Student.findOne({ instituteId, email });

    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        message: "This email address is already registered with an existing student account. Please use a different email or sign in to continue."
        ,
      });
    }
    // 🔍 BUILD SEARCH TEXT (AUTO)
    const searchText = buildSearchTextFromSections(
      personalDetails,
      educationDetails
    );

    const personalSection = personalDetails.find(
      (s: any) => s.sectionName === "Personal Details"
    );

    const siblingSection = personalDetails.find(
      (s: any) => s.sectionName === "Sibling Details"
    );

    const bloodGroup = personalSection?.fields?.["Blood Group"] || "";
    const hostelWilling =
      personalSection?.fields?.["Hostel Required"] === "Yes";

    let siblingsCount = 0;
    let siblingsDetails: any[] = [];

    if (siblingSection?.fields) {
      siblingsCount = Number(siblingSection.fields["Sibling Count"] || 0);

      for (let i = 1; i <= siblingsCount; i++) {
        const studyingValue =
          siblingSection.fields[
          i === 1 ? "Sibling Studying" : `Sibling Studying ${i}`
          ];

        siblingsDetails.push({
          name:
            siblingSection.fields[
            i === 1 ? "Sibling Name" : `Sibling Name ${i}`
            ] || "",
          age: Number(
            siblingSection.fields[
            i === 1 ? "Sibling Age" : `Sibling Age ${i}`
            ] || 0
          ),
          status: mapSiblingStatus(studyingValue),
        });
      }
    }


    let leadStatus = "New";

    if (leadId) {
      const lead = await LeadModel.findOne({ leadId });
      if (lead?.status) {
        leadStatus = lead.status;
      }
    }
    const plainPassword = generatePassword();

    const student = await Student.create({
      firstname,
      lastname: flattenedPersonalFields["Last Name"] || "",
      email,
      academicYear,
      interactions: leadStatus,
      country,
      state,
      city,
      mobileNo,
      instituteId,
      password: plainPassword,
      status: "active",
      bloodGroup,
      hostelWilling,
      siblingsCount,
      siblingsDetails,
    });

    await sendPasswordEmail(email, firstname, plainPassword);

    const applicantName =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ");


    // Create application (store **arrays** directly!)
    const application = await Application.create({
      instituteId,
      program,
      userId: createdBy,
      leadId,
      interactions: leadStatus,
      applicationSource,
      academicYear,
      personalDetails,   // store array, not flattened object
      educationDetails,  // store array, not flattened object
      applicantName,
      country,
      state,
      city,
      studentId: student.studentId,
      paymentStatus: "Unpaid",
      status: "Pending",
      searchText,
    });

    // Link student and lead
    await Student.findByIdAndUpdate(student._id, {
      applicationId: application.applicationId,
    });

    if (leadId)
      await LeadModel.findOneAndUpdate(
        { leadId },
        { applicationId: application.applicationId },
        { new: true }

      );

    return res.status(200).json({
      success: true,
      message: "Application submitted successfully",
      data: application,
    });
  } catch (error: any) {
    console.error("Error creating application:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
};






export const bulkUploadApplications = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({
        success: false,
        message: "CSV file required",
      });
    }

    const instituteId = req.user?.instituteId;
    if (!instituteId) {
      return res.status(400).json({
        success: false,
        message: "Institute not found",
      });
    }

    const formConfig = await formmanager.findOne({ instituteId });
    if (!formConfig) {
      return res.status(400).json({
        success: false,
        message: "Form configuration not found",
      });
    }

    const rows: any[] = [];

    // ===========================
    // 🔥 READ CSV (Promise Safe)
    // ===========================
    await new Promise<void>((resolve, reject) => {
      fs.createReadStream(file.path)
        .pipe(csv())
        .on("data", (data) => {
          const cleanedRow: any = {};

          Object.keys(data).forEach((key) => {
            const cleanKey = key.trim();
            cleanedRow[cleanKey] = data[key]?.toString().trim();
          });

          rows.push(cleanedRow);
        })
        .on("end", resolve)
        .on("error", reject);
    });

    // ===========================
    // 🔥 STRONG NORMALIZER
    // ===========================
    const normalize = (value: string) =>
      value
        ?.toString()
        .toLowerCase()
        .replace(/\s+/g, "")   // remove spaces
        .replace(/[_-]/g, "")  // remove _ and -
        .trim();

    let successCount = 0;
    const failed: any[] = [];

    // ===========================
    // 🔥 PROCESS ONE BY ONE
    // ===========================
    for (const row of rows) {
      try {
        // Build header map once per row
        const headerMap: any = {};
        Object.keys(row).forEach((key) => {
          headerMap[normalize(key)] = row[key];
        });

        const getCsvValue = (fieldName: string) => {
          return headerMap[normalize(fieldName)];
        };

        const buildSection = (sections: any[]) => {
          return sections.map((section) => {
            const sectionFields: any = {};

            section.fields.forEach((field: any) => {
              const csvValue = getCsvValue(field.fieldName);

              if (csvValue !== undefined && csvValue !== "") {
                if (
                  field.type === "select" &&
                  field.options?.length &&
                  !field.options.includes(csvValue)
                ) {
                  throw new Error(
                    `Invalid option '${csvValue}' for ${field.fieldName}`
                  );
                }

                sectionFields[field.fieldName] = csvValue;
              }
            });

            return {
              sectionName: section.sectionName,
              fields: sectionFields,
            };
          });
        };

        const applicantName =
          getCsvValue("Full Name") ||
          getCsvValue("Applicant Name");

        if (!applicantName) {
          throw new Error("Applicant Name is required");
        }

        const email = getCsvValue("Email Address");
        const mobile = getCsvValue("Contact Number");

        const academicYear =
          getCsvValue("Academic Year") ||
          getCsvValue("academicYear");

        if (!academicYear) {
          throw new Error("Academic Year is required");
        }

        await Application.create({
          instituteId,
          program: getCsvValue("Program"),
          academicYear,
          applicantName,
          country: getCsvValue("Country"),
          state: getCsvValue("State"),
          city: getCsvValue("City"),
          personalDetails: buildSection(
            formConfig.personalDetails || []
          ),
          educationDetails: buildSection(
            formConfig.educationDetails || []
          ),
          paymentStatus: "Unpaid",
          status: "Pending",
          interactions: "Admitted",
 
        });

        successCount++;
      } catch (err: any) {
        failed.push({
          row,
          error: err.message,
        });
      }
    }

    // ===========================
    // 🔥 DELETE TEMP FILE
    // ===========================
    if (fs.existsSync(file.path)) {
      fs.unlinkSync(file.path);
    }

    return res.status(200).json({
      success: true,
      uploaded: successCount,
      failed: failed.length,
      failedData: failed,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};






export const createApplicationByStudent = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    // Parse JSON fields
    const personalDetails =
      typeof req.body.personalDetails === "string"
        ? JSON.parse(req.body.personalDetails)
        : req.body.personalDetails || [];

    const educationDetails =
      typeof req.body.educationDetails === "string"
        ? JSON.parse(req.body.educationDetails)
        : req.body.educationDetails || [];

    const instituteId = req.body.instituteId || req.student?.instituteId;
    const program = req.body.program;
    const academicYear = req.body.academicYear;
    const applicationSource =
      req.body.applicationSource || "online";
    // Validate request
    const { error } = createApplicationSchema.validate({
      instituteId,
      program,
      academicYear,
      personalDetails,
      educationDetails,
    });

    if (error)
      return res.status(400).json({ success: false, message: error.message });

    const createdBy = req.student?.id;
    const createdBystudent = true
    const Applicationmode = "online"

    if (!createdBy)
      return res.status(401).json({ success: false, message: "Not authorized" });

    // Handle uploaded files
    const files = req.files as Express.Multer.File[] | undefined;
    if (files?.length) {
      files.forEach((file) => {
        const fieldName = file.fieldname;

        personalDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename;
          }
        });

        educationDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename;
          }
        });
      });
    }

    const flattenedPersonalFields = Object.assign(
      {},
      ...personalDetails.map((s: any) => s.fields)
    );
    const { country, state, city } = extractAddress(personalDetails);
    const email = flattenedPersonalFields["Email Address"];
    const mobileNo = flattenedPersonalFields["Contact Number"];
    const firstname =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!email || !firstname || !mobileNo)
      return res
        .status(400)
        .json({ success: false, message: "Required student fields missing" });

    const student = await Student.findOne({ email });
    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }
    const applicantName =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ");

    let bloodGroup = "";
    let hostelWilling = false;
    let siblingsCount = 0;
    let siblingsDetails: any[] = [];

    const personalSection = personalDetails.find(
      (s: any) => s.sectionName === "Personal Details"
    );

    const siblingSection = personalDetails.find(
      (s: any) => s.sectionName === "Sibling Details"
    );

    bloodGroup = personalSection?.fields?.["Blood Group"] || "";
    hostelWilling =
      personalSection?.fields?.["Hostel Required"] === "Yes";

    if (siblingSection?.fields) {
      siblingsCount = Number(siblingSection.fields["Sibling Count"] || 0);

      for (let i = 1; i <= siblingsCount; i++) {
        const studyingValue =
          siblingSection.fields[
          i === 1 ? "Sibling Studying" : `Sibling Studying ${i}`
          ];

        siblingsDetails.push({
          name:
            siblingSection.fields[
            i === 1 ? "Sibling Name" : `Sibling Name ${i}`
            ] || "",
          age: Number(
            siblingSection.fields[
            i === 1 ? "Sibling Age" : `Sibling Age ${i}`
            ] || 0
          ),
          status: mapSiblingStatus(studyingValue),
        });
      }
    }


    let application;

    if (student.applicationId) {

      const existingApplication = await Application.findOne({
        applicationId: student.applicationId,
      });
      const hasPersonalDetails =
        (Array.isArray(personalDetails) && personalDetails.length > 0) ||
        (existingApplication?.personalDetails?.length ?? 0) > 0;

      const hasEducationDetails =
        (Array.isArray(educationDetails) && educationDetails.length > 0) ||
        (existingApplication?.educationDetails?.length ?? 0) > 0;

      const formStatus =
        hasPersonalDetails && hasEducationDetails
          ? "Complete"
          : "Incomplete";



      application = await Application.findOneAndUpdate(
        { applicationId: student.applicationId },
        {
          instituteId,
          program,
          createdBystudent,
          Applicationmode,
          academicYear,
          personalDetails,
          educationDetails,
          applicationSource,
          applicantName,
          country,
          state,
          city,
          studentId: student.studentId,
          paymentStatus: "Unpaid",
          status: "Pending",
          formStatus,
        },
        { new: true }

      );
      student.country = country;
      student.state = state;
      student.city = city;
      student.academicYear = academicYear;
      student.interactions = application?.interactions;
      student.bloodGroup = bloodGroup;
      student.hostelWilling = hostelWilling;
      student.siblingsCount = siblingsCount;
      student.siblingsDetails = siblingsDetails;
      await student.save();
    } else {
      // ✅ Create new application
      application = await Application.create({
        instituteId,
        program,
        createdBystudent,
        Applicationmode,
        academicYear,
        applicationSource,
        country,
        state,
        city,
        personalDetails,
        educationDetails,
        applicantName,
        studentId: student.studentId,
        paymentStatus: "Unpaid",
        status: "Pending",
        formStatus: "Incomplete",
      });

      // Link student to this new application
      student.applicationId = application.applicationId;
      student.country = country;
      student.state = state;
      student.city = city;
      student.interactions = "New"
      student.bloodGroup = bloodGroup;
      student.hostelWilling = hostelWilling;
      student.siblingsCount = siblingsCount;
      student.siblingsDetails = siblingsDetails;
      student.academicYear = academicYear;
      await student.save();
    }

    res.status(200).json({
      success: true,
      message: "Application submitted successfully",
      data: application,
    });
  } catch (error: any) {
    console.error("Error creating student application:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getApplicationByStudent = async (req: StudentAuthRequest, res: Response) => {
  try {
    const { applicationId } = req.params;
    const studentId = req.student?.id;

    if (!studentId) {
      return res.status(401).json({ success: false, message: "Not authorized" });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }

    const application = await Application.findOne({
      applicationId,
      studentId: student.studentId,
    })

    if (!application) {
      return res.status(404).json({ success: false, message: "Application not found" });
    }

    res.status(200).json({
      success: true,
      data: application,
    });
  } catch (error: any) {
    console.error("Error fetching application:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getApplicationByStudents = async (
  req: StudentAuthRequest,
  res: Response
) => {
  try {
    const authStudentId = req.student?.id;

    if (!authStudentId) {
      return res
        .status(401)
        .json({ success: false, message: "Unauthorized access" });
    }

    const student = await Student.findById(authStudentId);

    if (!student) {
      return res
        .status(404)
        .json({ success: false, message: "Student not found" });
    }

    // 🟡 No application yet → WARNING (not error)
    if (!student.applicationId) {
      return res.status(200).json({
        success: true,
        warning: true,
        message: "No application found. Create a new application.",
        data: null,
      });
    }

    const application = await Application.findOne({
      applicationId: student.applicationId,
      studentId: student.studentId,
    });

    // 🟡 ApplicationId exists but record missing
    if (!application) {
      return res.status(200).json({
        success: true,
        warning: true,
        message: "Application record not found. Please create a new one.",
        data: null,
      });
    }

    // ✅ Application found
    return res.status(200).json({
      success: true,
      warning: false,
      data: application,
    });
  } catch (error: any) {
    console.error("Error fetching application by student:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const listpendingApplications = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Not authorized" });

    let filter: any = {};

    // Dynamic status filtering
    if (req.query.paymentStatus) {
      filter.paymentStatus = req.query.paymentStatus;
    }
    if (req.query.formStatus) {
      filter.formStatus = req.query.formStatus;
    }

    // If no specific status is selected, default to unpaid OR incomplete
    if (!req.query.paymentStatus && !req.query.formStatus) {
      filter.$or = [
        { paymentStatus: "Unpaid" },
        { formStatus: "Incomplete" },
      ];
    }

    if (user.role === "superadmin") {

      filter = { ...filter };
    } else if (user.role === "admin") {

      filter = { ...filter, instituteId: user.instituteId };
    } else if (user.role === "user") {

      filter = { ...filter, instituteId: user.instituteId, userId: user._id };
    }


    if (req.query.academicYear) filter.academicYear = req.query.academicYear;
    if (req.query.instituteId) filter.instituteId = req.query.instituteId;
    if (req.query.applicationId) {
      filter.applicationId = { $regex: req.query.applicationId, $options: "i" };
    }
    if (req.query.applicantName) {
      filter.applicantName = { $regex: req.query.applicantName, $options: "i" };
    }


    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;

    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [{ path: "institute", select: "name" }],
    };

    const applications = await (Application as any).paginate(filter, options);

    const yearFilter: any = {}

    if (filter.instituteId) {
      yearFilter.instituteId = filter.instituteId
    }



    const academicYears = await Application.distinct("academicYear", yearFilter)


    res.status(200).json({
      success: true,
      message: "Unpaid applications fetched successfully",
      applications,
      academicYears
    });
  } catch (error: any) {
    console.error("Error fetching unpaid applications:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};


export const updateApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user
    if (!user)
      return res.status(401).json({ success: false, message: "Not authorized" })

    const { id } = req.params


    const application = await Application.findById(id)

    if (!application) {
      return res
        .status(404)
        .json({ success: false, message: "Application not found" })
    }

    // 🔐 Optional role restriction
    if (
      user.role !== "superadmin" &&
      user.role !== "admin" &&
      (!application.userId || application.userId.toString() !== user.id)
    ) {
      return res.status(403).json({ success: false, message: "Access denied" })
    }


    const instituteId = req.body.instituteId || application.instituteId
    const program = req.body.program || application.program
    const academicYear = req.body.academicYear || application.academicYear


    // Parse JSON arrays
    const personalDetails =
      typeof req.body.personalDetails === "string"
        ? JSON.parse(req.body.personalDetails)
        : req.body.personalDetails || application.personalDetails

    const educationDetails =
      typeof req.body.educationDetails === "string"
        ? JSON.parse(req.body.educationDetails)
        : req.body.educationDetails || application.educationDetails

    // ✅ Validate
    const { error } = createApplicationSchema.validate({
      instituteId,
      program,
      academicYear,
      personalDetails,
      educationDetails,
    })

    if (error)
      return res.status(400).json({ success: false, message: error.message })

    // 📎 Handle file uploads
    const files = req.files as Express.Multer.File[] | undefined

    if (files?.length) {
      files.forEach((file) => {
        const fieldName = file.fieldname

        personalDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename
          }
        })

        educationDetails.forEach((section: any) => {
          if (section.fields[fieldName] !== undefined) {
            section.fields[fieldName] = file.filename
          }
        })
      })
    }

    // 🧠 Extract applicant name again
    const flattenedPersonalFields = Object.assign(
      {},
      ...personalDetails.map((s: any) => s.fields)
    )

    const { country, state, city } = extractAddress(personalDetails);

    const email = flattenedPersonalFields["Email Address"];
    const mobileNo = flattenedPersonalFields["Contact Number"];
    const firstname =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ")
        .trim();

    if (!email || !firstname || !mobileNo)
      return res
        .status(400)
        .json({ success: false, message: "Required student fields missing" });

    const existingByMobile = await Student.findOne({ instituteId, mobileNo, studentId: { $ne: application.studentId }, });

    if (existingByMobile) {
      return res.status(409).json({
        success: false,
        message: "This mobile number is already registered with an existing student account. Please use a different number or sign in to continue",
      });
    }

    // 2️⃣ Then check by EMAIL
    const existingByEmail = await Student.findOne({ instituteId, email, studentId: { $ne: application.studentId }, });

    if (existingByEmail) {
      return res.status(409).json({
        success: false,
        message: "This email address is already registered with an existing student account. Please use a different email or sign in to continue."
        ,
      });
    }

    const personalSection = personalDetails.find(
      (s: any) => s.sectionName === "Personal Details"
    );

    const siblingSection = personalDetails.find(
      (s: any) => s.sectionName === "Sibling Details"
    );

    const bloodGroup = personalSection?.fields?.["Blood Group"] || "";
    const hostelWilling =
      personalSection?.fields?.["Hostel Required"] === "Yes";

    let siblingsCount = 0;
    let siblingsDetails: any[] = [];

    if (siblingSection?.fields) {
      siblingsCount = Number(siblingSection.fields["Sibling Count"] || 0);

      for (let i = 1; i <= siblingsCount; i++) {
        const studyingValue =
          siblingSection.fields[
          i === 1 ? "Sibling Studying" : `Sibling Studying ${i}`
          ];

        siblingsDetails.push({
          name:
            siblingSection.fields[
            i === 1 ? "Sibling Name" : `Sibling Name ${i}`
            ] || "",
          age: Number(
            siblingSection.fields[
            i === 1 ? "Sibling Age" : `Sibling Age ${i}`
            ] || 0
          ),
          status: mapSiblingStatus(studyingValue),
        });
      }
    }

    const applicantName =
      flattenedPersonalFields["Full Name"] ||
      [
        flattenedPersonalFields["First Name"],
        flattenedPersonalFields["Last Name"],
      ]
        .filter(Boolean)
        .join(" ")

    const searchText = buildSearchTextFromSections(
      personalDetails,
      educationDetails
    );



    // ✅ Update document
    application.instituteId = instituteId
    application.program = program
    application.academicYear = academicYear
    application.personalDetails = personalDetails
    application.country = country ?? application.country;
    application.state = state ?? application.state;
    application.city = city ?? application.city;
    application.educationDetails = educationDetails
    application.applicantName = applicantName || application.applicantName
    application.searchText = searchText

    await application.save()

    await Student.findOneAndUpdate(
      { studentId: application.studentId },
      {
        firstname,                 // ✅ update name
        email,                     // ✅ update email
        mobileNo,                  // ✅ update mobile
        country: application.country,
        state: application.state,
        city: application.city,
        academicYear: application.academicYear,
        interactions: application.interactions,
        bloodGroup,
        hostelWilling,
        siblingsCount,
        siblingsDetails,
      },
      { new: true }
    );



    return res.status(200).json({
      success: true,
      message: "Application updated successfully",
      data: application,
    })
  } catch (error: any) {
    console.error("❌ Error updating application:", error)
    return res
      .status(500)
      .json({ success: false, message: error.message })
  }
}

// 🔍 Get Single Application
export const getApplication = async (req: Request, res: Response) => {
  try {
    const application = await Application.findById(req.params.id).populate('userId', 'firstname lastname role instituteId');

    if (!application) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    const settings = await Settings.findOne({ instituteId: application.instituteId });
    const insiteimage = settings?.logo || null;
    application.set('instituteLogo', insiteimage, { strict: false });
    res.status(200).json({ success: true, data: application });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ✏️ Update Application (admin/superadmin only)

export const updatePaymentStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user)
      return res.status(401).json({ success: false, message: "Not authorized" });

    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!paymentStatus) {
      return res.status(400).json({
        success: false,
        message: "Payment status is required",
      });
    }

    // ✅ Optional: restrict valid statuses
    const validStatuses = ["Paid", "Unpaid", "Partially"];
    if (!validStatuses.includes(paymentStatus)) {
      return res.status(400).json({
        success: false,
        message: `Invalid payment status. Must be one of: ${validStatuses.join(
          ", "
        )}`,
      });
    }

    // ✅ Find and update the application
    const updatedApplication = await Application.findByIdAndUpdate(
      id,
      { paymentStatus },
      { new: true }
    )

    if (!updatedApplication) {
      return res.status(404).json({
        success: false,
        message: "Application not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: `Payment status updated to "${paymentStatus}"`,
      data: updatedApplication,
    });
  } catch (error: any) {
    console.error("❌ Error updating payment status:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to update payment status",
    });
  }
};

export const listApplications = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user
    if (!user) return res.status(401).json({ message: 'Not authorized' })

    let filter: any = {}

    if (user.role === 'superadmin') {
      filter = {}
    } else if (user.role === 'admin') {
      filter = { instituteId: user.instituteId }
    } else if (user.role === 'user') {
      filter = { instituteId: user.instituteId, userId: user._id }
    }

    // 🎯 Optional filters
    if (req.query.academicYear) filter.academicYear = req.query.academicYear
    if (req.query.instituteId) filter.instituteId = req.query.instituteId
    if (req.query.paymentStatus) filter.paymentStatus = req.query.paymentStatus;
    if (req.query.formStatus) {
      filter.formStatus = req.query.formStatus;
    }

    if (req.query.applicationId) {
      filter.applicationId = { $regex: req.query.applicationId, $options: "i" };
    }

    if (req.query.applicantName) {
      filter.applicantName = { $regex: req.query.applicantName, $options: "i" };
    }
    if (req.query.program) {
      filter.program = {
        $regex: req.query.program,
        $options: "i",
      };
    }

    if (req.query.country) filter.country = req.query.country;
    if (req.query.state) filter.state = req.query.state;
    if (req.query.city) {
      if (Array.isArray(req.query.city)) {
        filter.city = { $in: req.query.city };
      } else {
        filter.city = req.query.city;
      }
    }

    if (req.query.applicationSource) filter.applicationSource = req.query.applicationSource;
    if (req.query.interactions) filter.interactions = req.query.interactions;

    if (req.query.startDate || req.query.endDate) {
      const dateFilter: any = {};

      if (req.query.startDate) {
        const start = new Date(req.query.startDate as string);
        start.setHours(0, 0, 0, 0);
        dateFilter.$gte = start;
      }

      if (req.query.endDate) {
        const end = new Date(req.query.endDate as string);
        end.setHours(23, 59, 59, 999);
        dateFilter.$lte = end;
      }
      filter.createdAt = dateFilter;
    }

    // 🔍 Global dynamic search (searchText)
    if (req.query.q) {
      const raw = String(req.query.q).toLowerCase().trim();
      const tokens = raw.split(/\s+/);

      const grouped: Record<string, string[]> = {};

      tokens.forEach(t => {
        const [key, value] = t.split(":");
        if (!key || !value) return;

        if (!grouped[key]) grouped[key] = [];
        grouped[key].push(value);
      });

      filter.$and = Object.entries(grouped).map(
        ([key, values]) => ({
          $or: values.map(v => ({
            searchText: {
              $regex: `${key}:${v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
              $options: "i",
            }
          }))
        })
      );
    }


    const page = Number(req.query.page) || 1
    const limit = Number(req.query.limit) || 10
    const options = {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: [
        { path: 'institute', select: 'name ' },
        {
          path: "lead",          // ← virtual from Application
          select: "_id",
        },
      ]
    }

    const applications = await (Application as any).paginate(filter, options)
    const yearFilter: any = {}

    if (filter.instituteId) {
      yearFilter.instituteId = filter.instituteId
    }

    if (filter.createdAt) {
      yearFilter.createdAt = filter.createdAt
    }

    const academicYears = await Application.distinct("academicYear", yearFilter)

    const formkeyvalues = await formmanager.find({
      instituteId: filter.instituteId
    });

    let personalDetailsKeyValues: any[] = [];
    let educationDetailsKeyValues: any[] = [];
    if (formkeyvalues.length) {
      const form = formkeyvalues[0];

      personalDetailsKeyValues =
        extractKeyOptionsForFilter(form.personalDetails || []);

      educationDetailsKeyValues =
        extractKeyOptionsForFilter(form.educationDetails || []);
    }

    res.status(200).json({
      success: true,
      message: 'Applications fetched successfully',
      pagination: {
        totalDocs: applications.totalDocs,
        totalPages: applications.totalPages,
        currentPage: applications.page,
        limit: applications.limit
      },
      data: applications.docs,
      academicYears,
      filters: {
        personalDetails: personalDetailsKeyValues,
        educationDetails: educationDetailsKeyValues
      }
    })
  } catch (error: any) {
    console.error('Error fetching applications:', error)
    res.status(500).json({ success: false, message: error.message })
  }
}

// 🗑️ Delete Application (admin/superadmin only)
export const deleteApplication = async (req: AuthRequest, res: Response) => {
  try {
    const user = req.user;
    if (!user)
      return res.status(401).json({ success: false, message: "Not authorized" });

    if (user.role === "user") {
      return res.status(403).json({ success: false, message: "Access denied" });
    }

    // 1️⃣ Delete application
    const application = await Application.findByIdAndDelete(req.params.id);

    if (!application)
      return res
        .status(404)
        .json({ success: false, message: "Application not found" });

    // 2️⃣ Delete related student
    if (application.studentId) {
      await Student.findOneAndDelete({
        studentId: application.studentId,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Application and related student deleted successfully",
    });
  } catch (error: any) {
    console.error("❌ Delete error:", error);
    return res
      .status(500)
      .json({ success: false, message: error.message });
  }
};

export const updateAcademicYearInMatchedApplicationStudentx = async (req: AuthRequest, res: Response) => {
  try {
    // 1️⃣ Fetch all applications
    const applications = await Application.find();

    if (!applications || applications.length === 0) {
      return res.status(404).json({ success: false, message: "No applications found" });
    }

    // 2️⃣ Loop through each application and update the corresponding student
    for (const app of applications) {
      const personal = app.personalDetails.find(
        (s) => s.sectionName === "Personal Details"
      );

      const sibling = app.personalDetails.find(
        (s) => s.sectionName === "Sibling Details"
      );

      const bloodGroup = personal?.fields?.["Blood Group"] || "";
      const hostelWilling = personal?.fields?.["Hostel Required"] === "Yes";

      let siblingsCount = 0;
      let siblingsDetails: any[] = [];

      if (sibling?.fields) {
        siblingsCount = Number(sibling.fields["Sibling Count"] || 0);

        for (let i = 1; i <= siblingsCount; i++) {
          const studyingValue =
            sibling.fields[
            i === 1 ? "Sibling Studying" : `Sibling Studying ${i}`
            ];

          siblingsDetails.push({
            name:
              sibling.fields[i === 1 ? "Sibling Name" : `Sibling Name ${i}`] || "",
            age: Number(
              sibling.fields[i === 1 ? "Sibling Age" : `Sibling Age ${i}`] || 0
            ),
            status: mapSiblingStatus(studyingValue),
          });
        }
      }

      await Student.findOneAndUpdate(
        { applicationId: app.applicationId },
        {
          $set: {
            bloodGroup,
            hostelWilling,
            siblingsCount,
            siblingsDetails,
          },
        },
        { new: true }
      );
    }




    return res.status(200).json({
      success: true,
      message: "Academic year updated successfully in students",
    });
  } catch (error: any) {
    console.error("❌ Update error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
export const updateAcademicYearInMatchedApplicationStudent = async (req: AuthRequest, res: Response) => {
  try {
    const applications = await Application.find();

    if (!applications.length) {
      return res.status(404).json({
        success: false,
        message: "No applications found",
      });
    }

    let updated = 0;

    for (const app of applications) {
      const searchText = buildSearchTextFromSections(
        app.personalDetails || [],
        app.educationDetails || []
      );

      const result = await Application.updateOne(
        { _id: app._id },
        { $set: { searchText } }
      );

      if (result.modifiedCount > 0) updated++;
    }

    return res.status(200).json({
      success: true,
      message: "Search text rebuilt successfully",
      updatedRecords: updated,
    });
  } catch (error: any) {
    console.error("❌ Update error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
export const findUnmatchedStudentId = async (req: AuthRequest, res: Response) => {
  try {
    // 1. get all studentIds from Student collection
    const students = await Student.find({}, { studentId: 1, _id: 0 });
    const studentIdSet = new Set(students.map(s => s.studentId));

    // 2. get all applications
    const applications = await Application.find({}, { studentId: 1 });

    // 3. find unmatched
    const unmatchedApplications = applications.filter(
      app => !studentIdSet.has(app.studentId)
    );

    return res.status(200).json({
      success: true,
      totalApplications: applications.length,
      totalStudents: students.length,
      unmatchedCount: unmatchedApplications.length,
      unmatchedStudentIds: unmatchedApplications.map(a => a.studentId),
    });

  } catch (error: any) {
    console.error("❌ Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }

};

export const findUnmatchedStudentIds = async (req: AuthRequest, res: Response) => {
  try {
    // 1️⃣ Get all applicationIds from Application collection
    const applications = await Application.find({}, { applicationId: 1, _id: 0 });
    const applicationIdSet = new Set(applications.map(a => a.applicationId));

    // 2️⃣ Get all students
    const students = await Student.find({}, { studentId: 1, applicationId: 1, _id: 0 });

    // 3️⃣ Find students whose applicationId not in Application collection
    const unmatchedStudents = students.filter(
      (s: any) => !applicationIdSet.has(s.applicationId)
    );

    return res.status(200).json({
      success: true,
      totalApplications: applications.length,
      totalStudents: students.length,
      unmatchedCount: unmatchedStudents.length,
      unmatchedStudents: unmatchedStudents.map(s => ({
        studentId: s.studentId,
        applicationId: s.applicationId
      })),
    });

  } catch (error: any) {
    console.error("❌ Error:", error);
    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};





