import Joi from 'joi'

export const createFormManagerSchema = Joi.object({
  instituteId: Joi.string().required(),

  personalDetails: Joi.array().items(
    Joi.object({
      sectionName: Joi.string().required(),
      fields: Joi.array().items(
        Joi.object({
          fieldName: Joi.string().required(),
          label: Joi.string().optional(),
          type: Joi.string().required(),
          maxLength: Joi.number().optional(), 
          required: Joi.boolean().optional(),
          options: Joi.array().items(Joi.string()).optional(),
          multiple: Joi.boolean().optional()
        })
      )
    })
  ),

  educationDetails: Joi.array().items(
    Joi.object({
      sectionName: Joi.string().required(),
      fields: Joi.array().items(
        Joi.object({
          fieldName: Joi.string().required(),
          label: Joi.string().optional(),
          type: Joi.string().required(),
          required: Joi.boolean().optional(),
          maxLength: Joi.number().optional(),
          options: Joi.array().items(Joi.string()).optional(),
          multiple: Joi.boolean().optional()
        })
      )
    })
  )
})
