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
              tuitionFee: Joi.number().min(0).required(),
              otherFee: Joi.number().min(0).required(),

              paymentOptions: Joi.array()
                .items(
                  Joi.object({
                    paymentOptionId: Joi.string().required(),

                    name: Joi.string().required(), // Full Payment, 2 Installments, 3 Installments

                    type: Joi.string()
                      .valid("full_payment", "installment")
                      .required(),

                    installments: Joi.array()
                      .items(
                        Joi.object({
                          number: Joi.number().integer().min(1).required(),
                          amount: Joi.number().min(0).required(),
                          tuitionFee: Joi.number().min(0).required(),
                          otherFee: Joi.number().min(0).required(),
                          dueDate: Joi.date().required(),
                        })
                      )
                      .min(1)
                      .required(),
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