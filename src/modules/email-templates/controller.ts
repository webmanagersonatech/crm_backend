import { Request, Response } from "express";
import EmailTemplate from "./model";
import { createEmailTemplateSchema } from "./sanitize";
import { AuthRequest } from "../../middlewares/auth";

/* ===============================
   CREATE TEMPLATE
================================ */
export const createEmailTemplate = async (
  req: AuthRequest,
  res: Response
) => {
  const { error, value } = createEmailTemplateSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ message: error.message });
  }

  const createdBy = req.user?.id;

  if (!createdBy) {
    return res.status(401).json({ message: "Not authorized" });
  }

  const instituteId = req.body.instituteId || req.user?.instituteId;

  // 🔒 Prevent duplicate title per institute
  const existing = await EmailTemplate.findOne({
    instituteId,
    title: value.title,
  });

  if (existing) {
    return res.status(400).json({
      message: "Template with this title already exists",
    });
  }

  const template = await EmailTemplate.create({
    ...value,
    instituteId,
    createdBy,
  });

  res.status(201).json(template);
};

/* ===============================
   LIST TEMPLATES
================================ */
export const listEmailTemplates = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const {
      page = 1,
      limit = 10,
      instituteId,
      title,
      userId,
    } = req.query;

    const user = req.user;
    let filter: any = {};

    // 🔹 Role-based filtering
    if (user.role === "superadmin") {
      if (instituteId) filter.instituteId = instituteId;
    } else if (user.role === "admin") {
      filter.instituteId = user.instituteId;
    } else {
      filter = {
        instituteId: user.instituteId,
        createdBy: user.id,
      };
    }

    // 🔹 Optional filters
    if (title) {
      filter.title = { $regex: title, $options: "i" };
    }

    if (userId && user.role !== "user") {
      filter.createdBy = userId;
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: "creator", select: "firstname lastname role" },
        { path: "institute", select: "name" },
      ],
    };

    const result = await EmailTemplate.paginate(filter, options);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const listAllEmailTemplates = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const { instituteId, title, userId } = req.query;
    const user = req.user;
    let filter: any = {};

    // 🔹 Role-based filtering
    if (user.role === "superadmin") {
      if (instituteId) filter.instituteId = instituteId;
    } else if (user.role === "admin") {
      filter.instituteId = user.instituteId;
    } else {
      filter = {
        instituteId: user.instituteId,
        createdBy: user.id,
      };
    }

    // 🔹 Optional filters
    if (title) {
      filter.title = { $regex: title, $options: "i" };
    }

    if (userId && user.role !== "user") {
      filter.createdBy = userId;
    }

    // 🔹 Fetch all templates without pagination
    const templates = await EmailTemplate.find(filter)
      .sort({ createdAt: -1 })
      .populate([
        { path: "creator", select: "firstname lastname role" },
        { path: "institute", select: "name" },
      ]);

    res.json(templates);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};


/* ===============================
   GET SINGLE TEMPLATE
================================ */
export const getEmailTemplate = async (
  req: Request,
  res: Response
) => {
  try {
    const template = await EmailTemplate.findById(req.params.id)
      .populate("creator", "firstname lastname role")
      .populate("institute", "name");

    if (!template) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json(template);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   UPDATE TEMPLATE
================================ */
export const updateEmailTemplate = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const template = await EmailTemplate.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Not found" });
    }

    // 🔒 Prevent title duplication on update
    if (req.body.title && req.body.title !== template.title) {
      const exists = await EmailTemplate.findOne({
        instituteId: template.instituteId,
        title: req.body.title,
        _id: { $ne: template._id },
      });

      if (exists) {
        return res.status(400).json({
          message: "Another template with this title already exists",
        });
      }
    }

    Object.assign(template, req.body);
    await template.save();

    res.json(template);
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

/* ===============================
   DELETE TEMPLATE
================================ */
export const deleteEmailTemplate = async (
  req: AuthRequest,
  res: Response
) => {
  try {
    const template = await EmailTemplate.findByIdAndDelete(req.params.id);
    if (!template) {
      return res.status(404).json({ message: "Not found" });
    }

    res.json({ message: "Template deleted successfully" });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};
