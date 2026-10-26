import mongoose from 'mongoose'
import { AGE_CATEGORIES, DEFAULT_GRADE_THRESHOLD, EDITION_STATUSES } from '@arene/shared/constants'
import { checkinDeadline } from '@arene/shared/rules'

const i18n = { fr: { type: String, default: '' }, ar: { type: String, default: '' } }

const roleCapacity = { striker: { type: Number, default: 0 }, defender: { type: Number, default: 0 } }

const editionSchema = new mongoose.Schema(
  {
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    title: { type: i18n, required: true },
    description: { type: i18n, default: () => ({}) },
    season: String,
    status: { type: String, enum: EDITION_STATUSES, default: 'draft', index: true },
    /**
     * Fenetre d'inscription. C'est elle, et elle seule, qui decide si on peut
     * encore deposer un dossier (avec le statut de l'edition).
     */
    registrationOpensAt: { type: Date, required: true },
    registrationClosesAt: { type: Date, required: true },
    /**
     * Dates du tournoi lui-meme. Informatives : elles n'ouvrent ni ne ferment
     * les inscriptions, et le tournoi peut tres bien se tenir des semaines apres
     * la cloture des dossiers.
     */
    startsAt: Date,
    endsAt: Date,
    capacity: {
      lycee: roleCapacity,
      universite: roleCapacity
    },
    fee: { type: Number, default: 0 },
    ageCategories: { type: [String], enum: AGE_CATEGORIES, default: ['lycee', 'universite'] },
    rules: {
      gradeThreshold: { type: Number, default: DEFAULT_GRADE_THRESHOLD },
      requiresOriginalBulletin: { type: Boolean, default: true },
      /**
       * Règlement propre à cette édition, saisi par l'admin. Plusieurs éditions
       * peuvent être ouvertes en même temps, et une édition intellectuelle n'a pas
       * les mêmes règles qu'une sportive : le texte appartient donc à l'édition.
       * Vide, l'affichage retombe sur les règles générales des locales.
       */
      text: { type: i18n, default: () => ({}) }
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

/**
 * Date a laquelle les rendez-vous administratifs doivent etre termines : une
 * semaine avant le premier jour de tournoi. Indicative — c'est la cible que
 * l'organisation se donne, et le defaut de la repartition automatique. Ce qui
 * est reellement interdit, c'est de valider apres le coup d'envoi.
 */
editionSchema.virtual('checkinDeadline').get(function deadline() {
  return checkinDeadline(this)
})

/** Le tournoi a-t-il commence ? Au-dela, plus aucune validation n'est acceptee. */
editionSchema.virtual('hasStarted').get(function hasStarted() {
  return Boolean(this.startsAt) && new Date(this.startsAt) <= new Date()
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
