import { badRequest, conflict, notFound } from '../../core/errors.js'
import bus from '../../core/events.js'
import logger from '../../core/logger.js'
import { CheckinOperation, Slot } from './slots.model.js'

const registrationsService = () => import('../registrations/registrations.service.js')

/** Un candidat peut demander un autre créneau tant qu'il reste 48 h avant le début. */
const SWITCH_DEADLINE_MS = 48 * 60 * 60 * 1000

export async function countForEdition(editionId) {
  return Slot.countDocuments({ editionId, status: { $ne: 'cancelled' } })
}

export async function listForEdition(editionId, { publicView = true } = {}) {
  const slots = await Slot.find({ editionId, status: { $ne: 'cancelled' } }).sort({ startsAt: 1 })
  if (!publicView) return slots
  // Vue publique : horaires et places, jamais les noms.
  return Promise.all(
    slots.map(async (slot) => ({
      ...slot.toJSON(),
      occupancy: await occupancy(slot)
    }))
  )
}

export async function getById(id) {
  const slot = await Slot.findById(id)
  if (!slot) throw notFound('Créneau introuvable')
  return slot
}

export async function create(input) {
  return Slot.create(input)
}

export async function update(id, patch) {
  const slot = await Slot.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
  if (!slot) throw notFound('Créneau introuvable')
  return slot
}

export async function occupancy(slot) {
  const { rosterForSlot } = await registrationsService()
  const roster = await rosterForSlot(slot._id)
  const used = { striker: 0, defender: 0 }
  for (const registration of roster) {
    if (registration.role) used[registration.role] += 1
  }
  return {
    striker: { used: used.striker, capacity: slot.capacity.striker },
    defender: { used: used.defender, capacity: slot.capacity.defender }
  }
}

/**
 * Attribution automatique : premier créneau de la même catégorie
 * où le rôle du joueur a encore une place libre.
 */
export async function autoAssign(registrationId, actorId = null) {
  const registrations = await registrationsService()
  const registration = await registrations.getById(registrationId)

  const candidates = await Slot.find({
    editionId: registration.editionId,
    ageCategory: registration.ageCategory,
    status: { $in: ['planned', 'open'] }
  }).sort({ startsAt: 1 })

  for (const slot of candidates) {
    const load = await occupancy(slot)
    if (load[registration.role].used < load[registration.role].capacity) {
      await registrations.attachSlot(registration._id, slot._id, actorId)
      bus.emitEvent('slot.assigned', {
        registrationId: String(registration._id),
        editionId: String(registration.editionId),
        slotId: String(slot._id)
      })
      return slot
    }
  }

  logger.warn({ registrationId: String(registrationId) }, 'aucun créneau libre : dossier en attente')
  return null
}

/** Déplacement manuel par le staff, ou demande du candidat avant la limite. */
export async function assign(slotId, registrationId, actorId, { byCandidate = false } = {}) {
  const slot = await getById(slotId)
  const registrations = await registrationsService()
  const registration = await registrations.getById(registrationId)

  if (String(registration.ageCategory) !== String(slot.ageCategory)) {
    throw badRequest('Créneau d’une autre catégorie d’âge')
  }
  if (byCandidate && slot.startsAt.getTime() - Date.now() < SWITCH_DEADLINE_MS) {
    throw badRequest('Changement possible jusqu’à 48 h avant le créneau')
  }

  const load = await occupancy(slot)
  if (load[registration.role].used >= load[registration.role].capacity) {
    throw conflict('Ce créneau est complet pour ce rôle')
  }

  await registrations.attachSlot(registration._id, slot._id, actorId)
  bus.emitEvent('slot.assigned', {
    registrationId: String(registration._id),
    editionId: String(registration.editionId),
    slotId: String(slot._id)
  })
  return slot
}

export async function roster(slotId) {
  const slot = await getById(slotId)
  const { rosterForSlot } = await registrationsService()
  return { slot, players: await rosterForSlot(slot._id) }
}

