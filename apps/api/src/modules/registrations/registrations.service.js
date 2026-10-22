import crypto from 'node:crypto'
import {
  categoryFromSchoolType,
  checkEligibility,
  SEAT_HOLDING_STATUSES,
  canTransitionRegistration
} from '@arene/shared'
import { badRequest, conflict, forbidden, notFound } from '../../core/errors.js'
import { dedupeKey as buildDedupeKey, toCsv } from '../../core/utils/text.js'
import bus from '../../core/events.js'
import { Registration } from './registrations.model.js'

const editionsService = () => import('../editions/editions.service.js')
const schoolsService = () => import('../schools/schools.service.js')

const CANDIDATE_EDITABLE_STATUSES = ['draft', 'changes_requested']

async function assertOwnership(registration, user) {
  if (!user) throw forbidden()
  if (['staff', 'admin'].includes(user.role)) return
  // candidateId est peuplé pour les besoins des notifications : on compare l'identifiant.
  const ownerId = String(registration.candidateId?._id ?? registration.candidateId)
  if (ownerId !== String(user.id)) throw forbidden('Dossier d’un autre candidat').withKey('notYourFile')
}

function pushHistory(registration, to, by, note) {
  registration.history.push({ from: registration.status, to, by, at: new Date(), note })
  registration.status = to
}

export async function getById(id, user) {
  const registration = await Registration.findById(id)
    .populate('schoolId', 'name slug type city')
    .populate('candidateId', 'name email phone locale')
  if (!registration) throw notFound('Dossier introuvable').withKey('fileNotFound')
  if (user) await assertOwnership(registration, user)
  return registration
}

export async function createDraft({ editionId, locale }, candidateId) {
  const editions = await editionsService()
  const edition = await editions.getById(editionId)
  if (!edition.isRegistrationOpen) throw badRequest('Les inscriptions ne sont pas ouvertes').withKey('registrationsNotOpen')

  /*
   * Un seul dossier par candidat et par edition, quel que soit son statut. On
   * rend l'existant plutot que d'en ouvrir un second : sans ce controle, un
   * candidat dont le dossier etait deja envoye repartait sur un dossier vierge
   * et se retrouvait avec deux candidatures concurrentes dans la meme edition.
   */
  const existing = await Registration.findOne({ editionId, candidateId })
  if (existing) return existing

  // Le nom vient du compte : saisi une fois a l'inscription, jamais redemande.
  const { User } = await import('../auth/auth.model.js')
  const account = await User.findById(candidateId).select('name')

  return Registration.create({
    editionId,
    candidateId,
    locale,
    status: 'draft',
    step: 1,
    player: { name: account?.name || '' }
  })
}

/** Mise à jour d'une étape du formulaire ; le brouillon est enregistré à chaque étape. */
export async function patch(id, user, input) {
  const registration = await getById(id, user)
  if (!CANDIDATE_EDITABLE_STATUSES.includes(registration.status) && user.role === 'candidate') {
    throw badRequest('Ce dossier n’est plus modifiable').withKey('fileLocked')
  }

  if (input.newSchool) {
    const schools = await schoolsService()
    const school = await schools.createFromRegistration(input.newSchool)
    registration.schoolId = school._id
    registration.ageCategory = categoryFromSchoolType(school.type)
  } else if (input.schoolId) {
    const schools = await schoolsService()
    const school = await schools.getById(input.schoolId)
    registration.schoolId = school._id
    registration.ageCategory = categoryFromSchoolType(school.type)
  }

  if (input.player) registration.player = { ...registration.player?.toObject?.(), ...input.player }
  if (input.role) registration.role = input.role
  if (input.grades) registration.grades = { ...registration.grades?.toObject?.(), ...input.grades }
  if (input.consents) {
    registration.consents = {
      ...registration.consents?.toObject?.(),
      ...input.consents,
      submittedAt: new Date()
    }
  }

  registration.step = Math.max(
    registration.step,
    input.consents ? 4 : input.grades ? 3 : input.player || input.role ? 2 : 1
  )

  if (registration.player?.name && registration.player?.birthDate) {
    registration.dedupeKey = buildDedupeKey({
      name: registration.player.name,
      birthDate: registration.player.birthDate,
      schoolId: registration.schoolId
    })
  }

  await registration.save()
  return registration
}

