import { Request, Response } from "express";
import FeeConcession from "./model";
import Student from "../students/model";
import { AuthRequest } from "../../middlewares/auth";
import { createFeeConcessionSchema } from "./feesconcession.sanitize";
import Permission from '../permissions/model';
import FeeConfiguration from "../fee-configuartion/model"
import Institution from "../institutions/model";
import User from "../auth/auth.model";
import Settings from "../settings/model";

/**
 * Create or Update Fee Concession (Upsert with Status Check)
 */
const SibApiV3Sdk = require('sib-api-v3-sdk');
const defaultClient = SibApiV3Sdk.ApiClient.instance;
defaultClient.authentications["api-key"].apiKey = process.env.BREVO_API_KEY;
const emailApi = new SibApiV3Sdk.TransactionalEmailsApi();

const sendFeeConcessionEmail = async (
  feeConcession: any,
  student: any,
  institution: any,
  action: 'created' | 'updated' | 'approved' | 'rejected',
  user?: any
) => {
  try {
    // 🔥 IMPORTANT: Find ONLY users who have permission to view/edit Fee Concession Approval
    // First, find all permission documents for this institute
    const permissionDocs = await Permission.find({
      instituteId: student.instituteId,
    });

    if (!permissionDocs.length) {
      console.log('No permission documents found for this institute');
      return;
    }

    // Extract user IDs who have Fee Concession Approval permission with view=true
    const userIdsWithPermission = permissionDocs
      .filter((doc: any) => {
        const feeConcessionPermission = doc.permissions?.find(
          (p: any) => p.moduleName === "Fee Concession Approval"
        );
        // Check if user has view permission (they need to see it to take action)
        return feeConcessionPermission?.view === true;
      })
      .map((doc: any) => doc.userId.toString());

    if (!userIdsWithPermission.length) {
      console.log('No users with Fee Concession Approval permission found');
      return;
    }

    // Get the actual user details for these IDs
    const instituteUsers = await User.find({
      _id: { $in: userIdsWithPermission },
      instituteId: student.instituteId,
      status: 'active', // Only active users
    });

    if (!instituteUsers.length) {
      console.log('No active users found with permission');
      return;
    }

    console.log(`📧 Sending email to ${instituteUsers.length} users with permission`);

    // Get fee configuration for detailed fee breakdown
    const feeConfiguration = await FeeConfiguration.findOne({
      instituteId: student.instituteId
    });

    let courseDetails = null;
    let yearDetails = null;

    if (feeConfiguration) {
      const course = feeConfiguration.courseFeeStructure?.find(
        (c: any) => c.courseId === student.programId
      );
      if (course) {
        courseDetails = course;
        yearDetails = course.years?.[0];
      }
    }

    // Calculate discount details
    const referrals = (feeConcession.referralIds || []).map((id: string) => {
      const referral = feeConfiguration?.referrals?.find(
        (ref: any) => ref.referralId === id
      );
      return {
        name: referral?.name || 'Unknown',
        percentage: referral?.percentage || 0
      };
    });

    const totalDiscountPercentage = referrals.reduce(
      (sum: number, ref: any) => sum + (ref.percentage || 0), 0
    );

    const tuitionFee = yearDetails?.tuitionFee || 0;
    const otherFee = yearDetails?.otherFee || 0;
    const originalAmount = tuitionFee + otherFee;
    const discountAmount = (tuitionFee * totalDiscountPercentage) / 100;
    const discountedTuition = tuitionFee - discountAmount;
    const finalAmount = discountedTuition + otherFee;

    // Build email content based on action
    const actionMap = {
      created: {
        subject: `New Fee Concession Request - ${student.firstname} ${student.lastname}`,
        heading: 'New Fee Concession Request Submitted',
        status: 'Pending Review',
        color: '#FF9800'
      },
      updated: {
        subject: `Fee Concession Updated - ${student.firstname} ${student.lastname}`,
        heading: 'Fee Concession Request Updated',
        status: 'Pending Review (Updated)',
        color: '#2196F3'
      },
      approved: {
        subject: `Fee Concession Approved - ${student.firstname} ${student.lastname}`,
        heading: 'Fee Concession Request Approved ✅',
        status: 'Approved',
        color: '#4CAF50'
      },
      rejected: {
        subject: `Fee Concession Rejected - ${student.firstname} ${student.lastname}`,
        heading: 'Fee Concession Request Rejected ❌',
        status: 'Rejected',
        color: '#F44336'
      }
    };

    const actionInfo = actionMap[action] || actionMap.created;

    const createdBy = user || feeConcession.createdBy;
    const creatorName = createdBy ?
      `${createdBy.firstname || ''} ${createdBy.lastname || ''}`.trim() :
      'System';

    // Generate referrals HTML
    const referralsHtml = referrals.length
      ? referrals.map((ref: any) => `
          <tr>
            <td style="padding: 8px; border: 1px solid #ddd;">${ref.name}</td>
            <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${ref.percentage}%</td>
          </tr>
        `).join('')
      : '<tr><td colspan="2" style="padding: 8px; text-align: center;">No referrals applied</td></tr>';

    // Create the HTML content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #f9f9f9;">
        <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
          <h2 style="color: #333; border-bottom: 3px solid ${actionInfo.color}; padding-bottom: 10px;">
            ${actionInfo.heading}
          </h2>
          
          <div style="margin: 20px 0; padding: 15px; background: #f5f5f5; border-radius: 5px;">
            <p><strong>Status:</strong> <span style="color: ${actionInfo.color}; font-weight: bold;">${actionInfo.status}</span></p>
            <p><strong>Student:</strong> ${student.firstname} ${student.lastname}</p>
            <p><strong>Student ID:</strong> ${student.studentId}</p>
            <p><strong>Application ID:</strong> ${student.applicationId || 'N/A'}</p>
            <p><strong>Institute:</strong> ${institution?.name || 'N/A'}</p>
            <p><strong>Course:</strong> ${courseDetails?.name || 'N/A'}</p>
            <p><strong>Counselor:</strong> ${feeConcession.counsellorName || 'N/A'}</p>
            <p><strong>Reason:</strong> ${feeConcession.reason || 'Not provided'}</p>
          </div>

          <h3 style="color: #555; margin-top: 25px;">Fee Breakdown</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background: white;">
            <tr style="background: #f0f0f0;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Description</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: right;">Amount</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Tuition Fee</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹${tuitionFee.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Other Fee</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹${otherFee.toLocaleString()}</td>
            </tr>
            <tr>
              <td style="padding: 8px; border: 1px solid #ddd;">Total Original Amount</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right;">₹${originalAmount.toLocaleString()}</td>
            </tr>
            <tr style="background: #fff3e0;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Discount Applied</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; color: #e65100; font-weight: bold;">
                -₹${discountAmount.toLocaleString()} (${totalDiscountPercentage}%)
              </td>
            </tr>
            <tr style="background: ${actionInfo.color}; color: white;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Final Amount</td>
              <td style="padding: 8px; border: 1px solid #ddd; text-align: right; font-weight: bold;">
                ₹${finalAmount.toLocaleString()}
              </td>
            </tr>
          </table>

          <h3 style="color: #555; margin-top: 25px;">Referrals Applied</h3>
          <table style="width: 100%; border-collapse: collapse; margin: 10px 0; background: white;">
            <tr style="background: #f0f0f0;">
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold;">Referral Name</td>
              <td style="padding: 8px; border: 1px solid #ddd; font-weight: bold; text-align: center;">Discount %</td>
            </tr>
            ${referralsHtml}
          </table>

          <div style="margin-top: 30px; padding: 15px; background: #e3f2fd; border-radius: 5px;">
            <p style="margin: 0; font-size: 14px;">
              <strong>Request Created:</strong> ${new Date(feeConcession.createdAt).toLocaleString()}
            </p>
            <p style="margin: 5px 0 0; font-size: 14px;">
              <strong>Created By:</strong> ${creatorName}
            </p>
            ${action === 'approved' ? `
              <p style="margin: 5px 0 0; font-size: 14px; color: #4CAF50;">
                <strong>Approved At:</strong> ${new Date(feeConcession.approvedAt).toLocaleString()}
              </p>
            ` : ''}
            ${action === 'rejected' ? `
              <p style="margin: 5px 0 0; font-size: 14px; color: #F44336;">
                <strong>Rejected At:</strong> ${new Date(feeConcession.rejectedAt).toLocaleString()}
              </p>
            ` : ''}
          </div>

          <div style="margin-top: 20px; text-align: center; font-size: 12px; color: #999;">
            <p>This is an automated notification. Please contact the administration for any questions.</p>
            <p>&copy; ${new Date().getFullYear()} HIKA Education Platform</p>
          </div>
        </div>
      </div>
    `;

    // Send email only to users with permission
    const emailPromises = instituteUsers.map((user: any) => {
      console.log(`📧 Sending email to: ${user.email} (${user.firstname} ${user.lastname})`);
      return emailApi.sendTransacEmail({
        sender: { email: "no-reply@sonatech.ac.in", name: "HIKA Fee Concession" },
        to: [{ email: user.email, name: `${user.firstname} ${user.lastname}` }],
        subject: actionInfo.subject,
        htmlContent,
      }).then((response: any) => {
        console.log(`✅ Email sent to ${user.email}: ${response.messageId}`);
        return { email: user.email, success: true, messageId: response.messageId };
      }).catch((err: any) => {
        console.error(`❌ Failed to send email to ${user.email}:`, err.message);
        return { email: user.email, success: false, error: err.message };
      });
    });

    const results = await Promise.all(emailPromises);

    const successCount = results.filter(r => r.success).length;
    console.log(`✅ Fee concession email sent to ${successCount}/${instituteUsers.length} users with permission`);

    return results;

  } catch (error: any) {
    console.error('❌ Error sending fee concession email:', error);
    return null;
  }
};
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
        programId: student.programId,
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
        programId: student.programId,
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
  req: AuthRequest,
  res: Response
) => {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Permission Check
    if (user.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: user.instituteId,
        userId: user.id,
      });

      const permission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Fee Concession Approval"
      );

      if (!permission?.view) {
        return res.status(403).json({
          success: false,
          message: "You have no permission to view this data",
        });
      }
    }

    // Query Params
    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const search = (req.query.search as string)?.trim() || "";
    const status = (req.query.status as string) || "all";
    const instituteId = req.query.instituteId as string;

    // Build Query
    const query: any = {};

    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        query.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      query.instituteId = user.instituteId;
    } else {
      query.instituteId = user.instituteId;
      query.createdBy = user.id;
    }

    if (status !== "all") {
      query.status = status;
    }

    if (req.query.program) {
      if (Array.isArray(req.query.program)) {
        query.programId = { $in: req.query.program }; // ✅ use programId field
      } else {
        query.programId = req.query.program;
      }
    }

    // Enhanced Search - Now searches across student fields and counselor name
    if (search) {
      // First, find students that match the search criteria
      const studentMatchQuery: any = {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { mobileNo: { $regex: search, $options: "i" } },
        ]
      };

      // Apply institute filter to student search if applicable
      if (query.instituteId) {
        studentMatchQuery.instituteId = query.instituteId;
      }

      // Find matching student IDs
      const matchingStudents = await Student.find(studentMatchQuery)
        .select('_id')
        .lean();

      const studentIds = matchingStudents.map((s: any) => s._id);

      // Build the final search query for fee concessions
      query.$or = [
        // Search by counselor name
        { counsellorName: { $regex: search, $options: "i" } },
        // Search by reason
        { reason: { $regex: search, $options: "i" } },
        // Search by student ID from the matching students
        ...(studentIds.length > 0 ? [{ studentId: { $in: studentIds } }] : [])
      ];
    }

    // Get Fee Concessions
    const feeConcessions = await (FeeConcession as any).paginate(query, {
      page,
      limit,
      sort: {
        createdAt: -1,
      },
      populate: [
        {
          path: "student",
          select:
            "studentId firstname lastname applicationId programId admissionNumber classSection mobileNo email instituteId",
        },
        {
          path: "creator",
          select: "firstname lastname designation role",
        },
        {
          path: "approver",
          select: "firstname lastname designation role",
        },
      ],
      lean: true,
    });

    // Get all Fee Configurations
    const feeConfigurations = await FeeConfiguration.find().lean();

    const feeConfigMap = new Map();

    feeConfigurations.forEach((config: any) => {
      feeConfigMap.set(config.instituteId, config);
    });

    // Get all institutions for the students
    const instituteIds = feeConcessions.docs
      .map((item: any) => item.student?.instituteId)
      .filter(Boolean);

    // Get unique institute IDs
    const uniqueInstituteIds = [...new Set(instituteIds)];

    // Fetch all institutions
    const institutions = await Institution.find({
      instituteId: { $in: uniqueInstituteIds }
    }).lean();

    const institutionMap = new Map();
    institutions.forEach((inst: any) => {
      institutionMap.set(inst.instituteId, inst);
    });

    // Response
    const docs = feeConcessions.docs.map((item: any) => {
      const student = item.student || {};
      const creator = item.creator || {};
      const approver = item.approver || {};

      const feeConfiguration = feeConfigMap.get(item.instituteId);

      const referralMap = new Map();
      const courseFeeMap = new Map();

      feeConfiguration?.referrals?.forEach((ref: any) => {
        referralMap.set(ref.referralId, ref);
      });

      feeConfiguration?.courseFeeStructure?.forEach((course: any) => {
        courseFeeMap.set(course.courseId, course);
      });

      const course = courseFeeMap.get(student.programId);
      const year = course?.years?.[0];

      // Get institution from map
      const institution = institutionMap.get(student.instituteId);

      // Build referrals array
      const referrals = (item.referralIds || []).map((id: string) => {
        const referral = referralMap.get(id);
        return {
          referralId: id,
          name: referral?.name || "",
          percentage: referral?.percentage || 0,
        };
      });

      // Calculate total discount percentage
      const totalDiscountPercentage = referrals.reduce((sum: number, ref: any) => {
        return sum + (ref.percentage || 0);
      }, 0);

      // Get tuition fee and other fee from the year
      const tuitionFee = year?.tuitionFee || 0;
      const otherFee = year?.otherFee || 0;
      const originalAmount = tuitionFee + otherFee;

      // Calculate discount amount - ONLY ON TUITION FEE
      const discountAmount = (tuitionFee * totalDiscountPercentage) / 100;

      // Calculate discounted tuition fee
      const discountedTuition = tuitionFee - discountAmount;

      // Final amount = discounted tuition + other fee (other fee remains static)
      const finalAmount = discountedTuition + otherFee;

      // Get payment option details from fee configuration
      let paymentOption = null;
      if (item.paymentOptionId && feeConfiguration) {
        // Find the payment option from the course structure
        const courseWithPayment = feeConfiguration.courseFeeStructure?.find(
          (c: any) => c.courseId === student.programId
        );

        if (courseWithPayment) {
          const yearData = courseWithPayment.years?.[0];
          if (yearData) {
            const foundOption = yearData.paymentOptions?.find(
              (opt: any) => opt.paymentOptionId === item.paymentOptionId
            );
            if (foundOption) {
              paymentOption = {
                paymentOptionId: foundOption.paymentOptionId,
                name: foundOption.name,
                type: foundOption.type,
                installmentCount: foundOption.installments?.length || 0
              };
            }
          }
        }
      }

      return {
        _id: item._id,
        student: {
          _id: student._id,
          studentId: student.studentId,
          applicationId: student.applicationId,
          programId: student.programId,
          firstname: student.firstname,
          lastname: student.lastname,
          fullName: `${student.firstname ?? ""} ${student.lastname ?? ""}`.trim(),
          email: student.email,
          mobileNo: student.mobileNo,
          institute: institution ? institution.name : "",
          feeConcessiondeatils: {
            courseId: course?.courseId || "",
            name: course?.name || "",
            amount: originalAmount,
            tuitionFee: tuitionFee,
            otherFee: otherFee,
            discountedTuition: discountedTuition,
            discountAmount: discountAmount,
            totalDiscountPercentage: totalDiscountPercentage,
            finalAmount: finalAmount,
            referrals: referrals,
            reason: item.reason,
            counsellorName: item.counsellorName,
            status: item.status,
            createdAt: item.createdAt,
            paymentOptionId: item.paymentOptionId || null, // ADDED: payment option ID
            paymentOption: paymentOption, // ADDED: full payment option details
            breakdown: {
              tuitionFee: tuitionFee,
              otherFee: otherFee,
              discountApplied: `-₹${discountAmount.toLocaleString()} (${totalDiscountPercentage}% on tuition)`,
              finalTuition: discountedTuition,
              finalTotal: finalAmount
            }
          }
        },
        createdBy: creator?._id
          ? {
            _id: creator._id,
            firstname: creator.firstname,
            lastname: creator.lastname,
            designation: creator.designation,
            role: creator.role,
          }
          : null,
        approvedBy: approver?._id
          ? {
            _id: approver._id,
            firstname: approver.firstname,
            lastname: approver.lastname,
            designation: approver.designation,
            role: approver.role,
          }
          : null,
      };
    });

    const statsQuery: any = {};

    // Apply same filters as list
    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        statsQuery.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      statsQuery.instituteId = user.instituteId;
    } else {
      statsQuery.instituteId = user.instituteId;
      statsQuery.createdBy = user.id;
    }

    // Apply search filter also if needed for stats
    if (search) {
      // Reuse the same search logic for stats
      const studentMatchQuery: any = {
        $or: [
          { studentId: { $regex: search, $options: "i" } },
          { firstname: { $regex: search, $options: "i" } },
          { lastname: { $regex: search, $options: "i" } },
          { email: { $regex: search, $options: "i" } },
          { mobileNo: { $regex: search, $options: "i" } },
        ]
      };

      if (statsQuery.instituteId) {
        studentMatchQuery.instituteId = statsQuery.instituteId;
      }

      const matchingStudents = await Student.find(studentMatchQuery)
        .select('_id')
        .lean();

      const studentIds = matchingStudents.map((s: any) => s._id);

      statsQuery.$or = [
        { counsellorName: { $regex: search, $options: "i" } },
        { reason: { $regex: search, $options: "i" } },
        ...(studentIds.length > 0 ? [{ studentId: { $in: studentIds } }] : [])
      ];
    }

    // Get Counts
    const [pendingCount, approvedCount, rejectedCount, totalCount] =
      await Promise.all([
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "pending",
        }),
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "approved",
        }),
        FeeConcession.countDocuments({
          ...statsQuery,
          status: "rejected",
        }),
        FeeConcession.countDocuments(statsQuery),
      ]);

    const stats = {
      total: totalCount,
      pending: pendingCount,
      approved: approvedCount,
      rejected: rejectedCount,
    };

    const settings = await Settings.findOne({ instituteId: query.instituteId });
    let courses = settings?.courses || [];

    return res.status(200).json({
      success: true,
      data: {
        docs,
        courses,
        stats,
        totalDocs: feeConcessions.totalDocs,
        limit: feeConcessions.limit,
        totalPages: feeConcessions.totalPages,
        page: feeConcessions.page,
        pagingCounter: feeConcessions.pagingCounter,
        hasPrevPage: feeConcessions.hasPrevPage,
        hasNextPage: feeConcessions.hasNextPage,
        prevPage: feeConcessions.prevPage,
        nextPage: feeConcessions.nextPage,
      },
    });
  } catch (err: any) {
    console.error("List Fee Concessions Error:", err);

    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
    });
  }
};
export const updateFeeConcessionStatus = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const userId = req.user?.id;

    // Validate required fields
    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Fee concession ID is required",
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: "Status is required. Please provide 'approved' or 'rejected'",
      });
    }

    // Validate status value
    if (!['approved', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status. Only 'approved' or 'rejected' are allowed",
      });
    }

    // Check authorization
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Not authorized",
      });
    }

    // Find the fee concession
    const feeConcession = await FeeConcession.findById(id);




    if (!feeConcession) {
      return res.status(404).json({
        success: false,
        message: "Fee concession not found",
      });
    }



    // Permission Check - User should have permission to approve/reject
    if (req.user?.role !== "superadmin") {
      const permissionDoc = await Permission.findOne({
        instituteId: req.user?.instituteId,
        userId: req.user?.id,
      });

      const permission = permissionDoc?.permissions.find(
        (p: any) => p.moduleName === "Fee Concession Approval"
      );

      if (!permission?.edit) {
        return res.status(403).json({
          success: false,
          message: "You don't have permission to update fee concession status",
        });
      }
    }

    // Prepare update data based on status
    const updateData: any = {
      status: status,
      updatedBy: userId,
      updatedAt: new Date(),
    };

    // Set appropriate fields based on status
    if (status === 'approved') {
      updateData.approvedBy = userId;
      updateData.approvedAt = new Date();
      // Clear rejection fields if any
      updateData.rejectedBy = null;
      updateData.rejectedAt = null;
    } else if (status === 'rejected') {
      updateData.rejectedBy = userId;
      updateData.rejectedAt = new Date();
      // Clear approval fields if any
      updateData.approvedBy = null;
      updateData.approvedAt = null;
    }

    // Update the fee concession
    const updatedFeeConcession = await FeeConcession.findByIdAndUpdate(
      id,
      updateData,
      {
        new: true,
        runValidators: true,
      }
    )


    // Return success response
    const statusMessages = {
      approved: "Fee concession approved successfully",
      rejected: "Fee concession rejected successfully"
    };

    return res.status(200).json({
      success: true,
      message: statusMessages[status as keyof typeof statusMessages],
      data: updatedFeeConcession,
    });

  } catch (err: any) {
    console.error("Update Fee Concession Status Error:", err);
    return res.status(500).json({
      success: false,
      message: err.message || "Internal Server Error",
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
