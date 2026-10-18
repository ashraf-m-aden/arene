import mongoose from 'mongoose'
import { AGE_CATEGORIES, DEFAULT_GRADE_THRESHOLD, EDITION_STATUSES } from '@gm/shared/constants'

const i18n = { fr: { type: String, default: '' }, ar: { type: String, default: '' } }

const roleCapacity = { striker: { type: Number, default: 0 }, defender: { type: Number, default: 0 } }

const editionSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: i18n, required: true },
    description: { type: i18n, default: () => ({}) },
    season: String,
    status: { type: String, enum: EDITION_STATUSES, default: 'draft', index: true },
    registrationOpensAt: { type: Date, required: true },
    registrationClosesAt: { type: Date, required: true },
    capacity: {
      lycee: roleCapacity,
      universite: roleCapacity
    },
    fee: { type: Number, default: 0 },
    ageCategories: { type: [String], enum: AGE_CATEGORIES, default: ['lycee', 'universite'] },
    rules: {
      gradeThreshold: { type: Number, default: DEFAULT_GRADE_THRESHOLD },
      requiresOriginalBulletin: { type: Boolean, default: true }
    },
    venue: {
      name: String,
      address: String,
      city: { type: String, default: 'Djibouti' },
      mapUrl: String
    },
    coverImage: String,
    /** Classement mis en cache, recalculé à chaque result.recorded / registration.checked_in. */
    rankings: {
      schools: { type: mongoose.Schema.Types.Mixed, default: null },
      players: { type: mongoose.Schema.Types.Mixed, default: null },
      computedAt: Date
    },
    history: [
      {
        _id: false,
        from: String,
        to: String,
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        note: String
      }
    ]
  },
  { timestamps: true }
)

editionSchema.index({ status: 1, registrationOpensAt: -1 })

editionSchema.virtual('isRegistrationOpen').get(function isOpen() {
  const now = new Date()
  return (
    this.status === 'registration_open' &&
    this.registrationOpensAt <= now &&
    this.registrationClosesAt >= now
  )
})

editionSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const Edition = mongoose.models.Edition || mongoose.model('Edition', editionSchema)
export default Edition