/**
 * Envoi du dossier : contrôles automatiques, doublon et plafond de places.
 * Un dossier hors critères part quand même au staff, avec ses signalements.
 */
export async function submit(id, user) {
  const registration = await getById(id, user)
  if (!canTransitionRegistration(registration.status, 'submitted')) {
    throw badRequest('Ce dossier a déjà été envoyé').withKey('fileAlreadySubmitted')
  }

  const missing = []
  if (!registration.player?.name) missing.push('player.name')
  if (!registration.player?.birthDate) missing.push('player.birthDate')
  if (!registration.schoolId) missing.push('schoolId')
  if (!registration.role) missing.push('role')
  if (typeof registration.grades?.average !== 'number') missing.push('grades.average')
  if (!registration.grades?.bulletinFileId) missing.push('grades.bulletinFileId')
  if (!registration.consents?.participation) missing.push('consents.participation')
  if (!registration.consents?.bulletinAuthenticity) missing.push('consents.bulletinAuthenticity')
  if (missing.length) throw badRequest('Dossier incomplet', { missing }).withKey('fileIncomplete')

  const editions = await editionsService()
  const edition = await editions.getById(registration.editionId)
  if (!edition.isRegistrationOpen) throw badRequest('Les inscriptions sont fermées').withKey('registrationsClosed')

  const seats = await editions.seatsLeft(registration.editionId)
  const seatsLeftForRole = seats?.[registration.ageCategory]?.[registration.role]?.left ?? 0

  const { issues } = checkEligibility({
    birthDate: registration.player.birthDate,
    ageCategory: registration.ageCategory,
    gradeAverage: registration.grades.average,
    gradeThreshold: edition.rules?.gradeThreshold,
    roleSeatsLeft: seatsLeftForRole
  })

  const duplicate = await Registration.findOne({
    _id: { $ne: registration._id },
    editionId: registration.editionId,
    dedupeKey: registration.dedupeKey,
    status: { $nin: ['rejected', 'draft'] }
  })
  if (duplicate) {
    issues.push({ code: 'duplicate', field: 'player', detail: { registrationId: String(duplicate._id) } })
  }

  registration.flags = issues
  pushHistory(registration, 'submitted', user.id, 'envoi du dossier')
  await registration.save()

  bus.emitEvent('registration.submitted', {
    registrationId: String(registration._id),
    editionId: String(registration.editionId),
    flags: issues.map((i) => i.code)
  })
  return registration
}

export async function listMine(candidateId) {
  return Registration.find({ candidateId })
    .populate('schoolId', 'name slug type')
    .populate('slotId', 'label startsAt endsAt venue')
    .sort({ createdAt: -1 })
}

export async function list(query) {
  const { page = 1, limit = 25, q, ...rest } = query
  const filter = {}
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) filter[key] = value
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [
      { 'player.name': new RegExp(safe, 'i') },
      { bibNumber: Number.isNaN(Number(q)) ? -1 : Number(q) }
    ]
  }

  const [items, total] = await Promise.all([
    Registration.find(filter)
      .populate('schoolId', 'name slug type')
      .populate('slotId', 'label startsAt')
      .populate('candidateId', 'name email phone locale')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Registration.countDocuments(filter)
  ])
  return { items, meta: { total, page, limit, pages: Math.ceil(total / limit) || 1 } }
}

/** Décision du staff : approuver, refuser (motif obligatoire) ou demander une correction. */
export async function review(id, staffId, { decision, reason, randomCheck = false }) {
  const registration = await getById(id)
  if (!['submitted', 'under_review'].includes(registration.status)) {
    throw badRequest('Ce dossier n’est pas en attente de validation').withKey('fileNotPendingReview')
  }

  const target =
    decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'changes_requested'

  if (target === 'approved') {
    const editions = await editionsService()
    const seats = await editions.seatsLeft(registration.editionId)
    const left = seats?.[registration.ageCategory]?.[registration.role]?.left ?? 0
    if (left <= 0) throw conflict('Plus de place pour ce rôle dans cette catégorie').withKey('noSeatsLeft')
    registration.qrToken = crypto.randomBytes(24).toString('base64url')
    const edition = await editions.getById(registration.editionId)
    registration.payment = { ...registration.payment?.toObject?.(), amount: edition.fee, status: 'due' }
  }

  registration.reviewNotes = reason
  registration.reviewedBy = staffId
  registration.reviewedAt = new Date()
  registration.randomCheck = randomCheck
  pushHistory(registration, target, staffId, reason)
  await registration.save()

  const payload = {
    registrationId: String(registration._id),
    editionId: String(registration.editionId),
    reason
  }
  if (target === 'approved') bus.emitEvent('registration.approved', payload)
  if (target === 'rejected') bus.emitEvent('registration.rejected', payload)
  if (target === 'changes_requested') bus.emitEvent('registration.changes_requested', payload)

  return registration
}