/** Scan du QR : renvoie la fiche à contrôler avant encaissement. */
export async function scan(qrToken) {
  const { findByQrToken } = await registrationsService()
  const registration = await findByQrToken(qrToken)
  const edition = await (await import('../editions/editions.service.js')).getById(
    registration.editionId
  )
  return {
    registration,
    fee: edition.fee,
    requiresOriginalBulletin: edition.rules?.requiresOriginalBulletin !== false,
    randomCheck: registration.randomCheck
  }
}

export async function confirmCheckin(registrationId, staffId, body) {
  const registrations = await registrationsService()
  const { registration, alreadyCheckedIn } = await registrations.checkIn(registrationId, staffId, {
    payment: body.payment,
    bulletinChecked: body.bulletinChecked,
    contractSigned: body.contractSigned
  })
  return { registration, alreadyCheckedIn }
}

/** Rejoue un lot d'opérations enregistrées hors ligne, une seule fois chacune. */
export async function syncCheckins(operations, staffId) {
  const results = []
  const registrations = await registrationsService()

  for (const operation of operations) {
    const existing = await CheckinOperation.findOne({ idempotencyKey: operation.idempotencyKey })
    if (existing) {
      results.push({ idempotencyKey: operation.idempotencyKey, outcome: 'duplicate' })
      continue
    }

    try {
      const { registration, alreadyCheckedIn } = await registrations.checkIn(
        operation.registrationId,
        staffId,
        {
          payment: operation.payment,
          bulletinChecked: operation.bulletinChecked,
          contractSigned: operation.contractSigned,
          occurredAt: operation.occurredAt
        }
      )
      await CheckinOperation.create({
        idempotencyKey: operation.idempotencyKey,
        registrationId: operation.registrationId,
        slotId: registration.slotId,
        staffId,
        occurredAt: operation.occurredAt,
        outcome: alreadyCheckedIn ? 'duplicate' : 'applied'
      })
      results.push({
        idempotencyKey: operation.idempotencyKey,
        outcome: alreadyCheckedIn ? 'duplicate' : 'applied',
        bibNumber: registration.bibNumber
      })
    } catch (error) {
      await CheckinOperation.create({
        idempotencyKey: operation.idempotencyKey,
        registrationId: operation.registrationId,
        staffId,
        occurredAt: operation.occurredAt,
        outcome: 'failed',
        error: error.message
      })
      results.push({
        idempotencyKey: operation.idempotencyKey,
        outcome: 'failed',
        error: error.message
      })
    }
  }

  return { applied: results.filter((r) => r.outcome === 'applied').length, results }
}

/** Récapitulatif de caisse : par créneau et par membre du staff. */
export async function cashReport(slotId) {
  const slot = await getById(slotId)
  const { rosterForSlot } = await registrationsService()
  const roster = await rosterForSlot(slot._id)

  const byStaff = new Map()
  let paidCount = 0
  let exemptCount = 0
  let expected = 0

  for (const registration of roster) {
    if (registration.status !== 'checked_in') continue
    const payment = registration.payment || {}
    const key = String(payment.receivedBy || 'inconnu')
    const entry = byStaff.get(key) || { staffId: key, paid: 0, exempt: 0, amount: 0 }
    if (payment.status === 'paid') {
      entry.paid += 1
      entry.amount += payment.amount || 0
      paidCount += 1
      expected += payment.amount || 0
    } else if (payment.status === 'exempt') {
      entry.exempt += 1
      exemptCount += 1
    }
    byStaff.set(key, entry)
  }

  return {
    slot,
    totals: { paid: paidCount, exempt: exemptCount, expected },
    byStaff: [...byStaff.values()]
  }
}

/** Clôture : les inscrits non pointés passent en no_show et libèrent leur place. */
export async function close(slotId, actorId) {
  const slot = await getById(slotId)
  const { markNoShows } = await registrationsService()
  const noShows = await markNoShows(slot._id, actorId)
  slot.status = 'closed'
  slot.closedAt = new Date()
  await slot.save()
  bus.emitEvent('slot.closed', { slotId: String(slot._id), noShows })
  return { slot, noShows }
}

/** Rappel de convocation programmé la veille du créneau. */
export function reminderDelayFor(slot) {
  const target = new Date(slot.startsAt).getTime() - 24 * 60 * 60 * 1000
  return Math.max(0, target - Date.now())
}
