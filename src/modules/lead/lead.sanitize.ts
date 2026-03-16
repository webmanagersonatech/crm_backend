import Joi from 'joi';

export const createLeadSchema = Joi.object({
  instituteId: Joi.string().required(),
  program: Joi.string().required(),
  candidateName: Joi.string().required(),
  ugDegree: Joi.string().optional().allow(''),
  phoneNumber: Joi.string().pattern(/^[6-9]\d{9}$/).required().messages({
    'string.pattern.base': 'Phone number must be 10 digits and start with 6, 7, 8, or 9',
    'any.required': 'Phone number is required',
    'string.empty': 'Phone number is required'
  }),
  email: Joi.string().email().optional().allow(''),
  dateOfBirth: Joi.date().optional(),
  country: Joi.string().optional(),
  state: Joi.string().optional(),
  city: Joi.string().optional(),
  status: Joi.string().optional(),
  communication: Joi.string().optional(),
  followUpDate: Joi.date().optional().allow(null, ""),
  description: Joi.string().optional().allow(''),
  leadSource: Joi.string().optional(),
  applicationId: Joi.string().optional().allow(null, ""),
  counsellorName: Joi.string().optional().allow(''),
  medium: Joi.string().allow("").optional(),
});
