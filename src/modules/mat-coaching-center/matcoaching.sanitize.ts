import Joi from "joi";

/* =========================
   MAT Training Schema (ALL REQUIRED)
========================= */
export const matTrainingSchema = Joi.object({
  name: Joi.string()
    .trim()
    .min(2)
    .max(100)
    .required(),

  mobile: Joi.string()
    .pattern(/^[6-9]\d{9}$/) // Indian mobile
    .required()
    .messages({
      "string.pattern.base": "Invalid mobile number",
    }),

  email: Joi.string()
    .email()
    .trim()
    .lowercase()
    .required(),

  city: Joi.string()
    .trim()
    .min(2)
    .required(),

  ugDegree: Joi.string()
    .trim()
    .required(),

  ugCollege: Joi.string()
    .trim()
    .required(),

  studentWorking: Joi.string()
    .valid("Student", "Working", "Other")
    .insensitive()
    .required(),

  paymentScreenshot: Joi.string()
    .pattern(/^data:image\/(jpeg|png|jpg);base64,/)
    .required()
    .messages({
      "string.pattern.base": "Invalid image format (must be base64 image)",
    }),
});