/**
 * Dossiers désignés un par un, restreints à l'édition visée : un identifiant
 * venu d'ailleurs ne doit pas permettre d'écrire à quelqu'un d'une autre édition.
 */
export async function listByIds(editionId, ids) {
  return Registration.find({ editionId, _id: { $in: ids } })
    .populate('candidateId', 'email phone locale name')
    .sort({ createdAt: 1 })
}

/**
 * Dossiers acceptés qui n'ont pas encore de rendez-vous, du plus ancien au plus
 * récent. C'est la file d'attente que la répartition automatique consomme : le
 * premier à avoir envoyé son dossier passe le premier.
 */
export async function listAwaitingSlot(editionId, { ageCategory } = {}) {
  return Registration.find({
    editionId,
    status: 'approved',
    slotId: null,
    ...(ageCategory ? { ageCategory } : {})
  })
    .sort({ 'consents.submittedAt': 1, createdAt: 1 })
    .select('_id role ageCategory candidateId')
}

/** Appelée par le module Créneaux quand une place est attribuée. */
export async function attachSlot(registrationId, slotId, actorId) {
  const registration = await Registration.findById(registrationId)
  if (!registration) throw notFound('Dossier introuvable').withKey('fileNotFound')
  if (!['approved', 'scheduled'].includes(registration.status)) {
    throw badRequest('Seul un dossier accepté reçoit un créneau').withKey('onlyApprovedGetsSlot')
  }
  registration.slotId = slotId
  if (registration.status === 'approved') pushHistory(registration, 'scheduled', actorId, 'créneau attribué')
  await registration.save()
  return registration
}

export async function findByQrToken(qrToken) {
  const registration = await Registration.findOne({ qrToken })
    .populate('schoolId', 'name slug type')
    .populate('slotId', 'label startsAt endsAt venue')
  if (!registration) throw notFound('Badge inconnu').withKey('badgeUnknown')
  return registration
}

/**
 * Check-in : signature du contrat sur place, encaissement des frais, numéro de
 * dossard, statut inscrit (`checked_in`). Le contrat signé est une condition
 * bloquante, au même titre que le contrôle d'identité côté validation.
 */
export async function checkIn(registrationId, staffId, { payment, bulletinChecked, contractSigned, occurredAt }) {
  const registration = await Registration.findById(registrationId)
  if (!registration) throw notFound('Dossier introuvable').withKey('fileNotFound')
  if (registration.status === 'checked_in') {
    return { registration, alreadyCheckedIn: true }
  }
  if (!['approved', 'scheduled'].includes(registration.status)) {
    throw badRequest(`Dossier au statut ${registration.status} : inscription impossible`)
  }
  if (!contractSigned) throw badRequest('Le contrat doit être signé sur place avant l’inscription').withKey('contractRequired')

  registration.payment = {
    ...registration.payment?.toObject?.(),
    ...payment,
    receivedBy: staffId,
    receivedAt: occurredAt || new Date()
  }
  registration.contract = {
    signed: true,
    signedAt: occurredAt || new Date(),
    signedBy: staffId
  }
  registration.bibNumber = await nextBibNumber(registration.editionId)
  registration.checkedInAt = occurredAt || new Date()
  registration.checkedInBy = staffId
  pushHistory(registration, 'checked_in', staffId, bulletinChecked ? 'bulletin original vérifié' : undefined)
  await registration.save()

  bus.emitEvent('registration.checked_in', {
    registrationId: String(registration._id),
    editionId: String(registration.editionId),
    slotId: String(registration.slotId || ''),
    schoolId: String(registration.schoolId || '')
  })
  return { registration, alreadyCheckedIn: false }
}

