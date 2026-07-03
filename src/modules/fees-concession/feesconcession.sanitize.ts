import Joi from "joi";

export const createFeeConcessionSchema = Joi.object({
  studentId: Joi.string().required(),
  reason: Joi.string().trim().required(),

  referralIds: Joi.array()
    .items(Joi.string())
    .min(1)
    .required(),

  counsellorName: Joi.string().trim().required(),

});