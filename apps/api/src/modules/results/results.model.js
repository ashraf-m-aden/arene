import mongoose from 'mongoose'
import { ATTEMPT_OUTCOMES, MATCH_PHASES } from '@arene/shared/constants'

const { ObjectId } = mongoose.Schema.Types

const matchSchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', required: true, index: true },
    slotId: { type: ObjectId, ref: 'Slot', index: true },
    phase: { type: String, enum: MATCH_PHASES, default: 'qualification', index: true },
    ageCategory: { type: String, index: true },
    round: { type: Number, default: 1 },
    pitch: { type: Number, default: 1 },
    order: { type: Number, default: 0 },

    strikerRegId: { type: ObjectId, ref: 'Registration', required: true, index: true },
    defenderRegId: { type: ObjectId, ref: 'Registration', required: true, index: true },

    attempts: [{ type: String, enum: ATTEMPT_OUTCOMES }],
    strikerScore: { type: Number, default: null },
    defenderScore: { type: Number, default: null },

    enteredBy: { type: ObjectId, ref: 'User' },
    enteredAt: Date,
    /** Historique des corrections : qui, quand, ancienne valeur. */
    corrections: [
      {
        _id: false,
        by: { type: ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        reason: String,
        previous: {
          attempts: [String],
          strikerScore: Number,
          defenderScore: Number
        }
      }
    ]
  },
  { timestamps: true }
)

matchSchema.index({ editionId: 1, phase: 1 })
matchSchema.index({ slotId: 1, order: 1 })
matchSchema.index(
  { editionId: 1, phase: 1, strikerRegId: 1, defenderRegId: 1 },
  { unique: true }
)

matchSchema.virtual('isRecorded').get(function isRecorded() {
  return this.strikerScore !== null && this.strikerScore !== undefined
})

matchSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const Match = mongoose.models.Match || mongoose.model('Match', matchSchema)
export default Match
