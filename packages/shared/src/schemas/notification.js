import { z } from 'zod'
import {
  AGE_CATEGORIES,
  LOCALES,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_STATUSES,
  PLAYER_ROLES,
  REGISTRATION_STATUSES
} from '../constants.js'
import { i18nText, objectId } from './common.js'

export const notificationQuerySchema = z.object({
  editionId: objectId.optional(),
  channel: z.enum(NOTIFICATION_CHANNELS).optional(),
  status: z.enum(NOTIFICATION_STATUSES).optional(),
  template: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50)
})

export const broadcastSchema = z.object({
  editionId: objectId,
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1).default(['email']),
  template: z.string().trim().min(2).max(60).default('broadcast'),
  /**
   * Destinataires choisis un par un. Quand la liste est fournie, elle fait foi et
   * `segment` est ignore : l'organisation vise des personnes, pas un critere.
   */
  registrationIds: z.array(objectId).min(1).max(500).optional(),
  segment: z
    .object({
      status: z.enum(REGISTRATION_STATUSES).optional(),
      role: z.enum(PLAYER_ROLES).optional(),
      ageCategory: z.enum(AGE_CATEGORIES).optional(),
      slotId: objectId.optional(),
      /** Session de jeu : viser les joueurs d'un terrain, pas d'un pointage. */
      sessionId: objectId.optional(),
      schoolId: objectId.optional()
    })
    .default({}),
  payload: z.object({
    subject: i18nText(2, 140),
    body: i18nText(2, 4000)
  })
})

export const templateSchema = z.object({
  key: z.string().trim().min(2).max(60),
  channels: z.array(z.enum(NOTIFICATION_CHANNELS)).min(1),
  subject: i18nText(0, 140).optional(),
  body: i18nText(2, 4000),
  isActive: z.boolean().default(true)
})

export const localeSchema = z.enum(LOCALES)
