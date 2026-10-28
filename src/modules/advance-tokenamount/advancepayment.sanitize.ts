import Joi from "joi";

export const createPaymentSchema = Joi.object({
  applicationId: Joi.string()
    .required()
    .messages({
      "any.required": "Application ID is required",
      "string.empty": "Application ID cannot be empty",
    }),

});