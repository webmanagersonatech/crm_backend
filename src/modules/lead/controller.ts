import { Request, Response } from 'express';
import Lead from './model';
import User from '../auth/auth.model';
import { createLeadSchema } from './lead.sanitize';
import { AuthRequest } from '../../middlewares/auth';


export const createLead = async (req: AuthRequest, res: Response) => {
  const { error, value } = createLeadSchema.validate(req.body);


  if (error) return res.status(400).json({ message: error.message });

  const createdBy = req.user?.id;
  if (!createdBy) return res.status(401).json({ message: 'Not authorized' });

  const instituteId = req.body.instituteId || req.user?.instituteId;

  const existingLead = await Lead.findOne({ phoneNumber: value.phoneNumber, instituteId });

  if (existingLead) {
    const existingUser = await User.findById(existingLead.createdBy).lean();
    const existingUserName = `${existingUser?.firstname || ''} ${existingUser?.lastname || ''}`.trim();

    return res.status(400).json({
      message: `Lead with this phone number already exists, created by ${existingUserName || 'another user'}.`
    });
  }
  const firstFollowUp = {
    status: value.status,
    communication: value.communication,
    followUpDate: value.followUpDate,
    description: value.description,

  };
  const lead = await Lead.create({ ...value, createdBy, instituteId, followups: [firstFollowUp], });
  res.json(lead);
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
      userId
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
    if (status) filter.status = status;
    if (communication) filter.communication = communication;
    if (candidateName) filter.candidateName = { $regex: candidateName, $options: "i" };
    if (userId && user.role !== "user") {
      filter.createdBy = userId;
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
        { path: "institute", select: "name" }
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
      followups,
      ...rest
    } = req.body;

    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).json({ message: 'Not found' });
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
        ...(status !== undefined && { status }),
        ...(communication !== undefined && { communication }),
        ...(followUpDate !== undefined && { followUpDate }),
        ...(description !== undefined && { description }),
        ...rest, // ✅ now safe (NO followups here)
      },
    };

    // ➕ Push followup separately
    if (isFollowUpChanged) {
      updateQuery.$push = {
        followups: {
          status,
          communication,
          followUpDate,
          description,
        },
      };
    }

    const updatedLead = await Lead.findByIdAndUpdate(
      id,
      updateQuery,
      { new: true }
    );

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
