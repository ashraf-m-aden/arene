import { Router } from 'express'
import { z } from 'zod'
import {
  checkinConfirmSchema,
  checkinScanSchema,
  checkinSyncSchema,
  common,
  slotAssignSchema,
  slotSchema,
  slotUpdateSchema
} from '@gm/shared'
import { requireAuth, requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { writeLimiter } from '../../core/middlewares/rateLimit.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import { recordAudit } from '../../core/middlewares/audit.js'
import * as service from './slots.service.js'

export const router = Router()

router.post('/', requireRole('admin'), validate({ body: slotSchema }), asyncHandler(async (req, res) =>
  created(res, await service.create(req.body))
))

router.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: common.idParam, body: slotUpdateSchema }),
  asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body)))
)

router.post(
  '/:id/assign',
  requireRole('staff'),
  validate({ params: common.idParam, body: slotAssignSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await service.assign(req.params.id, req.body.registrationId, req.user.id))
  )
)

router.get(
  '/:id/roster',
  requireRole('staff'),
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => {
    await recordAudit(req, 'slot.roster.read', { kind: 'slot', id: req.params.id })
    ok(res, await service.roster(req.params.id))
  })
)

router.get(
  '/:id/cash-report',
  requireRole('staff'),
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => ok(res, await service.cashReport(req.params.id)))
)

router.post(
  '/:id/close',
  requireRole('staff'),
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => ok(res, await service.close(req.params.id, req.user.id)))
)

/** Sous-routeur public monté sur /editions/:editionId/slots. */
export const editionRouter = Router({ mergeParams: true })

editionRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const publicView = !['staff', 'admin'].includes(req.user?.role)
    ok(res, await service.listForEdition(req.params.editionId, { publicView }))
  })
)

/** Routeur du check-in, monté sur /checkin. */
export const checkinRouter = Router()

checkinRouter.use(requireAuth, requireRole('staff'))

checkinRouter.post(
  '/scan',
  validate({ body: checkinScanSchema }),
  asyncHandler(async (req, res) => {
    const result = await service.scan(req.body.qrToken)
    await recordAudit(req, 'checkin.scan', {
      kind: 'registration',
      id: String(result.registration._id)
    })
    ok(res, result)
  })
)

checkinRouter.post(
  '/sync',
  writeLimiter,
  validate({ body: checkinSyncSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await service.syncCheckins(req.body.operations, req.user.id))
  )
)

checkinRouter.post(
  '/:registrationId',
  writeLimiter,
  validate({
    params: z.object({ registrationId: common.objectId }),
    body: checkinConfirmSchema
  }),
  asyncHandler(async (req, res) =>
    ok(res, await service.confirmCheckin(req.params.registrationId, req.user.id, req.body))
  )
)

export default router
