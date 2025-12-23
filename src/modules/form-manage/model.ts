import mongoose, { Document, Schema } from 'mongoose'

/* ============================
   FIELD SCHEMA
============================ */

export interface ISectionField {
  fieldName: string
  label?: string
  type: string
  required?: boolean
  maxLength?: number
  options?: string[]
  multiple?: boolean
}

const SectionFieldSchema = new Schema<ISectionField>(
  {
    fieldName: { type: String, required: true },
    label: { type: String },
    type: { type: String, required: true },
    required: { type: Boolean, default: false },
    options: [{ type: String }],
    maxLength: { type: Number },
    multiple: { type: Boolean, default: false }
  },
  { _id: false }
)

/* ============================
   SECTION SCHEMA
============================ */

export interface IFormSection {
  sectionName: string
  fields: ISectionField[]
}

const FormSectionSchema = new Schema<IFormSection>(
  {
    sectionName: { type: String, required: true },
    fields: { type: [SectionFieldSchema], default: [] }
  },
  { _id: false }
)

/* ============================
   FORM MANAGER
============================ */

export interface IFormManager extends Document {
  instituteId: string
  personalDetails: IFormSection[]
  educationDetails: IFormSection[]
}

const FormManagerSchema = new Schema<IFormManager>(
  {
    instituteId: { type: String, required: true, unique: true },

    personalDetails: {
      type: [FormSectionSchema],
      default: []
    },

    educationDetails: {
      type: [FormSectionSchema],
      default: []
    }
  },
  {
    timestamps: true
  }
)

export default mongoose.model<IFormManager>(
  'FormManager',
  FormManagerSchema
)
