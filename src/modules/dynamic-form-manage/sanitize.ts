import Joi from "joi"

/* ===============================
   FIELD VALIDATION
================================ */
export const dynamicFieldSchema = Joi.object({
  label: Joi.string().trim().required(),

  type: Joi.string()
    .valid("text", "number", "email", "select", "radio", "checkbox", "date","file")
    .required(),

  required: Joi.boolean().default(false),

  options: Joi.when("type", {
    is: Joi.valid("select", "radio", "checkbox"),
    then: Joi.array().items(Joi.string().trim()).min(1).required(),
    otherwise: Joi.array().items(Joi.string().trim()).default([])
  })
})

/* ===============================
   CREATE DYNAMIC FORM VALIDATION
================================ */
export const createDynamicFormSchema = Joi.object({
  instituteId: Joi.string().required(),

  title: Joi.string().trim().min(3).required(),

  description: Joi.string().trim().allow("", null),

  fields: Joi.array()
    .items(dynamicFieldSchema)
    .min(1)
    .required()
})
