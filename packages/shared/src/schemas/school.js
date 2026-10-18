import { z } from 'zod'
import { SCHOOL_TYPES } from '../constants.js'
import { i18nText, objectId, phone, slug } from './common.js'

export const schoolSchema = z.object({
  name: i18nText(2, 140),
  slug: slug.optional(),
  type: z.enum(SCHOOL_TYPES),
  city: z.string().trim().min(2).max(80).default('Djibouti'),
  contact: z
    .object({
      person: z.string().trim().max(120).optional(),
      phone: phone.optional(),
      email: z.string().email().optional()
    })
    .default({}),
  isVerified: z.boolean().default(false)
})

export const schoolUpdateSchema = schoolSchema.partial()

export const schoolMergeSchema = z.object({ intoId: objectId })

export const schoolQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  type: z.enum(SCHOOL_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
})
