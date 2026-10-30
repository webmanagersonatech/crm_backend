import Joi from "joi";

/* =========================
   Main Schema — Sona Champs '26
========================= */
export const sonaChampsSchema = Joi.object({
  // Student
  studentName: Joi.string().trim().min(2).max(100).required().messages({
    "string.empty": "Student name is required",
    "string.min": "Student name must be at least 2 characters",
  }),

  class: Joi.string().trim().required().messages({
    "string.empty": "Class is required",
  }),

  gender: Joi.string()
    .valid("Male", "Female", "Other")
    .insensitive()
    .required()
    .messages({
      "any.only": "Gender must be Male, Female, or Other",
      "string.empty": "Gender is required",
    }),

  // School
  schoolName: Joi.string().trim().required().messages({
    "string.empty": "School name is required",
  }),

  schoolLocation: Joi.string().trim().required().messages({
    "string.empty": "School location is required",
  }),

  // ✅ Teacher Coordinator (Optional)
  teacherCoordinatorName: Joi.string().trim().allow("", null).optional(),
  teacherCoordinatorMobile: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .allow("", null)
    .optional()
    .messages({
      "string.pattern.base": "Invalid teacher mobile number",
    }),

  // ✅ Parent / Guardian (Name Optional, Mobile Required)
  parentGuardianName: Joi.string().trim().allow("", null).optional(),
  parentGuardianMobile: Joi.string()
    .pattern(/^[6-9]\d{9}$/)
    .required()
    .messages({
      "string.pattern.base": "Invalid parent mobile number",
      "string.empty": "Parent mobile number is required",
    }),

  // Event
  category: Joi.string()
    .valid("Junior", "Senior")
    .insensitive()
    .required()
    .messages({
      "any.only": "Category must be Junior or Senior", // ✅ Fixed error message
      "string.empty": "Category is required",
    }),

  event: Joi.string().trim().required().messages({
    "string.empty": "Event is required",
  }),
}).options({
  abortEarly: false,
  stripUnknown: true,
});

/* =========================
   Attendance-only update schema
========================= */
export const attendanceSchema = Joi.object({
  present: Joi.boolean().required(),
  markedBy: Joi.string().trim().allow("", null),
}).options({
  abortEarly: false,
  stripUnknown: true,
});