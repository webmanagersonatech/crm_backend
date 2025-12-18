import { Request, Response } from "express"
import DynamicFormManager from "./model"
import { createDynamicFormSchema } from "./sanitize"
import { AuthRequest } from "../../middlewares/auth"

/* ===============================
   CREATE DYNAMIC FORM
================================ */
export const createDynamicForm = async (req: AuthRequest, res: Response) => {
  const { error, value } = createDynamicFormSchema.validate(req.body)
  if (error) {
    return res.status(400).json({ message: error.details[0].message })
  }

  const createdBy = req.user?.id
  if (!createdBy) {
    return res.status(401).json({ message: "Not authorized" })
  }

  const instituteId = value.instituteId || req.user?.instituteId

  // Optional: prevent duplicate title per institute
  const existingForm = await DynamicFormManager.findOne({
    instituteId,
    title: value.title
  })

  if (existingForm) {
    return res.status(400).json({
      message: "Form with this title already exists"
    })
  }

  const form = await DynamicFormManager.create({
    ...value,
    instituteId,
    createdBy
  })

  res.status(201).json(form)
}

/* ===============================
   LIST DYNAMIC FORMS (PAGINATED)
================================ */
export const listDynamicForms = async (req: AuthRequest, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      instituteId,
      title,
      startDate,
      endDate,
      userId
    } = req.query

    const user = req.user
    let filter: any = {}

    /* 🔹 Role-based filters */
    if (user.role === "superadmin") {
      if (instituteId) filter.instituteId = instituteId
    } else if (user.role === "admin") {
      filter.instituteId = user.instituteId
    } else {
      filter = { instituteId: user.instituteId, createdBy: user.id }
    }

    /* 🔹 Optional filters */

    if (title) filter.title = { $regex: title, $options: "i" }
    if (userId && user.role !== "user") {
      filter.createdBy = userId
    }

    /* 🔹 Date range filter */
    if (startDate || endDate) {
      const dateFilter: any = {}

      if (startDate) {
        const start = new Date(startDate as string)
        start.setHours(0, 0, 0, 0)
        dateFilter.$gte = start
      }

      if (endDate) {
        const end = new Date(endDate as string)
        end.setHours(23, 59, 59, 999)
        dateFilter.$lte = end
      }

      filter.createdAt = dateFilter
    }

    const options = {
      page: Number(page),
      limit: Number(limit),
      sort: { createdAt: -1 },
      populate: [
        { path: "creator", select: "firstname lastname role instituteId" },
        { path: "institute", select: "name" }
      ]
    }

    const result = await DynamicFormManager.paginate(filter, options)
    res.json(result)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

/* ===============================
   GET SINGLE FORM
================================ */
export const getDynamicForm = async (req: Request, res: Response) => {
  try {
    const form = await DynamicFormManager.findById(req.params.id)
      .populate("creator", "firstname lastname role instituteId")

    if (!form) {
      return res.status(404).json({ message: "Form not found" })
    }

    res.json(form)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

/* ===============================
   UPDATE FORM
================================ */
export const updateDynamicForm = async (req: AuthRequest, res: Response) => {
  try {
    const form = await DynamicFormManager.findById(req.params.id)
    if (!form) {
      return res.status(404).json({ message: "Form not found" })
    }

    Object.assign(form, req.body)
    await form.save()

    res.json(form)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}

/* ===============================
   DELETE FORM
================================ */
export const deleteDynamicForm = async (req: AuthRequest, res: Response) => {
  try {
    const form = await DynamicFormManager.findByIdAndDelete(req.params.id)
    if (!form) {
      return res.status(404).json({ message: "Form not found" })
    }

    res.json({ message: "Form deleted successfully" })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
}
