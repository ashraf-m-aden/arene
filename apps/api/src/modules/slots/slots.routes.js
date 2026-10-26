import { Router } from 'express'
import { z } from 'zod'
import {
  checkinConfirmSchema,
  checkinScanSchema,
  checkinSyncSchema,
  common,
  SLOT_KINDS,
  slotAssignSchema,
  slotDistributeSchema,
  slotSchema,
  slotUpdateSchema
} from '@arene/shared'
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

/**
 * Sous-routeur monté sur /editions/:editionId/slots, réservé à l'organisation.
 * Les créneaux ne sont pas publics : chaque candidat reçoit sa convocation par
 * message et ne connaît que la date et l'heure de son rendez-vous.
 */
export const editionRouter = Router({ mergeParams: true })

/**
 * `?kind=checkin|competition` sépare les deux grilles : l'écran de check-in ne
 * doit proposer que des rendez-vous administratifs, celui de saisie des
 * résultats que des sessions de jeu. Sans filtre, la liste complète est rendue.
 */
editionRouter.get(
  '/',
  requireRole('staff'),
  validate({ query: z.object({ kind: z.enum(SLOT_KINDS).optional() }) }),
  asyncHandler(async (req, res) =>
    ok(res, await service.listForEdition(req.params.editionId, { kind: req.validatedQuery.kind }))
  )
)

/**
 * Repartition automatique sur une edition : cree la grille de rendez-vous et y
 * place les dossiers acceptes. `dryRun` renvoie l'apercu sans rien ecrire.
 */
editionRouter.post(
  '/distribute',
  requireRole('admin'),
  validate({ body: slotDistributeSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await service.distribute(req.params.editionId, req.body, req.user.id))
  )
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
