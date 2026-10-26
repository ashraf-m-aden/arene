import mongoose from 'mongoose'
import { AGE_CATEGORIES, SLOT_KINDS, SLOT_STATUSES } from '@arene/shared/constants'

const { ObjectId } = mongoose.Schema.Types

const slotSchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', required: true, index: true },
    label: { type: String, required: true, trim: true },
    /**
     * `checkin` (rendez-vous administratif) ou `competition` (session de jeu).
     * Les deux ne se tiennent plus le meme jour : les validations, signatures et
     * encaissements se terminent une semaine avant le premier duel.
     *
     * Defaut `checkin` : les creneaux enregistres avant la separation servaient
     * au pointage et au paiement, c'est bien leur nature. La migration
     * 2026-10-creneaux-checkin-et-competition.js les etiquette explicitement.
     */
    kind: { type: String, enum: SLOT_KINDS, default: 'checkin', index: true },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    /**
     * Capacite d'un rendez-vous. `total` fait foi : un rendez-vous accueille N
     * participants, sans distinction de role — une edition intellectuelle n'a ni
     * buteur ni defenseur. Les champs par role restent la pour les editions 1v1
     * deja en base et pour la generation des rencontres.
     */
    capacity: {
      total: { type: Number, default: 0, min: 0 },
      striker: { type: Number, default: 0 },
      defender: { type: Number, default: 0 }
    },
    /** Optionnelle : un rendez-vous peut melanger les categories. */
    ageCategory: { type: String, enum: AGE_CATEGORIES },
    pitches: { type: Number, default: 2, min: 1 },
    venue: String,
    status: { type: String, enum: SLOT_STATUSES, default: 'planned', index: true },
    closedAt: Date
  },
  { timestamps: true }
)

slotSchema.index({ editionId: 1, startsAt: 1 })
slotSchema.index({ editionId: 1, kind: 1, startsAt: 1 })

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
