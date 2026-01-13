import { Response } from "express";
import Lead from "../lead/model";
import Application from "../applications/model";
import Institution from "../institutions/model";
import { AuthRequest } from "../../middlewares/auth";


export const dashboardData = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, instituteId, page = 1,
      limit = 5, } = req.query;
    const user = req.user;

    if (!user) return res.status(401).json({ message: "Not authorized" });

    // ------------------ BASE FILTERS ------------------
    let leadFilter: any = {};
    let appFilter: any = {};

    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        leadFilter.instituteId = instituteId;
        appFilter.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      leadFilter.instituteId = user.instituteId;
      appFilter.instituteId = user.instituteId;
    } else {
      leadFilter = { instituteId: user.instituteId, createdBy: user.id };
      appFilter = { instituteId: user.instituteId, userId: user.id };
    }

    // ------------------ CREATED DATE FILTER (for Leads & Applications only) ------------------
    if (startDate || endDate) {
      const createdFilter: any = {};

      if (startDate) {
        const s = new Date(startDate as string);
        s.setHours(0, 0, 0, 0);
        createdFilter.$gte = s;
      }

      if (endDate) {
        const e = new Date(endDate as string);
        e.setHours(23, 59, 59, 999);
        createdFilter.$lte = e;
      }

      leadFilter.createdAt = createdFilter;
      appFilter.createdAt = createdFilter;
    }
    const { createdAt, ...leadBaseFilter } = leadFilter;
    // ------------------ FOLLOWUP LEAD FILTER (ONLY followUpDate) ------------------
    const today = new Date();
    today.setHours(0, 0, 0, 0); // today at 00:00

    // ------------------ FOLLOWUP LEAD FILTER (ONLY followUpDate) ------------------
    const followUpLeadFilter: any = {
      ...leadBaseFilter, // institute/user filter without createdAt
      status: "Followup"
    };

    if (startDate || endDate) {
      const followUpRange: any = {};

      // filter start
      if (startDate) {
        const s = new Date(startDate as string);
        s.setHours(0, 0, 0, 0);
        followUpRange.$gte = s;
      } else {
        followUpRange.$gte = today; // default start = today
      }

      // filter end
      if (endDate) {
        const e = new Date(endDate as string);
        e.setHours(23, 59, 59, 999);
        followUpRange.$lte = e;
      }

      followUpLeadFilter.followups = {
        $elemMatch: {
          status: "Followup",
          followUpDate: followUpRange
        }
      };
    } else {
      // no filter → all future followups
      followUpLeadFilter.followups = {
        $elemMatch: {
          status: "Followup",
          followUpDate: { $gte: today }
        }
      };
    }

    const followUpLeads = await Lead.countDocuments(followUpLeadFilter);







    // ------------------ DASHBOARD COUNTS ------------------
    const [
      totalInstitutes,
      totalLeads,
      totalApplications,
      paidApplications,
      unpaidApplications,
      closedLeads,
      notInterestedLeads
    ] = await Promise.all([
      Institution.countDocuments(),
      Lead.countDocuments(leadFilter),
      Application.countDocuments(appFilter),
      Application.countDocuments({ ...appFilter, paymentStatus: "Paid" }),
      Application.countDocuments({ ...appFilter, paymentStatus: "Unpaid" }),
      Lead.countDocuments({ ...leadFilter, status: "Closed" }),
      Lead.countDocuments({ ...leadFilter, status: "Not Interested" })
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalInstitutes,
        totalLeads,
        followUpLeads,
        totalApplications,
        paidApplications,
        unpaidApplications,
        closedLeads,
        notInterestedLeads
      }
    });

  } catch (error: any) {
    console.error("❌ Dashboard Data Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};



export const getNewAndFollowupLeads = async (req: AuthRequest, res: Response) => {
  try {
    const { startDate, endDate, instituteId, page = 1, limit = 20 } = req.query;
    const user = req.user;
    if (!user) return res.status(401).json({ message: "Not authorized" });

    // ------------------ BASE FILTER ------------------
    let leadBaseFilter: any = {};
    if (user.role === "superadmin") {
      if (instituteId && instituteId !== "all") {
        leadBaseFilter.instituteId = instituteId;
      }
    } else if (user.role === "admin") {
      leadBaseFilter.instituteId = user.instituteId;
    } else {
      leadBaseFilter.instituteId = user.instituteId;
      leadBaseFilter.createdBy = user.id;
    }

    // ------------------ CREATED DATE RANGE ------------------
    if (startDate || endDate) {
      const createdFilter: any = {};
      if (startDate) {
        const s = new Date(startDate as string);
        s.setHours(0, 0, 0, 0);
        createdFilter.$gte = s;
      }
      if (endDate) {
        const e = new Date(endDate as string);
        e.setHours(23, 59, 59, 999);
        createdFilter.$lte = e;
      }
      leadBaseFilter.createdAt = createdFilter;
    }

    // ------------------ NEW + FOLLOWUP FILTER ------------------
    const filter: any = {
      ...leadBaseFilter,
      $or: [
        { status: "New" },
        { status: "Followup" } // no followUpDate filter
      ]
    };

    // ------------------ FETCH WITH PAGINATION ------------------
    const leads = await Lead.paginate(filter, {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 }
    });

    return res.status(200).json({
      success: true,
      data: leads
    });
  } catch (error: any) {
    console.error("❌ New+Followup Leads Error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};




