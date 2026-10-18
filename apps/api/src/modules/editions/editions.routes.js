import { Router } from 'express'
import {
  common,
  editionQuerySchema,
  editionSchema,
  editionTransitionSchema,
  editionUpdateSchema
} from '@gm/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import * as controller from './editions.controller.js'

export const router = Router()

router.get('/', validate({ query: editionQuerySchema }), controller.list)
router.get('/current', controller.current)
router.get('/:slug', validate({ params: common.slugParam }), controller.detail)

router.post('/', requireRole('admin'), validate({ body: editionSchema }), controller.create)
router.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: common.idParam, body: editionUpdateSchema }),
  controller.update
)
router.post(
  '/:id/transition',
  requireRole('admin'),
  validate({ params: common.idParam, body: editionTransitionSchema }),
  controller.transition
)
router.get(
  '/:id/stats',
  requireRole('staff'),
  validate({ params: common.idParam }),
  controller.stats
)

export default router
