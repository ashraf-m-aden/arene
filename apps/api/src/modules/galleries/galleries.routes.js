import { Router } from 'express'
import { z } from 'zod'
import {
  common,
  galleryItemSchema,
  galleryOrderSchema,
  gallerySchema,
  galleryUpdateSchema
} from '@arene/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import * as service from './galleries.service.js'

export const router = Router()

const isStaff = (req) => ['staff', 'admin'].includes(req.user?.role)

router.get(
  '/:slug',
  validate({ params: common.slugParam }),
  asyncHandler(async (req, res) =>
    ok(res, await service.getBySlug(req.params.slug, { publishedOnly: !isStaff(req) }))
  )
)

router.post(
  '/',
  requireRole('staff'),
  validate({ body: gallerySchema }),
  asyncHandler(async (req, res) => created(res, await service.create(req.body)))
)

router.patch(
  '/:id',
  requireRole('staff'),
  validate({ params: common.idParam, body: galleryUpdateSchema }),
  asyncHandler(async (req, res) => ok(res, await service.update(req.params.id, req.body)))
)

router.post(
  '/:id/items',
  requireRole('staff'),
  validate({ params: common.idParam, body: z.object({ items: z.array(galleryItemSchema).min(1).max(50) }) }),
  asyncHandler(async (req, res) => created(res, await service.addItems(req.params.id, req.body.items)))
)

router.patch(
  '/:id/items/order',
  requireRole('staff'),
  validate({ params: common.idParam, body: galleryOrderSchema }),
  asyncHandler(async (req, res) => ok(res, await service.reorder(req.params.id, req.body.items)))
)

router.delete(
  '/:id/items/:itemId',
  requireRole('staff'),
  validate({ params: z.object({ id: common.objectId, itemId: common.objectId }) }),
  asyncHandler(async (req, res) =>
    ok(res, await service.removeItem(req.params.id, req.params.itemId))
  )
)

router.post(
  '/:id/publish',
  requireRole('staff'),
  validate({ params: common.idParam, body: z.object({ isPublished: z.boolean().default(true) }) }),
  asyncHandler(async (req, res) => ok(res, await service.publish(req.params.id, req.body.isPublished)))
)

/** Sous-routeur public monté sur /editions/:editionId/galleries. */
export const editionRouter = Router({ mergeParams: true })

editionRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    ok(
      res,
      await service.listForEdition(req.params.editionId, { publishedOnly: !isStaff(req) })
    )
  )
)

export default router
