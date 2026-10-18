import { z } from 'zod'
import { AGE_CATEGORIES, DEFAULT_GRADE_THRESHOLD, EDITION_STATUSES } from '../constants.js'
import { i18nText, isoDate, objectId, slug } from './common.js'

const roleCapacity = z.object({
  striker: z.coerce.number().int().min(0).max(5000),
  defender: z.coerce.number().int().min(0).max(5000)
})

export const editionSchema = z
  .object({
    slug,
    title: i18nText(3, 140),
    description: i18nText(0, 4000).optional(),
    season: z.string().trim().max(20).optional(),
    registrationOpensAt: isoDate,
    registrationClosesAt: isoDate,
    capacity: z.object({
      lycee: roleCapacity,
      universite: roleCapacity
    }),
    fee: z.coerce.number().int().min(0).max(1000000),
    ageCategories: z.array(z.enum(AGE_CATEGORIES)).min(1).default(['lycee', 'universite']),
    rules: z
      .object({
        gradeThreshold: z.coerce.number().min(0).max(20).default(DEFAULT_GRADE_THRESHOLD),
        requiresOriginalBulletin: z.boolean().default(true)
      })
      .default({ gradeThreshold: DEFAULT_GRADE_THRESHOLD, requiresOriginalBulletin: true }),
    venue: z.object({
      name: z.string().trim().min(2).max(140),
      address: z.string().trim().max(240).optional(),
      city: z.string().trim().max(80).default('Djibouti'),
      mapUrl: z.string().url().optional()
    }),
    coverImage: objectId.or(z.string().url()).optional()
  })
  .refine((v) => v.registrationClosesAt > v.registrationOpensAt, {
    message: 'la clôture doit suivre l’ouverture',
    path: ['registrationClosesAt']
  })

export const editionUpdateSchema = editionSchema.innerType().deepPartial()

export const editionTransitionSchema = z.object({
  status: z.enum(EDITION_STATUSES),
  note: z.string().trim().max(500).optional()
})

export const editionQuerySchema = z.object({
  status: z.enum(EDITION_STATUSES).optional(),
  includeDrafts: z.coerce.boolean().default(false)
})
