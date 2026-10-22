import { asyncHandler, created, ok } from '../../core/utils/http.js'
import { recordAudit } from '../../core/middlewares/audit.js'
import { forbidden } from '../../core/errors.js'
import * as editionsService from '../editions/editions.service.js'
import * as slotsService from '../slots/slots.service.js'
import { buildBadgePdf } from './registrations.badge.js'
import * as service from './registrations.service.js'

export const createDraft = asyncHandler(async (req, res) => {
  created(res, await service.createDraft(req.body, req.user.id))
})

export const patch = asyncHandler(async (req, res) => {
  ok(res, await service.patch(req.params.id, req.user, req.body))
})

export const submit = asyncHandler(async (req, res) => {
  ok(res, await service.submit(req.params.id, req.user))
})

export const mine = asyncHandler(async (req, res) => {
  ok(res, await service.listMine(req.user.id))
})

export const detail = asyncHandler(async (req, res) => {
  const registration = await service.getById(req.params.id, req.user)
  if (['staff', 'admin'].includes(req.user.role)) {
    await recordAudit(req, 'registration.read', { kind: 'registration', id: req.params.id })
  }
  ok(res, registration)
})

export const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.validatedQuery)
  ok(res, items, meta)
})

export const review = asyncHandler(async (req, res) => {
  ok(res, await service.review(req.params.id, req.user.id, req.body))
})

export const badge = asyncHandler(async (req, res) => {
  const registration = await service.getById(req.params.id, req.user)
  if (!registration.qrToken) throw forbidden('Le badge est disponible après validation du dossier').withKey('badgeNotReady')

  const edition = await editionsService.getById(registration.editionId)
  const slot = registration.slotId ? await slotsService.getById(registration.slotId) : null
  const pdf = await buildBadgePdf({ registration, edition, slot })

  res.type('application/pdf')
  res.set(
    'Content-Disposition',
    `inline; filename="badge-${String(registration._id).slice(-6)}.pdf"`
  )
  res.send(pdf)
})

export const exportCsv = asyncHandler(async (req, res) => {
  const csv = await service.exportRows(req.validatedQuery.editionId)
  await recordAudit(req, 'registrations.export', {
    kind: 'edition',
    id: req.validatedQuery.editionId
  })
  res.type('text/csv; charset=utf-8')
  res.set('Content-Disposition', 'attachment; filename="inscriptions.csv"')
  res.send(csv)
})

/** Mon espace : téléchargement de ses propres données (RGPD). */
export const myData = asyncHandler(async (req, res) => {
  const registration = await service.getById(req.params.id, req.user)
  res.type('application/json')
  res.set('Content-Disposition', `attachment; filename="dossier-${String(registration._id).slice(-6)}.json"`)
  res.send(JSON.stringify(registration.toJSON(), null, 2))
})


