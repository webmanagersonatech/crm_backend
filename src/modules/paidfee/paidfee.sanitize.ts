import Joi from "joi";

/* ── Single entry (date + amount + description) ── */
const paidFeeEntrySchema = Joi.object({
  date: Joi.date().iso().required().messages({
    "date.base": "Date must be a valid date",
    "date.format": "Date must be in ISO format (YYYY-MM-DD)",
    "any.required": "Date is required",
  }),

  amount: Joi.number().positive().required().messages({
    "number.base": "Amount must be a number",
    "number.positive": "Amount must be greater than 0",
    "any.required": "Amount is required",
  }),

  description: Joi.string().allow("").trim().default(""),
});

/* ── Add Paid Fee ── */
export const addPaidFeeSchema = Joi.object({
  year: Joi.number().integer().min(1).max(10).required().messages({
    "number.base": "Year must be a number",
    "number.min": "Year must be at least 1",
    "any.required": "Year is required",
  }),

  programId: Joi.string().trim().allow("", null).optional(),

  entries: Joi.array()
    .items(paidFeeEntrySchema)
    .min(1)
    .required()
    .messages({
      "array.base": "Entries must be an array",
      "array.min": "At least one amount entry is required",
      "any.required": "Entries are required",
    }),
});

/* ── Update Paid Fee ── */
export const updatePaidFeeSchema = Joi.object({
  year: Joi.number().integer().min(1).max(10).optional(),

  entries: Joi.array()
    .items(paidFeeEntrySchema)
    .min(1)
    .required()
    .messages({
      "array.min": "At least one amount entry is required",
      "any.required": "Entries are required",
    }),
});