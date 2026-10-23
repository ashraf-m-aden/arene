import express, { Router } from 'express'
import { z } from 'zod'
import {
  broadcastSchema,
  common,
  notificationQuerySchema,
  templateSchema
} from '@arene/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import * as service from './notifications.service.js'

export const router = Router()

/**
 * Évènements SES relayés par SNS : rebonds, plaintes, distributions.
 * Hors authentification — c'est la signature SNS qui fait foi, vérifiée dans le
 * service. SNS poste en `text/plain`, d'où le parseur dédié sur cette route.
 */
router.post(
  '/webhooks/ses',
  express.json({ type: ['application/json', 'text/plain'], limit: '256kb' }),
  asyncHandler(async (req, res) => ok(res, await service.handleSnsEvent(req.body)))
)

router.use(requireRole('admin'))

router.get(
  '/',
  validate({ query: notificationQuerySchema }),
  asyncHandler(async (req, res) => {
    const { items, meta } = await service.list(req.validatedQuery)
    ok(res, items, meta)
  })
)

router.post(
  '/broadcast',
  validate({ body: broadcastSchema }),
  asyncHandler(async (req, res) => created(res, await service.broadcast(req.body, req.user.id)))
)

router.get(
  '/suppressions',
  validate({
    query: z.object({
      channel: z.literal('email').optional(),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(200).default(50)
    })
  }),
  asyncHandler(async (req, res) => {
    const { items, meta } = await service.listSuppressions(req.validatedQuery)
    ok(res, items, meta)
  })
)

router.delete(
  '/suppressions/:id',
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => ok(res, await service.unsuppress(req.params.id)))
)

router.post(
  '/:id/retry',
  validate({ params: common.idParam }),
  asyncHandler(async (req, res) => ok(res, await service.retry(req.params.id)))
)

/** Routeur des modèles de messages, monté sur /notification-templates. */
export const templatesRouter = Router()

templatesRouter.use(requireRole('admin'))

templatesRouter.get(
  '/',
  asyncHandler(async (_req, res) => ok(res, await service.listTemplates()))
)

templatesRouter.put(
  '/:key',
  validate({
    params: z.object({ key: z.string().min(2).max(60) }),
    body: templateSchema.omit({ key: true })
  }),
  asyncHandler(async (req, res) => ok(res, await service.upsertTemplate(req.params.key, req.body)))
)

export default router
