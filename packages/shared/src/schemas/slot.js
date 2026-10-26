import { z } from 'zod'
import { AGE_CATEGORIES, ATTEMPT_OUTCOMES, SLOT_KINDS, SLOT_STATUSES } from '../constants.js'
import { isoDate, objectId } from './common.js'

export const slotSchema = z
  .object({
    editionId: objectId,
    label: z.string().trim().min(2).max(80),
    /**
     * `checkin` par defaut : c'est le rendez-vous qu'une edition cree en premier
     * et en plus grand nombre, et le defaut garde compatibles les creneaux
     * enregistres avant la separation des deux natures.
     */
    kind: z.enum(SLOT_KINDS).default('checkin'),
    startsAt: isoDate,
    endsAt: isoDate,
    /** `total` fait foi ; les champs par role ne servent qu'aux editions 1v1. */
    capacity: z.object({
      total: z.coerce.number().int().min(0).max(1000).default(0),
      striker: z.coerce.number().int().min(0).max(500).default(0),
      defender: z.coerce.number().int().min(0).max(500).default(0)
    }),
    ageCategory: z.enum(AGE_CATEGORIES).optional(),
    pitches: z.coerce.number().int().min(1).max(20).default(2),
    venue: z.string().trim().max(140).optional(),
    status: z.enum(SLOT_STATUSES).default('planned')
  })
  .refine((v) => v.endsAt > v.startsAt, {
    message: 'la fin doit suivre le début',
    path: ['endsAt']
  })

export const slotUpdateSchema = slotSchema.innerType().partial().omit({ editionId: true })

/**
 * Conditions de la repartition automatique. `offsetMinutes` est le decalage UTC
 * du client (`-new Date().getTimezoneOffset()`) : sans lui, un serveur en UTC
 * placerait les rendez-vous trois heures a cote pour Djibouti.
 */
export const slotDistributeSchema = z
  .object({
    days: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1).max(60),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
    durationMinutes: z.coerce.number().int().min(5).max(600),
    perSlot: z.coerce.number().int().min(1).max(500),
    offsetMinutes: z.coerce.number().int().min(-840).max(840).default(0),
    ageCategory: z.enum(AGE_CATEGORIES).optional(),
    venue: z.string().trim().max(140).optional(),
    labelPrefix: z.string().trim().max(60).optional(),
    /**
     * Nature des rendez-vous crees. `checkin` consomme les dossiers acceptes qui
     * attendent une convocation ; `competition` repartit les inscrits sur les
     * sessions de jeu. Les deux grilles se construisent de la meme facon, elles
     * ne placent simplement pas les memes dossiers.
     */
    kind: z.enum(SLOT_KINDS).default('checkin'),
    pitches: z.coerce.number().int().min(1).max(20).default(2),
    dryRun: z.boolean().default(false)
  })
  .refine((v) => v.endTime > v.startTime, {
    message: 'la fin de journee doit suivre le debut',
    path: ['endTime']
  })

export const slotAssignSchema = z.object({
  registrationId: objectId,
  notify: z.boolean().default(true)
})

export const checkinScanSchema = z.object({
  qrToken: z.string().min(10).max(120)
})

export const checkinConfirmSchema = z.object({
  payment: z.object({
    status: z.enum(['paid', 'exempt']),
    amount: z.coerce.number().int().min(0).default(0),
    exemptionReason: z.string().trim().max(240).optional()
  }),
  identityChecked: z.literal(true),
  bulletinChecked: z.boolean().default(false),
  /** Contrat papier signé sur place : condition de passage au statut inscrit. */
  contractSigned: z.literal(true)
})

/** Lot d'opérations enregistrées hors ligne, rejouées au retour du réseau. */
export const checkinSyncSchema = z.object({
  operations: z
    .array(
      z.object({
        idempotencyKey: z.string().min(8).max(80),
        registrationId: objectId,
        occurredAt: isoDate,
        payment: checkinConfirmSchema.shape.payment,
        identityChecked: z.boolean(),
        bulletinChecked: z.boolean().default(false),
        contractSigned: z.boolean().default(false)
      })
    )
    .min(1)
    .max(200)
})

export const matchResultSchema = z.object({
  attempts: z.array(z.enum(ATTEMPT_OUTCOMES)).length(5),
  note: z.string().trim().max(240).optional()
})
