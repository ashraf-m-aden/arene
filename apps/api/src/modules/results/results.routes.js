import { Router } from 'express'
import {
  common,
  finalsSelectSchema,
  generateMatchesSchema,
  matchResultSchema,
  rankingQuerySchema
} from '@arene/shared'
import { requireRole } from '../../core/middlewares/auth.js'
import { validate } from '../../core/middlewares/validate.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import * as editionsService from '../editions/editions.service.js'
import * as service from './results.service.js'

/** Routeur principal, monté sur /matches. */
export const router = Router()

router.put(
  '/:id/result',
  requireRole('staff'),
  validate({ params: common.idParam, body: matchResultSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await service.recordResult(req.params.id, req.body, req.user.id))
  )
)

/** Sous-routeur monté sur /slots/:slotId/matches. */
export const slotRouter = Router({ mergeParams: true })

slotRouter.use(requireRole('staff'))

slotRouter.get(
  '/',
  asyncHandler(async (req, res) => ok(res, await service.listForSlot(req.params.slotId)))
)

slotRouter.post(
  '/generate',
  validate({ body: generateMatchesSchema }),
  asyncHandler(async (req, res) =>
    created(res, await service.generateForSlot(req.params.slotId, req.body))
  )
)

/** Sous-routeur public monté sur /editions/:editionId/rankings. */
export const rankingsRouter = Router({ mergeParams: true })

rankingsRouter.get(
  '/players',
  validate({ query: rankingQuerySchema }),
  asyncHandler(async (req, res) => {
    const { ageCategory, limit } = req.validatedQuery
    const rankings = await service.playerRankings(req.params.editionId, { ageCategory })
    ok(res, {
      strikers: rankings.strikers.slice(0, limit),
      defenders: rankings.defenders.slice(0, limit)
    })
  })
)

rankingsRouter.get(
  '/schools',
  asyncHandler(async (req, res) => {
    // Les pages publiques lisent le cache ; il est recalculé à chaque résultat saisi.
    const cache = await editionsService.getRankingsCache(req.params.editionId)
    if (cache?.schoolsByCategory) {
      return ok(res, cache.schoolsByCategory, { computedAt: cache.computedAt, cached: true })
    }
    return ok(res, await service.schoolRankings(req.params.editionId), { cached: false })
  })
)

rankingsRouter.post(
  '/refresh',
  requireRole('staff'),
  asyncHandler(async (req, res) => ok(res, await service.refreshRankings(req.params.editionId)))
)

/** Sous-routeur monté sur /editions/:editionId/finals. */
export const finalsRouter = Router({ mergeParams: true })

finalsRouter.get(
  '/',
  asyncHandler(async (req, res) =>
    ok(res, await service.listFinals(req.params.editionId, req.query.ageCategory))
  )
)

finalsRouter.post(
  '/select',
  requireRole('admin'),
  validate({ body: finalsSelectSchema }),
  asyncHandler(async (req, res) =>
    ok(res, await service.selectFinalists(req.params.editionId, req.body))
  )
)

export default router
