import mongoose from 'mongoose'
import {
  AGE_CATEGORIES,
  LOCALES,
  PLAYER_ROLES,
  REGISTRATION_STATUSES
} from '@arene/shared/constants'

const { ObjectId } = mongoose.Schema.Types

const registrationSchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', required: true, index: true },
    candidateId: { type: ObjectId, ref: 'User', required: true, index: true },
    locale: { type: String, enum: LOCALES, default: 'fr' },

    player: {
      /**
       * Copie du nom du compte, posee a la creation du brouillon. Le candidat ne
       * la saisit ni ne la modifie : le dossier garde le nom tel qu'il etait au
       * moment de la candidature.
       */
      name: { type: String, trim: true },
      birthDate: Date,
      gender: { type: String, enum: ['m', 'f'] },
      photoFileId: { type: ObjectId, ref: 'File' }
    },

    schoolId: { type: ObjectId, ref: 'School', index: true },
    role: { type: String, enum: PLAYER_ROLES },
    ageCategory: { type: String, enum: AGE_CATEGORIES },

    grades: {
      average: Number,
      term: String,
      bulletinFileId: { type: ObjectId, ref: 'File' }
    },

    /** Cases cochées par le candidat en ligne : aucune signature, le contrat se signe sur place. */
    consents: {
      participation: { type: Boolean, default: false },
      imageRights: { type: Boolean, default: false },
      monetizedVideos: { type: Boolean, default: false },
      bulletinAuthenticity: { type: Boolean, default: false },
      submittedAt: Date
    },

    status: { type: String, enum: REGISTRATION_STATUSES, default: 'draft', index: true },
    step: { type: Number, default: 1, min: 1, max: 4 },
    /** Signalements des contrôles automatiques : le staff tranche, rien n'est refusé seul. */
    flags: [{ _id: false, code: String, field: String, detail: mongoose.Schema.Types.Mixed }],
    reviewNotes: String,
    reviewedBy: { type: ObjectId, ref: 'User' },
    reviewedAt: Date,
    randomCheck: { type: Boolean, default: false },

    payment: {
      status: { type: String, enum: ['due', 'paid', 'exempt'], default: 'due' },
      amount: { type: Number, default: 0 },
      receivedBy: { type: ObjectId, ref: 'User' },
      receivedAt: Date,
      exemptionReason: String
    },

    /** Contrat papier signé sur place le jour de la convocation, avant le passage en inscrit. */
    contract: {
      signed: { type: Boolean, default: false },
      signedAt: Date,
      signedBy: { type: ObjectId, ref: 'User' }
    },

    qrToken: { type: String },
    slotId: { type: ObjectId, ref: 'Slot', index: true },
    checkedInAt: Date,
    checkedInBy: { type: ObjectId, ref: 'User' },
    bibNumber: Number,

    /** Même nom + même date de naissance + même école dans une édition = doublon. */
    dedupeKey: { type: String, index: true },

    history: [
      {
        _id: false,
        from: String,
        to: String,
        by: { type: ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
        note: String
      }
    ]
  },
  { timestamps: true }
)

registrationSchema.index({ editionId: 1, status: 1 })
registrationSchema.index({ editionId: 1, slotId: 1 })
registrationSchema.index({ editionId: 1, ageCategory: 1, role: 1, status: 1 })
registrationSchema.index(
  { qrToken: 1 },
  { unique: true, partialFilterExpression: { qrToken: { $type: 'string' } } }
)
registrationSchema.index(
  { editionId: 1, bibNumber: 1 },
  { unique: true, partialFilterExpression: { bibNumber: { $type: 'number' } } }
)
registrationSchema.index(
  { editionId: 1, dedupeKey: 1 },
  { partialFilterExpression: { dedupeKey: { $type: 'string' } } }
)

registrationSchema.virtual('playerName').get(function playerName() {
  return String(this.player?.name || '').trim()
})

/**
 * Nom affichable en public : premier nom + initiales des suivants, jamais le nom
 * complet d'un mineur. « Idriss Ahmed Farah » devient « Idriss A. F. ».
 */
registrationSchema.virtual('publicName').get(function publicName() {
  const parts = String(this.player?.name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  const [first, ...rest] = parts
  return [first, ...rest.map((part) => `${part[0].toUpperCase()}.`)].join(' ')
})

registrationSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.__v
    delete ret.qrToken // le jeton du badge ne circule que dans le PDF
    delete ret.dedupeKey
    return ret
  }
})

export const Registration =
  mongoose.models.Registration || mongoose.model('Registration', registrationSchema)
export default Registration
