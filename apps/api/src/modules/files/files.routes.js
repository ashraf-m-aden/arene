import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { FILE_KINDS } from '@arene/shared/constants'
import { common } from '@arene/shared'
import { requireAuth, requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { uploadLimiter } from '../../core/middlewares/rateLimit.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import { badRequest, forbidden } from '../../core/errors.js'
import storage from '../../core/storage.js'
import config from '../../core/config.js'
import * as service from './files.service.js'

export const router = Router()

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 16 * 1024 * 1024, files: 10 }
})

const uploadQuery = z.object({
  kind: z.enum(FILE_KINDS),
  editionId: common.objectId.optional()
})

router.post(
  '/',
  requireAuth,
  uploadLimiter,
  upload.single('file'),
  validate({ query: uploadQuery }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Aucun fichier reçu')
    const { kind, editionId } = req.validatedQuery
    if (kind === 'media' && !['staff', 'admin'].includes(req.user.role)) {
      throw forbidden('Les médias de galerie sont réservés au staff')
    }
    const doc = await service.upload({
      buffer: req.file.buffer,
      originalName: req.file.originalname,
      kind,
      owner: req.user.id,
      editionId
    })
    created(res, doc)
  })
)

router.post(
  '/batch',
  requireRole('staff'),
  uploadLimiter,
  upload.array('files', 10),
  validate({ query: uploadQuery }),
  asyncHandler(async (req, res) => {
    const files = req.files || []
    if (!files.length) throw badRequest('Aucun fichier reçu')
    const docs = []
    for (const file of files) {
      docs.push(
        await service.upload({
          buffer: file.buffer,
          originalName: file.originalname,
          kind: req.validatedQuery.kind,
          owner: req.user.id,
          editionId: req.validatedQuery.editionId
        })
      )
    }
    created(res, docs)
  })
)

router.get(
  '/:id/url',
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => {
    ok(res, await service.signedUrlFor(req.params.id, req.user, { variant: req.query.variant }))
  })
)

/**
 * Lecture directe, utilisée par le pilote de stockage local :
 * en production les fichiers publics passent par le CDN et les privés par un lien S3 signé.
 */
router.get(
  '/:visibility(public|private)/:key',
  asyncHandler(async (req, res) => {
    if (config.storage.driver !== 'local') throw forbidden('Lecture directe désactivée')
    const { visibility, key } = req.params
    if (visibility === 'private' && !['staff', 'admin', 'parent'].includes(req.user?.role)) {
      throw forbidden('Document privé')
    }
    const buffer = await storage.get(decodeURIComponent(key), visibility)
    res.type(key.endsWith('.webp') ? 'image/webp' : 'application/octet-stream')
    res.set('Cache-Control', visibility === 'public' ? 'public, max-age=31536000, immutable' : 'private, no-store')
    res.send(buffer)
  })
)

router.delete(
  '/:id',
  requireRole('staff'),
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => {
    await service.remove(req.params.id)
    ok(res, { deleted: true })
  })
)

export default router
