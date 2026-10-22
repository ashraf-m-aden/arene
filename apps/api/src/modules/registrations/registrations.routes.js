import { Router } from 'express'
import { z } from 'zod'
import {
  common,
  registrationDraftSchema,
  registrationPatchSchema,
  registrationQuerySchema,
  registrationSubmitSchema,
  reviewSchema
} from '@arene/shared'
import { requireAuth, requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { writeLimiter } from '../../core/middlewares/rateLimit.js'
import * as controller from './registrations.controller.js'

export const router = Router()

router.use(requireAuth)

router.get('/mine', controller.mine)
router.get(
  '/export',
  requireRole('admin'),
  validate({ query: z.object({ editionId: common.objectId }) }),
  controller.exportCsv
)

router.get(
  '/',
  requireRole('staff'),
  validate({ query: registrationQuerySchema }),
  controller.list
)

router.post(
  '/',
  writeLimiter,
  validate({ body: registrationDraftSchema }),
  controller.createDraft
)
router.patch(
  '/:id',
  writeLimiter,
  validate({ params: common.idParam, body: registrationPatchSchema }),
  controller.patch
)
router.post(
  '/:id/submit',
  writeLimiter,
  validate({ params: common.idParam, body: registrationSubmitSchema }),
  controller.submit
)
router.post(
  '/:id/review',
  requireRole('staff'),
  validate({ params: common.idParam, body: reviewSchema }),
  controller.review
)
router.get('/:id/badge', validate({ params: common.idParam }), controller.badge)
router.get('/:id/data', validate({ params: common.idParam }), controller.myData)
router.get('/:id', validate({ params: common.idParam }), controller.detail)

export default router
