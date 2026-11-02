import { Router } from 'express'
import { z } from 'zod'
import {
  common,
  deletionSchema,
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
/*
 * Suppression definitive : l'administrateur seul. Le staff accepte, refuse,
 * demande une correction — il ne fait pas disparaitre un dossier. Les deux
 * routes vont de pair : l'ecran lit l'impact, puis confirme avec la reference
 * que cet impact annonce.
 */
router.get(
  '/:id/deletion-impact',
  requireRole('admin'),
  validate({ params: common.idParam }),
  controller.deletionImpact
)
router.delete(
  '/:id',
  requireRole('admin'),
  writeLimiter,
  validate({ params: common.idParam, body: deletionSchema }),
  controller.destroy
)

router.get('/:id/badge', validate({ params: common.idParam }), controller.badge)
router.get('/:id/data', validate({ params: common.idParam }), controller.myData)
router.get('/:id', validate({ params: common.idParam }), controller.detail)

export default router
