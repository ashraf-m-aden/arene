import { z } from 'zod'
import { AGE_CATEGORIES, MATCH_PHASES, PLAYER_ROLES } from '../constants.js'
import { objectId } from './common.js'

export const generateMatchesSchema = z.object({
  phase: z.enum(MATCH_PHASES).default('qualification'),
  opponents: z.coerce.number().int().min(1).max(10).default(3),
  reset: z.boolean().default(false)
})

export const rankingQuerySchema = z.object({
  role: z.enum(PLAYER_ROLES).optional(),
  ageCategory: z.enum(AGE_CATEGORIES).optional(),
  view: z.enum(['total', 'perPlayer']).default('total'),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export const finalsSelectSchema = z.object({
  ageCategory: z.enum(AGE_CATEGORIES).optional(),
  dryRun: z.boolean().default(false)
})

export const matchCorrectionSchema = z.object({
  matchId: objectId,
  reason: z.string().trim().min(5).max(240)
})
