import { z } from 'zod'
import { LOCALES } from '../constants.js'

export const objectId = z
  .string()
  .regex(/^[a-f\d]{24}$/i, { message: 'identifiant invalide' })

export const slug = z
  .string()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'slug invalide' })

/** Texte public stocké en double langue dans le document. */
export const i18nText = (min = 1, max = 2000) =>
  z.object({
    fr: z.string().min(min).max(max),
    ar: z.string().min(min).max(max).or(z.literal('')).optional()
  })

export const locale = z.enum(LOCALES)

/** Téléphone normalisé au format international E.164 (Djibouti : +253…). */
export const phone = z
  .string()
  .trim()
  .regex(/^\+[1-9]\d{6,14}$/, { message: 'numéro au format international attendu (+253…)' })

export const email = z.string().trim().toLowerCase().email()

export const password = z
  .string()
  .min(8, { message: 'au moins 8 caractères' })
  .max(128)

export const isoDate = z.coerce.date()

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.string().optional()
})

export const idParam = z.object({ id: objectId })
export const slugParam = z.object({ slug })
