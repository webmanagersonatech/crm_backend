import Joi from "joi";

export const additionalFeeConfigurationSchema = Joi.object({
  instituteId: Joi.string().required(),

  hostelFeeStructure: Joi.array()
    .items(
      Joi.object({
        year: Joi.string().required(),
        dueDate: Joi.date().iso().required(),
        roomTypes: Joi.array()
          .items(
            Joi.object({
              id: Joi.string().required(),
              name: Joi.string()
                .valid("Common Room", "AC Attached", "Single Room", "Deluxe Room")
                .required(),
              amount: Joi.number().min(0).required(),
              description: Joi.string().required(),
            })
          )
          .min(1)
          .required(),
      })
    )
    .min(1)
    .required(),
});