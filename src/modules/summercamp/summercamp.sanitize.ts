import Joi from "joi";

/* =========================
   Sports Schema
========================= */
const sportsItemSchema = Joi.object({
  sport_name: Joi.string().trim().required(),

  skill_level: Joi.string()
    .valid("beginner", "intermediate", "advanced")
    .insensitive()
    .required(),

  duration: Joi.string().trim().required(),

  price: Joi.string()
    .pattern(/^[0-9]+$/)
    .required()
    .messages({
      "string.pattern.base": "Price must be numeric",
    }),

  timing: Joi.string().trim().required(),
});

/* =========================
   Main Schema
========================= */
export const summerCampSchema = Joi.object({
  // User input
  regno: Joi.string().trim().required(),

  name: Joi.string().trim().min(2).max(100).required(),

  mobile_no: Joi.string()
    .pattern(/^[6-9]\d{9}$/) // Indian mobile validation
    .required()
    .messages({
      "string.pattern.base": "Invalid mobile number",
    }),

  email_id: Joi.string()
    .email({ tlds: { allow: false } })
    .trim()
    .lowercase()
    .required(),

  gender: Joi.string()
    .valid("male", "female", "other")
    .insensitive(),

  dob: Joi.date().less("now").allow(null, ""),
  age: Joi.number().min(3).max(100).allow(null, ""),

  street_address: Joi.string().trim().allow(""),

  city: Joi.string().trim().allow(""),

  state_province: Joi.string().trim().allow(""),

  zip_postal: Joi.string()
    .pattern(/^[0-9]{5,10}$/)
    .allow("")
    .messages({
      "string.pattern.base": "Invalid postal code",
    }),

  allergies: Joi.string().trim().allow(""),

  allergyDetails: Joi.when("allergies", {
    is: Joi.string().valid("yes", "true").insensitive(),
    then: Joi.string().trim().required(),
    otherwise: Joi.string().trim().allow(""),
  }),

  medicalConditions: Joi.string().trim().allow(""),

  medicalConditionsDetails: Joi.string().trim().allow(""),

  medicalsCurrentlyTaking: Joi.string().trim().allow(""),

  sports: Joi.string().trim().allow(""),

  sportsData: Joi.array().items(sportsItemSchema).default([]),

  rollNumber: Joi.string().trim().allow(""),

  totalAmt: Joi.number().min(0).default(0),

  registrar: Joi.string().trim().required(),
})
  .options({
    abortEarly: false, // show all errors
    stripUnknown: true, // remove extra fields 🔥
  });