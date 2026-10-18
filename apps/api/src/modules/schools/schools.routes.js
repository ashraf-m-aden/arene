import { Router } from 'express'
import multer from 'multer'
import {
  common,
  schoolMergeSchema,
  schoolQuerySchema,
  schoolSchema,
  schoolUpdateSchema
} from '@gm/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import { badRequest } from '../../core/errors.js'
import * as service from './schools.service.js'

export const router = Router()
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } })

router.get(
  '/',
  validate({ query: schoolQuerySchema }),
  asyncHandler(async (req, res) => ok(res, await service.search(req.validatedQuery)))
)

router.post(
  '/import',
  requireRole('admin'),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const content = req.file?.buffer?.toString('utf8') || req.body?.csv
    if (!content) throw badRequest('Fichier CSV attendu')
    ok(res, await service.importCsv(content))
  })
)

router.post(
  '/',
  requireRole('staff'),
  validate({ body: schoolSchema }),
  asyncHandler(async (req, res) => created(res, await service.create(req.body)))
)

router.patch(
  '/:id',
  requireRole('staff'),
  validate({ params: common.idParam, body: schoolUpdateSchema }),
  asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body)))
)

router.post(
  '/:id/merge',
  requireRole('staff'),
  validate({ params: common.idParam, body: schoolMergeSchema }),
  asyncHandler(async (req, res) => ok(res, await service.merge(req.params.id, req.body.intoId)))
)

router.get(
  '/:slug',
  validate({ params: common.slugParam }),
  asyncHandler(async (req, res) => ok(res, await service.publicProfile(req.params.slug)))
)

export default router
