import { asyncHandler, created, ok } from '../../core/utils/http.js'
import * as service from './editions.service.js'

export const list = asyncHandler(async (req, res) => {
  const includeDrafts = ['staff', 'admin'].includes(req.user?.role)
  ok(res, await service.list({ ...req.validatedQuery, includeDrafts }))
})

const isOrganisation = (req) => ['staff', 'admin'].includes(req.user?.role)

/**
 * L'organisation voit les compteurs complets ; le public ne recoit les chiffres
 * d'une categorie qu'une fois son plafond presque atteint (voir `publicSeats`).
 */
const seatsFor = async (req, editionId) => {
  const seats = await service.seatsLeft(editionId)
  return isOrganisation(req) ? seats : service.publicSeats(seats)
}

export const current = asyncHandler(async (req, res) => {
  const edition = await service.getCurrent()
  if (!edition) return ok(res, null)
  return ok(res, { ...edition.toJSON(), seats: await seatsFor(req, edition._id) })
})

export const detail = asyncHandler(async (req, res) => {
  const edition = await service.getBySlug(req.params.slug, { publicOnly: !isOrganisation(req) })
  ok(res, { ...edition.toJSON(), seats: await seatsFor(req, edition._id) })
})

export const create = asyncHandler(async (req, res) => {
  created(res, await service.create(req.body, req.user.id))
})

export const update = asyncHandler(async (req, res) => {
  ok(res, await service.update(req.params.id, req.body))
})

export const transition = asyncHandler(async (req, res) => {
  ok(res, await service.transition(req.params.id, req.body, req.user.id))
})

export const stats = asyncHandler(async (req, res) => {
  ok(res, await service.stats(req.params.id))
})
