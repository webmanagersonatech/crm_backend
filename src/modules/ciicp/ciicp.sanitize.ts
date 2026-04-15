import Joi from "joi";

/* =========================
   CIICP Schema
========================= */
export const ciicpSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required(),

  fatherName: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required(),

  gender: Joi.string()
    .valid("Male", "Female", "Other")
    .insensitive()
    .required(),

  dob: Joi.date()
    .less("now")
    .required()
    .messages({
      "date.less": "DOB cannot be in the future",
    }),

  address: Joi.string()
    .trim()
    .min(5)
    .required(),

  district: Joi.string()
    .trim()
    .required(),

  phone: Joi.string()
    .pattern(/^[6-9]\d{9}$/) // Indian mobile
    .required()
    .messages({
      "string.pattern.base": "Invalid phone number",
    }),

  aadhaar: Joi.string()
    .pattern(/^\d{12}$/)
    .required()
    .messages({
      "string.pattern.base": "Aadhaar must be 12 digits",
    }),

  qualification: Joi.string()
    .trim()
    .required(),

  courses: Joi.array()
    .items(Joi.string().trim())
    .min(1)
    .required()
    .messages({
      "array.min": "At least one course is required",
    }),

  batch: Joi.string()
    .valid("FN", "AN", "EVE", "WK")
    .required(),
});