import Joi from "joi";

export const studentSchema = Joi.object({
  firstname: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.empty": "First name is required",
      "string.min": "First name must be at least 2 characters",
      "string.max": "First name cannot exceed 50 characters",
    }),

  lastname: Joi.string()
    .trim()
    .min(2)
    .max(50)
    .required()
    .messages({
      "string.empty": "Last name is required",
      "string.min": "Last name must be at least 2 characters",
      "string.max": "Last name cannot exceed 50 characters",
    }),

  email: Joi.string()
    .trim()
    .lowercase()
    .email({ tlds: { allow: false } })
    .required()
    .messages({
      "string.empty": "Email is required",
      "string.email": "Invalid email format",
    }),

  mobileNo: Joi.string()
    .trim()
    .pattern(/^[0-9]{10}$/)
    .required()
    .messages({
      "string.empty": "Mobile number is required",
      "string.pattern.base": "Mobile number must be 10 digits",
    }),

  instituteId: Joi.string()
    .trim()
    .required()
    .messages({
      "string.empty": "Institute ID is required",
    }),

  state: Joi.string()
    .trim()
    .required()
    .messages({
      "string.empty": "State is required",
    }),

  city: Joi.string()
    .trim()
    .required()
    .messages({
      "string.empty": "City is required",
    }),

  status: Joi.string()
    .valid("active", "inactive")
    .default("inactive"),
});