async function nextBibNumber(editionId) {
  const last = await Registration.findOne({ editionId, bibNumber: { $ne: null } })
    .sort({ bibNumber: -1 })
    .select('bibNumber')
  return (last?.bibNumber || 100) + 1
}

/** Clôture d'un créneau : les inscrits non pointés passent en no_show. */
export async function markNoShows(slotId, actorId) {
  const pending = await Registration.find({ slotId, status: 'scheduled' })
  for (const registration of pending) {
    pushHistory(registration, 'no_show', actorId, 'absent à la clôture du créneau')
    await registration.save()
  }
  return pending.length
}

export async function setCompetitionStatus(registrationId, status, actorId, note) {
  const registration = await Registration.findById(registrationId)
  if (!registration) throw notFound('Dossier introuvable').withKey('fileNotFound')
  if (registration.status === status) return registration
  if (!canTransitionRegistration(registration.status, status)) {
    throw badRequest(`Transition refusée : ${registration.status} → ${status}`)
  }
  pushHistory(registration, status, actorId, note)
  await registration.save()
  if (status === 'qualified') {
    bus.emitEvent('registration.qualified', {
      registrationId: String(registration._id),
      editionId: String(registration.editionId)
    })
  }
  return registration
}

/** Nombre de dossiers occupant une place, par catégorie et par rôle. */
export async function countSeats(editionId) {
  const rows = await Registration.aggregate([
    { $match: { editionId: toObjectId(editionId), status: { $in: SEAT_HOLDING_STATUSES } } },
    { $group: { _id: { category: '$ageCategory', role: '$role' }, count: { $sum: 1 } } }
  ])
  const out = {}
  for (const row of rows) {
    const { category, role } = row._id
    if (!category || !role) continue
    out[category] = out[category] || {}
    out[category][role] = row.count
  }
  return out
}

