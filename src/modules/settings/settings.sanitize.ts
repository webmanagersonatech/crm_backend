import Joi from 'joi';

export const settingsSchema = Joi.object({
  instituteId: Joi.string().required(),

  logo: Joi.string()
    .pattern(/^data:image\/(png|jpg|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),

  courses: Joi.array().items(Joi.string()).optional(),

  // ✅ Payment Method
  paymentMethod: Joi.string()
    .valid('razorpay', 'instamojo')
    .required()
    .messages({
      'any.only': 'Payment method must be razorpay or instamojo',
      'any.required': 'Payment method is required',
    }),

  // ✅ Payment Credentials
  paymentCredentials: Joi.when('paymentMethod', {
    is: 'razorpay',
    then: Joi.object({
      keyId: Joi.string().required(),
      keySecret: Joi.string().required(),
    }).required(),
    otherwise: Joi.when('paymentMethod', {
      is: 'instamojo',
      then: Joi.object({
        apiKey: Joi.string().required(),
        authToken: Joi.string().required(),
      }).required(),
    }),
  }),

  applicationFee: Joi.number().min(0).required(),

  applicantAge: Joi.number().integer().min(1).max(100).required(),

  academicYear: Joi.string().required(),

  batchName: Joi.string().allow('').optional(),

  isApplicationOpen: Joi.boolean().optional(),

  contactEmail: Joi.string().email().optional(),

  contactNumber: Joi.string()
    .pattern(/^[0-9+\-\s()]{7,20}$/)
    .optional(),

  address: Joi.string().optional(),
});