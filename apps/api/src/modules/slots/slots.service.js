import { badRequest, conflict, notFound } from '../../core/errors.js'
import bus from '../../core/events.js'
import logger from '../../core/logger.js'
import { CheckinOperation, Slot } from './slots.model.js'

const registrationsService = () => import('../registrations/registrations.service.js')
const editionsService = () => import('../editions/editions.service.js')

/** Un candidat peut demander un autre créneau tant qu'il reste 48 h avant le début. */
const SWITCH_DEADLINE_MS = 48 * 60 * 60 * 1000

export async function countForEdition(editionId, { kind } = {}) {
  return Slot.countDocuments({
    editionId,
    status: { $ne: 'cancelled' },
    ...(kind ? { kind } : {})
  })
}

/**
 * Rendez-vous d'une edition, avec leur occupation. La liste est reservee a
 * l'organisation : les candidats ne voient jamais la grille, seulement la date et
 * l'heure de leur propre rendez-vous, communiquee par message.
 *
 * `kind` separe les deux grilles : l'ecran de check-in ne doit proposer que des
 * rendez-vous administratifs, celui de saisie des resultats que des sessions de
 * jeu. Sans filtre, le staff choisissait dans une liste melangee.
 */
export async function listForEdition(editionId, { kind } = {}) {
  const slots = await Slot.find({
    editionId,
    status: { $ne: 'cancelled' },
    ...(kind ? { kind } : {})
  }).sort({ startsAt: 1 })
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

/** Nature attendue, sinon on refuse : un rendez-vous ne tient pas les deux rôles. */
function assertKind(slot, kind) {
  if (slot.kind !== kind) {
    throw badRequest(
      kind === 'checkin'
        ? 'Ce créneau est une session de jeu, pas un rendez-vous administratif'
        : 'Ce créneau est un rendez-vous administratif, pas une session de jeu'
    ).withKey(kind === 'checkin' ? 'notACheckinSlot' : 'notACompetitionSlot')
  }
}

/**
 * Place un rendez-vous du bon cote du coup d'envoi.
 *
 * Les validations, signatures et encaissements se terminent avant le tournoi —
 * un rendez-vous administratif pose pendant les duels ferait signer un contrat
 * de participation a quelqu'un dont les rencontres sont deja generees. A
 * l'inverse une session de jeu placee avant le debut du tournoi est une erreur
 * de saisie. La cible d'une semaine (`checkinDeadline`) reste indicative : elle
 * guide la repartition automatique, elle ne bloque pas un retardataire.
 */
async function assertWindow(editionId, { kind, startsAt, endsAt }) {
  const editions = await editionsService()
  const edition = await editions.getById(editionId)
  if (!edition.startsAt) return

  const start = new Date(edition.startsAt)
  if (kind === 'checkin' && new Date(endsAt) > start) {
    throw badRequest(
      'Un rendez-vous administratif doit se terminer avant le début du tournoi'
    ).withKey('checkinAfterStart')
  }
  if (kind === 'competition' && new Date(startsAt) < start) {
    throw badRequest(
      'Une session de jeu ne peut pas précéder le début du tournoi'
    ).withKey('sessionBeforeStart')
  }
}

export async function create(input) {
  await assertWindow(input.editionId, input)
  return Slot.create(input)
}

export async function update(id, patch) {
  /*
   * On ne valide la fenetre que si le patch y touche, et sur l'etat resultant.
   * La revalider a chaque modification bloquerait un simple changement
   * d'intitule sur un creneau devenu hors fenetre parce que les dates du
   * tournoi ont bouge depuis — alors que c'est justement l'etat qu'on veut
   * pouvoir corriger.
   */
  const touchesWindow = ['kind', 'startsAt', 'endsAt'].some((key) => patch[key] !== undefined)
  if (touchesWindow) {
    const current = await getById(id)
    await assertWindow(current.editionId, {
      kind: patch.kind ?? current.kind,
      startsAt: patch.startsAt ?? current.startsAt,
      endsAt: patch.endsAt ?? current.endsAt
    })
  }

  const slot = await Slot.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
  if (!slot) throw notFound('Créneau introuvable')
  return slot
}

/**
 * Liste d'un creneau, selon sa nature : les convoques pour un rendez-vous
 * administratif (`slotId`), les joueurs pour une session de jeu (`sessionId`).
 */
export async function rosterOf(slot) {
  const { rosterForSlot, rosterForSession } = await registrationsService()
  return slot.kind === 'competition'
    ? rosterForSession(slot._id)
    : rosterForSlot(slot._id)
}

/**
 * Occupation d'un rendez-vous. `total` fait foi : c'est l'effectif qui remplit un
 * rendez-vous. Les entrees par role restent calculees pour les editions 1v1, qui
 * s'en servent pour composer les rencontres et pour l'ecran de check-in.
 */
export async function occupancy(slot) {
  const roster = await rosterOf(slot)
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

/**
 * Reste-t-il une place ?
 *
 * Pour un rendez-vous administratif, l'effectif global l'emporte : on y pointe
 * des gens, leur role est sans importance. Pour une session de jeu c'est
 * l'inverse — le plafond par role fait foi des qu'il est renseigne, sinon une
 * session se remplirait de vingt buteurs et ne produirait aucune rencontre,
 * `generateMatches` ayant besoin des deux camps.
 */
function hasRoom(load, role, kind = 'checkin') {
  const byRole = role && load[role] && load[role].capacity > 0
  if (kind === 'competition' && byRole) return load[role].used < load[role].capacity
  if (load.total.capacity > 0) return load.total.used < load.total.capacity
  if (byRole) return load[role].used < load[role].capacity
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
 * Convocation automatique au rendez-vous administratif : premier creneau de la
 * meme categorie ou le role du joueur a encore une place libre.
 *
 * Ne considere que les creneaux `checkin` — c'est la convocation qui suit
 * l'acceptation du dossier, une semaine avant le tournoi. L'affectation aux
 * sessions de jeu est un autre moment : elle passe par `distribute` en masse,
 * ou par `assign` au cas par cas.
 */
export async function autoAssign(registrationId, actorId = null) {
  const registrations = await registrationsService()
  const registration = await registrations.getById(registrationId)

  const candidates = await Slot.find({
    editionId: registration.editionId,
    kind: 'checkin',
    status: { $in: ['planned', 'open'] },
    ...categoryFilter(registration.ageCategory)
  }).sort({ startsAt: 1 })

  for (const slot of candidates) {
    const load = await occupancy(slot)
    if (hasRoom(load, registration.role, 'checkin')) {
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
 * Groupes a placer, un par creneau a creer.
 *
 * Un rendez-vous administratif accueille `perSlot` convoques sans distinction :
 * on y controle des identites, le role n'a aucune importance. Une session de jeu
 * doit au contraire reunir les deux camps — une session de vingt buteurs ne
 * produit aucune rencontre — donc l'effectif y est coupe en deux files, et
 * chaque session prend sa part de chacune.
 */
function groupsFor(kind, perSlot, { waiting, strikers, defenders }) {
  if (kind !== 'competition') {
    const groups = []
    for (let i = 0; i < waiting.length; i += perSlot) groups.push(waiting.slice(i, i + perSlot))
    return { groups, perRole: null }
  }

  const strikerSeats = Math.floor(perSlot / 2)
  const defenderSeats = perSlot - strikerSeats
  const count = Math.max(
    Math.ceil(strikers.length / strikerSeats) || 0,
    Math.ceil(defenders.length / defenderSeats) || 0
  )

  const groups = []
  for (let i = 0; i < count; i += 1) {
    groups.push([
      ...strikers.slice(i * strikerSeats, (i + 1) * strikerSeats),
      ...defenders.slice(i * defenderSeats, (i + 1) * defenderSeats)
    ])
  }
  return { groups, perRole: { striker: strikerSeats, defender: defenderSeats } }
}

/**
 * Repartition automatique : cree la grille demandee puis y place les dossiers
 * en attente.
 *
 * Deux usages selon `kind`. En `checkin` elle convoque les dossiers acceptes au
 * rendez-vous administratif, dans la semaine qui precede le tournoi. En
 * `competition` elle repartit les inscrits sur les sessions de jeu, pendant le
 * tournoi — ceux-la ont deja signe et paye, il ne s'agit plus que de leur
 * donner un terrain et une heure.
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
    kind = 'checkin',
    pitches = 2,
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

  /*
   * La grille entiere est validee avant la moindre ecriture : une repartition
   * qui creerait des rendez-vous administratifs a cheval sur le tournoi doit
   * echouer d'un bloc, pas apres en avoir pose la moitie.
   */
  await assertWindow(editionId, {
    kind,
    startsAt: grid[0].startsAt,
    endsAt: grid[grid.length - 1].endsAt
  })

  const competition = kind === 'competition'
  if (competition && perSlot < 2) {
    throw badRequest(
      'Une session de jeu accueille au moins un buteur et un défenseur'
    ).withKey('sessionTooSmall')
  }

  const [waiting, strikers, defenders] = competition
    ? [
        [],
        await registrations.listAwaitingSession(editionId, { ageCategory, role: 'striker' }),
        await registrations.listAwaitingSession(editionId, { ageCategory, role: 'defender' })
      ]
    : [await registrations.listAwaitingSlot(editionId, { ageCategory }), [], []]

  const pending = competition ? strikers.length + defenders.length : waiting.length
  const { groups, perRole } = groupsFor(kind, perSlot, { waiting, strikers, defenders })
  const needed = Math.min(grid.length, groups.length)
  const chosen = needed ? spreadOverDays(grid, needed) : []
  const used = groups.slice(0, chosen.length)
  const placed = used.reduce((sum, group) => sum + group.length, 0)

  const summary = {
    kind,
    waiting: pending,
    ...(competition ? { waitingByRole: { striker: strikers.length, defender: defenders.length } } : {}),
    gridSlots: grid.length,
    gridCapacity: grid.length * perSlot,
    slotsUsed: chosen.length,
    placed,
    leftOver: Math.max(0, pending - placed),
    firstStartsAt: chosen[0]?.startsAt ?? null,
    lastEndsAt: chosen[chosen.length - 1]?.endsAt ?? null
  }

  // Apercu : on annonce ce qui se passerait, sans rien ecrire.
  if (dryRun) return { ...summary, dryRun: true, created: [] }

  const created = []
  for (const [index, cell] of chosen.entries()) {
    const slot = await Slot.create({
      editionId,
      kind,
      label: `${labelPrefix || (competition ? 'Session' : 'Rendez-vous')} ${index + 1}`,
      startsAt: cell.startsAt,
      endsAt: cell.endsAt,
      capacity: { total: perSlot, ...(perRole || {}) },
      ageCategory: ageCategory || undefined,
      pitches: competition ? pitches : 1,
      venue,
      status: 'planned'
    })

    for (const registration of used[index]) {
      if (competition) await registrations.attachSession(registration._id, slot._id, actorId)
      else await registrations.attachSlot(registration._id, slot._id, actorId)
      bus.emitEvent('slot.assigned', {
        registrationId: String(registration._id),
        editionId: String(editionId),
        slotId: String(slot._id),
        kind
      })
    }
    created.push(slot)
  }

  logger.info(
    { editionId: String(editionId), kind, slots: created.length, placed: summary.placed },
    'repartition automatique effectuee'
  )
  return { ...summary, dryRun: false, created }
}

/**
 * Deplacement manuel par le staff, ou demande du candidat avant la limite.
 *
 * Sert les deux natures de creneau : sur un `checkin` elle convoque (et fait
 * passer le dossier en `scheduled`), sur une `competition` elle affecte a une
 * session sans toucher au statut — l'inscription est deja scellee.
 */
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
  if (!hasRoom(load, registration.role, slot.kind)) {
    throw conflict('Ce rendez-vous est complet').withKey('slotFull')
  }

  if (slot.kind === 'competition') {
    await registrations.attachSession(registration._id, slot._id, actorId)
  } else {
    await registrations.attachSlot(registration._id, slot._id, actorId)
  }
  bus.emitEvent('slot.assigned', {
    registrationId: String(registration._id),
    editionId: String(registration.editionId),
    slotId: String(slot._id),
    kind: slot.kind
  })
  return slot
}

export async function roster(slotId) {
  const slot = await getById(slotId)
  return { slot, players: await rosterOf(slot) }
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

/**
 * Recapitulatif de caisse : par rendez-vous et par membre du staff.
 *
 * Reserve aux rendez-vous administratifs : c'est la qu'on encaisse, une semaine
 * avant le tournoi. Une session de jeu n'a pas de caisse.
 */
export async function cashReport(slotId) {
  const slot = await getById(slotId)
  assertKind(slot, 'checkin')
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

/**
 * Cloture d'un creneau. Les absents passent en `no_show` et liberent leur place,
 * mais « absent » ne veut pas dire la meme chose des deux cotes.
 *
 * Sur un rendez-vous administratif, c'est un convoque (`scheduled`) qui ne s'est
 * pas presente : il n'a ni signe ni paye. Sur une session de jeu, c'est un
 * inscrit (`checked_in`) qui a signe et paye la semaine precedente puis n'est pas
 * venu jouer — on ne retient donc que ceux dont aucune rencontre n'a ete jouee,
 * pour ne pas marquer absent quelqu'un qui etait bien la.
 */
export async function close(slotId, actorId) {
  const slot = await getById(slotId)
  const registrations = await registrationsService()

  let noShows
  if (slot.kind === 'competition') {
    const { playedRegistrationIds } = await import('../results/results.service.js')
    const played = await playedRegistrationIds(slot._id)
    noShows = await registrations.markCompetitionNoShows(slot._id, actorId, played)
  } else {
    noShows = await registrations.markNoShows(slot._id, actorId)
  }

  slot.status = 'closed'
  slot.closedAt = new Date()
  await slot.save()
  bus.emitEvent('slot.closed', { slotId: String(slot._id), kind: slot.kind, noShows })
  return { slot, noShows }
}

/** Rappel de convocation programmé la veille du créneau. */
export function reminderDelayFor(slot) {
  const target = new Date(slot.startsAt).getTime() - 24 * 60 * 60 * 1000
  return Math.max(0, target - Date.now())
}