export async function statsForEdition(editionId) {
  const match = { editionId: toObjectId(editionId) }
  const [byStatus, byRole, byCategory, bySchool, payments] = await Promise.all([
    Registration.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    Registration.aggregate([{ $match: match }, { $group: { _id: '$role', count: { $sum: 1 } } }]),
    Registration.aggregate([{ $match: match }, { $group: { _id: '$ageCategory', count: { $sum: 1 } } }]),
    Registration.aggregate([
      { $match: match },
      { $group: { _id: '$schoolId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 25 },
      {
        $lookup: { from: 'schools', localField: '_id', foreignField: '_id', as: 'school' }
      },
      { $project: { count: 1, school: { $arrayElemAt: ['$school', 0] } } }
    ]),
    Registration.aggregate([
      { $match: { ...match, status: 'checked_in' } },
      {
        $group: {
          _id: '$payment.status',
          count: { $sum: 1 },
          amount: { $sum: '$payment.amount' }
        }
      }
    ])
  ])

  const toMap = (rows) => Object.fromEntries(rows.map((r) => [r._id || 'inconnu', r.count]))
  return {
    byStatus: toMap(byStatus),
    byRole: toMap(byRole),
    byCategory: toMap(byCategory),
    topSchools: bySchool.map((r) => ({
      schoolId: r._id,
      name: r.school?.name,
      slug: r.school?.slug,
      count: r.count
    })),
    payments: Object.fromEntries(
      payments.map((r) => [r._id || 'due', { count: r.count, amount: r.amount }])
    )
  }
}

export async function reassignSchool(fromId, toId) {
  const result = await Registration.updateMany({ schoolId: fromId }, { $set: { schoolId: toId } })
  return result.modifiedCount ?? 0
}

/** Données publiques d'une école : prénom, initiale, rôle, catégorie. */
export async function publicPlayersForSchool(editionId, schoolId) {
  const rows = await Registration.find({
    editionId,
    schoolId,
    status: { $in: ['checked_in', 'eliminated', 'qualified', 'finalist'] }
  }).select('player.name role ageCategory status')

  return rows.map((r) => ({
    id: r._id,
    name: r.publicName,
    role: r.role,
    ageCategory: r.ageCategory,
    status: r.status
  }))
}

/**
 * Liste du créneau, chargée à l'avance par l'écran de check-in.
 * Elle inclut le jeton du badge — l'écran doit pouvoir reconnaître un QR
 * scanné sans réseau — d'où la lecture en `lean` : le `toJSON` du modèle
 * masque ce jeton pour toutes les autres réponses, et la route est
 * réservée au staff et tracée dans le journal d'audit.
 */
export async function rosterForSlot(slotId) {
  return Registration.find({ slotId, status: { $in: ['scheduled', 'checked_in', 'no_show'] } })
    .populate('schoolId', 'name slug')
    .select(
      'player.name player.photoFileId role ageCategory status bibNumber payment randomCheck qrToken checkedInAt schoolId'
    )
    .sort({ 'player.name': 1 })
    .lean()
}

export async function playersForSlot(slotId, role) {
  return Registration.find({ slotId, role, status: 'checked_in' }).select('_id ageCategory')
}

export async function exportRows(editionId) {
  const rows = await Registration.find({ editionId })
    .populate('schoolId', 'name type')
    .populate('slotId', 'label startsAt')
    .lean({ virtuals: false })

  return toCsv(rows, [
    { key: 'bibNumber', label: 'Dossard' },
    { label: 'Nom', get: (r) => r.player?.name },
    { label: 'Naissance', get: (r) => r.player?.birthDate?.toISOString?.().slice(0, 10) },
    { label: 'Genre', get: (r) => r.player?.gender },
    { label: 'École', get: (r) => r.schoolId?.name?.fr },
    { key: 'ageCategory', label: 'Catégorie' },
    { key: 'role', label: 'Rôle' },
    { label: 'Moyenne', get: (r) => r.grades?.average },
    { key: 'status', label: 'Statut' },
    { label: 'Créneau', get: (r) => r.slotId?.label },
    { label: 'Paiement', get: (r) => r.payment?.status },
    { label: 'Montant', get: (r) => r.payment?.amount },
    { label: 'Contrat signé', get: (r) => (r.contract?.signed ? 'oui' : 'non') },
    { label: 'Check-in', get: (r) => r.checkedInAt?.toISOString?.() },
    { label: 'Droit à l’image', get: (r) => (r.consents?.imageRights ? 'oui' : 'non') },
    { label: 'Signalements', get: (r) => (r.flags || []).map((f) => f.code).join(' ') }
  ])
}

/** Fin d'édition : les données d'identité partent, les résultats restent. */
export async function anonymizeEdition(editionId) {
  const result = await Registration.updateMany(
    { editionId },
    {
      $unset: {
        'player.birthDate': '',
        'player.photoFileId': '',
        'grades.bulletinFileId': '',
        qrToken: '',
        dedupeKey: ''
      },
      $set: { 'player.name': '' }
    }
  )
  return result.modifiedCount ?? 0
}

function toObjectId(value) {
  return typeof value === 'string' ? new Registration.base.Types.ObjectId(value) : value
}

/** Profils publics par identifiants, utilisés par les classements. */
export async function publicProfilesByIds(ids) {
  const rows = await Registration.find({ _id: { $in: ids } })
    .populate('schoolId', 'name slug type')
    .select('player.name role ageCategory schoolId status bibNumber')

  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        registrationId: row._id,
        name: row.publicName,
        role: row.role,
        ageCategory: row.ageCategory,
        status: row.status,
        bibNumber: row.bibNumber,
        school: row.schoolId
          ? { id: row.schoolId._id, name: row.schoolId.name, slug: row.schoolId.slug }
          : null
      }
    ])
  )
}

/** Dossiers d'une édition réduits à ce dont le classement des écoles a besoin. */
export async function listForRanking(editionId) {
  return Registration.find({ editionId })
    .populate('schoolId', 'name slug type city')
    .select('schoolId role ageCategory status')
}

/** Consentement au droit à l'image, par identifiant de dossier. */
export async function imageRightsByIds(ids) {
  const rows = await Registration.find({ _id: { $in: ids } }).select(
    'consents.imageRights consents.monetizedVideos player.name'
  )
  return new Map(
    rows.map((row) => [
      String(row._id),
      {
        name: row.publicName,
        imageRights: Boolean(row.consents?.imageRights),
        monetizedVideos: Boolean(row.consents?.monetizedVideos)
      }
    ])
  )
}

/*
 * Il n'existe volontairement pas de suppression de dossier par le candidat.
 * Un dossier engage l'organisation (place reservee, creneau, verification deja
 * faite) : son retrait passe par le staff, qui garde la trace de la decision.
 */
