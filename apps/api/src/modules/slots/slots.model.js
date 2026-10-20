import mongoose from 'mongoose'
import { AGE_CATEGORIES, SLOT_STATUSES } from '@arene/shared/constants'

const { ObjectId } = mongoose.Schema.Types

const slotSchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', required: true, index: true },
    label: { type: String, required: true, trim: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    capacity: {
      striker: { type: Number, default: 50 },
      defender: { type: Number, default: 50 }
    },
    ageCategory: { type: String, enum: AGE_CATEGORIES, required: true },
    pitches: { type: Number, default: 2, min: 1 },
    venue: String,
    status: { type: String, enum: SLOT_STATUSES, default: 'planned', index: true },
    closedAt: Date
  },
  { timestamps: true }
)

slotSchema.index({ editionId: 1, startsAt: 1 })

slotSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const Slot = mongoose.models.Slot || mongoose.model('Slot', slotSchema)

/**
 * Trace des opérations de check-in rejouées depuis le mode hors ligne.
 * La clé d'idempotence évite qu'une synchronisation répétée encaisse deux fois.
 */
const checkinOperationSchema = new mongoose.Schema(
  {
    idempotencyKey: { type: String, required: true, unique: true },
    registrationId: { type: ObjectId, ref: 'Registration', required: true },
    slotId: { type: ObjectId, ref: 'Slot', index: true },
    staffId: { type: ObjectId, ref: 'User' },
    occurredAt: Date,
    appliedAt: { type: Date, default: Date.now },
    outcome: { type: String, enum: ['applied', 'duplicate', 'failed'], default: 'applied' },
    error: String
  },
  { timestamps: true }
)

export const CheckinOperation =
  mongoose.models.CheckinOperation ||
  mongoose.model('CheckinOperation', checkinOperationSchema)

export default Slot
