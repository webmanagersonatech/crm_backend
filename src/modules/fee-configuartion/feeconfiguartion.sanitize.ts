import Joi from "joi";

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

              installments: Joi.array()
                .items(
                  Joi.object({
                    number: Joi.number().integer().min(1).required(),
                    amount: Joi.number().min(0).required(),
                    dueDate: Joi.date().required(),
                  })
                )
                .default([]),
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
        referralId: Joi.string().required(),
        name: Joi.string().required(),
        percentage: Joi.number().min(0).max(100).required(),
      })
    )
    .default([]),
});