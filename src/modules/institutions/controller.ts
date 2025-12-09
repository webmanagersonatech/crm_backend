import { Request, Response } from 'express';
import Institution from './model';
import User from '../auth/auth.model';
import { createInstitutionSchema } from './institutions.sanitize';
import { AuthRequest } from '../../middlewares/auth';

export const createInstitution = async (req: AuthRequest, res: Response) => {
  const { error, value } = createInstitutionSchema.validate(req.body);
  if (error) return res.status(400).json({ message: error.message });

  const createdBy = req.user?.id;
  if (!createdBy) return res.status(401).json({ message: 'Not authorized' });

  try {
    const institution = await Institution.create({ ...value, createdBy });
    res.status(201).json({
      message: 'Institution created successfully',
      data: institution
    });

  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};


export const listInstitutions = async (req: Request, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || "";
    const status = (req.query.status as string) || "all";


    const query: any = {};


    if (search.trim()) {
      query.name = { $regex: search.trim(), $options: "i" };
    }


    if (status !== "all") {
      query.status = status;
    }


    const institutions = await (Institution as any).paginate(query, {
      page,
      limit,
      sort: { createdAt: -1 },
    });

    return res.status(200).json({
      status: true,
      institutions,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};


export const getInstitution = async (req: Request, res: Response) => {
  try {
    const institution = await Institution.findById(req.params.id);
    if (!institution) return res.status(404).json({ message: 'Not found' });
    res.json(institution);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const getActiveInstitutions = async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ message: 'Not authorized' });
    const institutions = await Institution.find({ status: "active" });
    return res.status(200).json({
      status: true,
      data: institutions,
    });
  } catch (err: any) {
    console.error(err);
    return res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
};

export const getActiveData = async (req: AuthRequest, res: Response) => {
  try {
    const role = req.user?.role?.toLowerCase();
    const instituteId = req.query.instituteId as string | undefined;

    let usersFilter: any = { status: "active" };
    let institutions: any[] = [];

    if (!role || role === "user") {
      // Regular users: send empty arrays
      return res.status(200).json({
        status: true,
        users: [],
        institutions: [],
      });
    }

    if (role === "superadmin") {
      // Superadmin: all active institutions
      institutions = await Institution.find({ status: "active" });
      // Exclude superadmins from user list
      usersFilter.role = { $ne: "superadmin" };
      // Filter by instituteId if provided
      if (instituteId) {
        usersFilter.instituteId = instituteId;
      }
    }
    if (role === "admin") {
      // Admin: only users from their institute, excluding admins
      usersFilter.instituteId = req.user.instituteId;
      usersFilter.role = { $ne: "admin" };
    }
    // Fetch users (exclude password)
    const users = await User.find(usersFilter).select("firstname lastname _id");

    return res.status(200).json({
      status: true,
      users,
      institutions,
    });

  } catch (err: any) {
    console.error(err);
    return res.status(500).json({
      status: false,
      message: err.message || "Server error",
    });
  }
};






export const updateInstitution = async (req: AuthRequest, res: Response) => {
  try {
    const institution = await Institution.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );

    if (!institution) {
      return res.status(404).json({ message: 'Not found' });
    }

    res.json(institution);
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteInstitution = async (req: AuthRequest, res: Response) => {
  try {
    const institution = await Institution.findByIdAndDelete(req.params.id);
    if (!institution) return res.status(404).json({ message: 'Not found' });

    res.json({ message: 'Institution deleted successfully' });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  }
};
