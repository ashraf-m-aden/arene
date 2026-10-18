import { z } from 'zod'
import { i18nText, objectId, slug } from './common.js'

const youtubeId = z
  .string()
  .trim()
  .transform((value) => {
    const match = value.match(
      /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/
    )
    return match ? match[1] : value
  })
  .pipe(z.string().regex(/^[\w-]{11}$/, { message: 'identifiant YouTube invalide' }))

export const gallerySchema = z.object({
  editionId: objectId,
  slug,
  title: i18nText(2, 140),
  description: i18nText(0, 2000).optional(),
  coverFileId: objectId.optional()
})

export const galleryUpdateSchema = gallerySchema.partial().omit({ editionId: true })

export const galleryItemSchema = z.object({
  type: z.enum(['photo', 'youtube']),
  fileId: objectId.optional(),
  youtubeId: youtubeId.optional(),
  caption: i18nText(0, 300).optional(),
  featuredRegIds: z.array(objectId).max(20).default([]),
  durationSeconds: z.coerce.number().int().min(0).optional()
}).refine((v) => (v.type === 'photo' ? Boolean(v.fileId) : Boolean(v.youtubeId)), {
  message: 'photo → fileId requis, vidéo → identifiant YouTube requis'
})

export const galleryOrderSchema = z.object({
  items: z.array(z.object({ itemId: objectId, order: z.coerce.number().int().min(0) })).min(1)
})
