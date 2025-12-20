import Joi from 'joi';

export const createApplicationSchema = Joi.object({
  instituteId: Joi.string().required().messages({
    'any.required': 'Institute ID is required',
    'string.empty': 'Institute ID cannot be empty'
  }),
  program: Joi.string().required().messages({
    'any.required': 'Program is required',
    'string.empty': 'Program cannot be empty',
  }),
  academicYear: Joi.string().required().messages({
    'any.required': 'Academic year is required'
  }),
  personalDetails: Joi.array().min(1).required().messages({
    'array.base': 'Personal details must be an array',
    'any.required': 'Personal details are required'
  }),
  educationDetails: Joi.array().optional().messages({
    'array.base': 'Education details must be an array'
  }),
  status: Joi.string().valid('Pending', 'Approved', 'Rejected').optional(),
  submittedAt: Joi.date().optional()
});
