import Joi from 'joi';

export const feeConfigurationSchema = Joi.object({
  instituteId: Joi.string().required(),

  courseFeeStructure: Joi.array()
    .items(
      Joi.object({
        courseId: Joi.string().required(),
        name: Joi.string().required(),

        years: Joi.array()
          .items(
            Joi.object({
              year: Joi.string().required(),
              amount: Joi.number().min(0).required(),
            })
          )
          .min(1)
          .required(),
      })
    )
    .required(),

  referrals: Joi.array()
    .items(
      Joi.object({
        name: Joi.string().required(),
        percentage: Joi.number().min(0).max(100).required(),
      })
    )
    .default([]),
});