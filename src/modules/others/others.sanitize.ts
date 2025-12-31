import Joi from 'joi';

export const createOtherSchema = Joi.object({
  instituteId: Joi.string().optional(), // will fallback to req.user.instituteId if not provided
  name: Joi.string().required(),
  phone: Joi.string().required(),
  date: Joi.date().optional(),
  dataSource: Joi.string().required(),
  description: Joi.string().optional().allow(''),
});
