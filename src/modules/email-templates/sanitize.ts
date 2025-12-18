import Joi from "joi";

export const createEmailTemplateSchema = Joi.object({
  instituteId: Joi.string().required(),

  title: Joi.string()
    .trim()
    .min(3)
    .max(150)
    .required(),

  description: Joi.string()
    .required()
    .messages({
      "string.empty": "Description is required",
    }),
});
