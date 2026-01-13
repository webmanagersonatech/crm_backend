import Joi from 'joi';

export const createLeadSchema = Joi.object({
  instituteId: Joi.string().required(),
  program: Joi.string().required(),
  candidateName: Joi.string().required(),
  ugDegree: Joi.string().optional().allow(''),
  phoneNumber: Joi.string().optional(),
  email: Joi.string().email().optional().allow(''),
  dateOfBirth: Joi.date().optional(),
  country: Joi.string().optional(),
  state: Joi.string().optional(),
  city: Joi.string().optional(),
  status: Joi.string().optional(),
  communication: Joi.string().optional(),
  followUpDate: Joi.date().optional(),
  description: Joi.string().optional().allow(''),
  leadSource: Joi.string().optional(),
  applicationId: Joi.string().optional().allow(null, ""),
});
