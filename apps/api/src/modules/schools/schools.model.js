import mongoose from 'mongoose'
import { SCHOOL_TYPES } from '@gm/shared/constants'

const schoolSchema = new mongoose.Schema(
  {
    name: {
      fr: { type: String, required: true, trim: true },
      ar: { type: String, default: '', trim: true }
    },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    type: { type: String, enum: SCHOOL_TYPES, required: true, index: true },
    city: { type: String, default: 'Djibouti' },
    contact: {
      person: String,
      phone: String,
      email: String
    },
    isVerified: { type: Boolean, default: false },
    /** Doublon fusionné : les lectures suivent la redirection vers l'école cible. */
    mergedInto: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null, index: true },
    source: { type: String, enum: ['import', 'staff', 'registration'], default: 'staff' }
  },
  { timestamps: true }
)

schoolSchema.index({ 'name.fr': 'text', 'name.ar': 'text' })

schoolSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const School = mongoose.models.School || mongoose.model('School', schoolSchema)
export default School
