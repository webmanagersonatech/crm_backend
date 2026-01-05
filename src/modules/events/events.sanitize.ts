import Joi from 'joi';

export const createEventSchema = Joi.object({
  instituteId: Joi.string().optional(), // fallback to req.user.instituteId if not provided
  name: Joi.string().trim().required(),
  mobile: Joi.string()
    .trim()
    .pattern(/^\d{10,}$/)
    .required()
    .messages({
      'string.pattern.base': 'Mobile number must be at least 10 digits',
    }),
  email: Joi.string().trim().email().optional().allow(''),
  location: Joi.string().trim().optional().allow(''),
  eventName: Joi.string().trim().required(),
  enrolledDate: Joi.date().optional(),
  extraFields: Joi.object().optional(),
});
