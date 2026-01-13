import { Request, Response } from 'express';
import Lead from './model';
import User from '../auth/auth.model';
import { createLeadSchema } from './lead.sanitize';
import Application from '../applications/model';
import { AuthRequest } from '../../middlewares/auth';


export const createLead = async (req: AuthRequest, res: Response) => {
  const { error, value } = createLeadSchema.validate(req.body);

  if (error) return res.status(400).json({ message: error.message });

  const createdBy = req.user?.id;
  if (!createdBy) return res.status(401).json({ message: 'Not authorized' });

  const instituteId = req.body.instituteId || req.user?.instituteId;

  const existingLeads = await Lead.find({
    phoneNumber: value.phoneNumber,
    instituteId,
  });

  let duplicateReason = null;

  if (existingLeads.length > 0) {
    // Collect all existing lead IDs
    const duplicateLeadIds = existingLeads.map(lead => lead.leadId.toString());

    // Set duplicate reason
    duplicateReason = `A lead with this phone number already exists in our system (${existingLeads.length} duplicate${existingLeads.length > 1 ? 's' : ''}). Existing Lead IDs: ${duplicateLeadIds.join(", ")}. Please review before follow-up.`;
  }

  const user = await User.findById(createdBy).lean();

  const calltaken =
    `${user?.firstname || ""} ${user?.lastname || ""}`.trim();
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
    await Application.findOneAndUpdate(
      { applicationId: value.applicationId },
      { $set: { leadId: lead.leadId }, interactions: lead.status, },
      { new: true }
    );
  }


  res.json(lead);
};

export const createLeadfromonline = async (req: AuthRequest, res: Response) => {
  const { error, value } = createLeadSchema.validate(req.body);
  if (error) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  const instituteId = req.body.instituteId;

  // Find all existing leads with the same phone number for this institute
  const existingLeads = await Lead.find({
    phoneNumber: value.phoneNumber,
    instituteId,
  });

  let duplicateReason = null;

  if (existingLeads.length > 0) {
    // Collect all existing lead IDs
    const duplicateLeadIds = existingLeads.map(lead => lead.leadId.toString());

    // Set duplicate reason
    duplicateReason = `A lead with this phone number already exists in our system (${existingLeads.length} duplicate${existingLeads.length > 1 ? 's' : ''}). Existing Lead IDs: ${duplicateLeadIds.join(", ")}. Please review before follow-up.`;
  }

  const firstFollowUp = {
    status: value.status || "New",
    calltaken: value.calltaken || "",
    communication: value.communication || "Online",
    followUpDate: value.followUpDate ? new Date(value.followUpDate) : new Date(),
    description: value.description || "This lead enquiry has come from online",
  };

  const lead = await Lead.create({
    ...value,
    instituteId,
    followups: [firstFollowUp],
    isduplicate: existingLeads.length > 0,
    duplicateReason,
  });

  return res.status(201).json({
    success: true,
    message: "Enquiry submitted successfully",
    data: lead,

  });
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
    if (city) filter.city = city;

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
      return res.status(404).json({ message: 'Not found' });
    }

    let isduplicate: boolean = lead.isduplicate;
    let duplicateReason: string = lead.duplicateReason || "";
    if (phoneNumber && phoneNumber !== lead.phoneNumber) {
      const duplicates = await Lead.find({
        phoneNumber,
        instituteId: lead.instituteId,
        _id: { $ne: id }, // exclude current lead
      }).select("leadId");

      if (duplicates.length > 0) {
        isduplicate = true;
        duplicateReason =
          `Phone number already exists in lead(s): ${duplicates
            .map(d => d.leadId)
            .join(", ")}`;
      } else {
        // ✅ no duplicates → clear flag
        isduplicate = false;
        duplicateReason = "";
      }
    }

    // 🔹 Normalize date
    const oldDate = lead.followUpDate
      ? new Date(lead.followUpDate).toISOString().split('T')[0]
      : '';

    const newDate = followUpDate
      ? new Date(followUpDate).toISOString().split('T')[0]
      : '';

    const isFollowUpChanged =
      status !== lead.status ||
      communication !== lead.communication ||
      description !== lead.description ||
      newDate !== oldDate;

    // ✅ Build update safely
    const updateQuery: any = {
      $set: {
        ...(phoneNumber !== undefined && { phoneNumber }),
        ...(status !== undefined && { status }),
        ...(communication !== undefined && { communication }),
        ...(followUpDate !== undefined && { followUpDate }),
        ...(description !== undefined && { description }),
        isduplicate,
        duplicateReason,
        ...rest, // ✅ now safe (NO followups here)
      },
    };

    // ➕ Push followup separately
    if (isFollowUpChanged) {
      const user = await User.findById(req.user?.id).lean();
      const calltaken =
        `${user?.firstname || ""} ${user?.lastname || ""}`.trim();
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

    if (updatedLead?.applicationId) {
      await Application.findOneAndUpdate(
        { applicationId: updatedLead.applicationId },
        { interactions: updatedLead.status },
        { new: true }
      );
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
