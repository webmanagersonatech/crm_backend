import Joi from "joi";


export const createPaymentSchema = Joi.object({

  year: Joi.string()
    .required()
    .messages({

      "any.required": "Year is required",

      "string.empty": "Year cannot be empty"

    }),



  installmentNumber: Joi.number()
    .required()
    .messages({

      "any.required": "Installment number is required",

      "number.base": "Installment number must be a number"

    })

});