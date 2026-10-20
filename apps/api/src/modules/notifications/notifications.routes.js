import { Router } from 'express'
import { z } from 'zod'
import {
  broadcastSchema,
  common,
  notificationQuerySchema,
  templateSchema,
  webhookSchema
} from '@arene/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import * as service from './notifications.service.js'

export const router = Router()

/** Webhooks fournisseurs : hors authentification, vérifiés par l'identifiant de message. */
router.post(
  '/webhooks/:provider',
  validate({ params: z.object({ provider: z.enum(['ses', 'whatsapp']) }), body: webhookSchema }),
  asyncHandler(async (req, res) => ok(res, await service.handleWebhook(req.params.provider, req.body)))
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
