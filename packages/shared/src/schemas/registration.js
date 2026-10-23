import { z } from 'zod'
import { AGE_CATEGORIES, PLAYER_ROLES, REGISTRATION_STATUSES } from '../constants.js'
import { i18nText, isoDate, objectId, phone } from './common.js'

/**
 * Etape 1 — le joueur.
 *
 * Le nom n'y figure pas : il appartient au compte, a ete saisi a l'inscription et
 * n'est plus jamais modifie. Le dossier en garde une copie, posee par l'API a la
 * creation du brouillon, que le candidat ne peut pas changer.
 */
export const playerStepSchema = z.object({
  player: z.object({
    birthDate: isoDate,
    gender: z.enum(['m', 'f']),
    photoFileId: objectId.optional()
  }),
  schoolId: objectId.optional(),
  newSchool: z
    .object({
      name: i18nText(2, 140),
      type: z.enum(AGE_CATEGORIES),
      city: z.string().trim().max(80).default('Djibouti')
    })
    .optional(),
  role: z.enum(PLAYER_ROLES)
})

/** Étape 2 — les notes. */
export const gradesStepSchema = z.object({
  grades: z.object({
    average: z.coerce.number().min(0).max(20),
    term: z.string().trim().max(40).optional(),
    bulletinFileId: objectId
  })
})

/** Étape 3 — les autorisations, chaque case distincte. Aucune signature : des cases à cocher. */
/**
 * Trois autorisations conditionnent la participation, la quatrieme reste libre.
 *
 * Le droit a l'image est bloquant : le tournoi se joue en public, il est
 * photographie et filme, et l'organisation ne peut pas garantir qu'un
 * participant n'apparaitra sur aucune image. La diffusion sur une chaine
 * monetisee, elle, reste un choix — elle n'empeche pas de concourir.
 */
export const consentsStepSchema = z.object({
  consents: z.object({
    participation: z.literal(true),
    imageRights: z.literal(true),
    monetizedVideos: z.boolean(),
    bulletinAuthenticity: z.literal(true)
  })
})

export const registrationDraftSchema = z.object({
  editionId: objectId,
  locale: z.enum(['fr', 'ar']).default('fr')
})

export const registrationPatchSchema = z
  .object({})
  .merge(playerStepSchema.partial())
  .merge(gradesStepSchema.partial())
  .merge(consentsStepSchema.partial())

export const registrationSubmitSchema = z.object({
  confirm: z.literal(true)
})

export const reviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject', 'request_changes']),
    reason: z.string().trim().max(1000).optional(),
    randomCheck: z.boolean().default(false)
  })
  .refine((v) => v.decision === 'approve' || (v.reason && v.reason.length >= 5), {
    message: 'un motif est obligatoire pour refuser ou demander une correction',
    path: ['reason']
  })

export const registrationQuerySchema = z.object({
  editionId: objectId.optional(),
  status: z.enum(REGISTRATION_STATUSES).optional(),
  role: z.enum(PLAYER_ROLES).optional(),
  ageCategory: z.enum(AGE_CATEGORIES).optional(),
  schoolId: objectId.optional(),
  slotId: objectId.optional(),
  q: z.string().trim().max(80).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(25)
})

export const candidateContactSchema = z.object({
  phone,
  email: z.string().email().optional()
})
