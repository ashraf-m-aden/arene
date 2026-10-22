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

/**
 * Rendez-vous d'une edition, avec leur occupation. La liste est reservee a
 * l'organisation : les candidats ne voient jamais la grille, seulement la date et
 * l'heure de leur propre rendez-vous, communiquee par message.
 */
export async function listForEdition(editionId) {
  const slots = await Slot.find({ editionId, status: { $ne: 'cancelled' } }).sort({ startsAt: 1 })
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

/**
 * Occupation d'un rendez-vous. `total` fait foi : c'est l'effectif qui remplit un
 * rendez-vous. Les entrees par role restent calculees pour les editions 1v1, qui
 * s'en servent pour composer les rencontres et pour l'ecran de check-in.
 */
export async function occupancy(slot) {
  const { rosterForSlot } = await registrationsService()
  const roster = await rosterForSlot(slot._id)
  const used = { striker: 0, defender: 0 }
  for (const registration of roster) {
    if (registration.role && used[registration.role] !== undefined) used[registration.role] += 1
  }
  return {
    total: { used: roster.length, capacity: capacityTotal(slot) },
    striker: { used: used.striker, capacity: slot.capacity?.striker || 0 },
    defender: { used: used.defender, capacity: slot.capacity?.defender || 0 }
  }
}

/** Effectif accepte par un rendez-vous, avec repli sur la somme des roles. */
export function capacityTotal(slot) {
  const capacity = slot.capacity || {}
  if (capacity.total > 0) return capacity.total
  return (capacity.striker || 0) + (capacity.defender || 0)
}

/** Reste-t-il une place ? L'effectif global l'emporte quand il est renseigne. */
function hasRoom(load, role) {
  if (load.total.capacity > 0) return load.total.used < load.total.capacity
  if (role && load[role]) return load[role].used < load[role].capacity
  return false
}

/**
 * Filtre Mongo sur la categorie : un rendez-vous sans categorie accueille tout le
 * monde, un rendez-vous categorise n'accueille que la sienne.
 */
function categoryFilter(ageCategory) {
  if (!ageCategory) return {}
  return {
    $or: [
      { ageCategory },
      { ageCategory: null },
      { ageCategory: { $exists: false } }
    ]
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
    status: { $in: ['planned', 'open'] },
    ...categoryFilter(registration.ageCategory)
  }).sort({ startsAt: 1 })

  for (const slot of candidates) {
    const load = await occupancy(slot)
    if (hasRoom(load, registration.role)) {
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

/**
 * Construit l'instant exact correspondant a une heure locale.
 *
 * Le client envoie le jour (`2026-12-25`), l'heure (`08:30`) et son decalage par
 * rapport a UTC. Sans ce decalage, un serveur en UTC placerait les rendez-vous
 * trois heures a cote pour Djibouti.
 */
function instantFrom(day, time, offsetMinutes) {
  const [year, month, dayOfMonth] = String(day).slice(0, 10).split('-').map(Number)
  const [hours, minutes] = String(time).split(':').map(Number)
  return new Date(Date.UTC(year, month - 1, dayOfMonth, hours, minutes) - offsetMinutes * 60000)
}

/** Les rendez-vous possibles dans la plage horaire d'une journee. */
function cellsForDay(day, startTime, endTime, durationMinutes, offsetMinutes) {
  const cells = []
  const dayEnd = instantFrom(day, endTime, offsetMinutes)
  let start = instantFrom(day, startTime, offsetMinutes)
  while (true) {
    const end = new Date(start.getTime() + durationMinutes * 60000)
    if (end > dayEnd) break
    cells.push({ startsAt: start, endsAt: end })
    start = end
  }
  return cells
}

/**
 * Repartit `needed` rendez-vous sur les jours demandes, au plus equilibre.
 *
 * Remplir le premier jour avant d'entamer le suivant ferait venir tout le monde
 * le lundi ; on etale donc la charge, en donnant une unite de plus aux premiers
 * jours quand la division n'est pas ronde. Chaque journee garde ses rendez-vous
 * contigus depuis son heure d'ouverture.
 */
function spreadOverDays(grid, needed) {
  const dayKeys = [...new Set(grid.map((cell) => cell.day))]
  const perDay = Math.floor(needed / dayKeys.length)
  const extra = needed % dayKeys.length

  const quota = new Map(dayKeys.map((key, index) => [key, perDay + (index < extra ? 1 : 0)]))
  const taken = []
  for (const cell of grid) {
    const left = quota.get(cell.day) || 0
    if (left <= 0) continue
    quota.set(cell.day, left - 1)
    taken.push(cell)
  }
  return taken.sort((a, b) => a.startsAt - b.startsAt)
}

/**
 * Repartition automatique : cree la grille de rendez-vous demandee puis y place
 * les dossiers acceptes qui attendent une convocation.
 *
 * Rien n'est envoye ici. L'organisation relit le calendrier, puis declenche les
 * convocations par l'envoi groupe — une repartition se corrige, un message parti
 * ne se rattrape pas.
 */
export async function distribute(editionId, input, actorId = null) {
  const {
    days,
    startTime,
    endTime,
    durationMinutes,
    perSlot,
    offsetMinutes = 0,
    ageCategory,
    venue,
    labelPrefix,
    dryRun = false
  } = input

  const registrations = await registrationsService()

  const grid = []
  for (const day of [...new Set(days)].sort()) {
    for (const cell of cellsForDay(day, startTime, endTime, durationMinutes, offsetMinutes)) {
      grid.push({ ...cell, day: String(day).slice(0, 10) })
    }
  }
  if (!grid.length) {
    throw badRequest('La plage horaire ne permet aucun rendez-vous').withKey('emptySchedule')
  }

  const waiting = await registrations.listAwaitingSlot(editionId, { ageCategory })
  const capacity = grid.length * perSlot
  const needed = Math.min(grid.length, Math.ceil(waiting.length / perSlot) || 0)
  const chosen = needed ? spreadOverDays(grid, needed) : []

  const summary = {
    waiting: waiting.length,
    gridSlots: grid.length,
    gridCapacity: capacity,
    slotsUsed: chosen.length,
    placed: Math.min(waiting.length, chosen.length * perSlot),
    leftOver: Math.max(0, waiting.length - chosen.length * perSlot),
    firstStartsAt: chosen[0]?.startsAt ?? null,
    lastEndsAt: chosen[chosen.length - 1]?.endsAt ?? null
  }

  // Apercu : on annonce ce qui se passerait, sans rien ecrire.
  if (dryRun) return { ...summary, dryRun: true, created: [] }

  let cursor = 0
  const created = []
  for (const [index, cell] of chosen.entries()) {
    const slot = await Slot.create({
      editionId,
      label: `${labelPrefix || 'Rendez-vous'} ${index + 1}`,
      startsAt: cell.startsAt,
      endsAt: cell.endsAt,
      capacity: { total: perSlot },
      ageCategory: ageCategory || undefined,
      venue,
      status: 'planned'
    })

    for (const registration of waiting.slice(cursor, cursor + perSlot)) {
      await registrations.attachSlot(registration._id, slot._id, actorId)
      bus.emitEvent('slot.assigned', {
        registrationId: String(registration._id),
        editionId: String(editionId),
        slotId: String(slot._id)
      })
    }
    cursor += perSlot
    created.push(slot)
  }

  logger.info(
    { editionId: String(editionId), slots: created.length, placed: summary.placed },
    'repartition automatique effectuee'
  )
  return { ...summary, dryRun: false, created }
}

/** Déplacement manuel par le staff, ou demande du candidat avant la limite. */
export async function assign(slotId, registrationId, actorId, { byCandidate = false } = {}) {
  const slot = await getById(slotId)
  const registrations = await registrationsService()
  const registration = await registrations.getById(registrationId)

  // Un rendez-vous sans categorie accueille tout le monde.
  if (slot.ageCategory && String(registration.ageCategory) !== String(slot.ageCategory)) {
    throw badRequest('Créneau d’une autre catégorie d’âge').withKey('slotWrongCategory')
  }
  if (byCandidate && slot.startsAt.getTime() - Date.now() < SWITCH_DEADLINE_MS) {
    throw badRequest('Changement possible jusqu’à 48 h avant le créneau')
  }

  const load = await occupancy(slot)
  if (!hasRoom(load, registration.role)) {
    throw conflict('Ce rendez-vous est complet').withKey('slotFull')
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
