import { canTransitionEdition, EDITION_TRANSITIONS } from '@arene/shared'
import { badRequest, conflict, notFound } from '../../core/errors.js'
import { slugify } from '../../core/utils/text.js'
import bus from '../../core/events.js'
import { Edition } from './editions.model.js'

/**
 * Les modules voisins sont chargés à la demande : un import statique créerait
 * un cycle (les créneaux et les inscriptions lisent l'édition courante).
 */
const registrationsService = () => import('../registrations/registrations.service.js')
const slotsService = () => import('../slots/slots.service.js')
const resultsService = () => import('../results/results.service.js')

const PUBLIC_STATUSES = [
  'announced',
  'registration_open',
  'registration_closed',
  'qualifiers',
  'finals',
  'completed'
]

export async function list({ status, includeDrafts = false } = {}) {
  const filter = status ? { status } : includeDrafts ? {} : { status: { $in: PUBLIC_STATUSES } }
  return Edition.find(filter).sort({ registrationOpensAt: -1 })
}

export async function getById(id) {
  const edition = await Edition.findById(id)
  if (!edition) throw notFound('Édition introuvable')
  return edition
}

export async function getBySlug(slug, { publicOnly = true } = {}) {
  const edition = await Edition.findOne({ slug })
  if (!edition) throw notFound('Édition introuvable')
  if (publicOnly && !PUBLIC_STATUSES.includes(edition.status)) throw notFound('Édition introuvable')
  return edition
}

/** Édition mise en avant sur l'accueil : la plus avancée encore active. */
export async function getCurrent() {
  const priority = ['registration_open', 'qualifiers', 'finals', 'registration_closed', 'announced', 'completed']
  for (const status of priority) {
    const edition = await Edition.findOne({ status }).sort({ registrationOpensAt: -1 })
    if (edition) return edition
  }
  return null
}

/** Places restantes par catégorie et par rôle, plafond moins les dossiers qui occupent un siège. */
export async function seatsLeft(editionId) {
  const edition = await getById(editionId)
  const { countSeats } = await registrationsService()
  const taken = await countSeats(editionId)

  const result = {}
  for (const category of edition.ageCategories) {
    result[category] = {}
    for (const role of ['striker', 'defender']) {
      const capacity = edition.capacity?.[category]?.[role] ?? 0
      const used = taken?.[category]?.[role] ?? 0
      result[category][role] = { capacity, used, left: Math.max(0, capacity - used) }
    }
  }
  return result
}

export async function create(input, actorId) {
  const slug = input.slug || slugify(input.title.fr)
  if (await Edition.exists({ slug })) throw conflict('Ce slug est déjà pris')
  return Edition.create({
    ...input,
    slug,
    history: [{ from: null, to: 'draft', by: actorId, note: 'création' }]
  })
}

export async function update(id, patch) {
  const edition = await getById(id)
  if (patch.slug && patch.slug !== edition.slug) {
    if (await Edition.exists({ slug: patch.slug })) throw conflict('Ce slug est déjà pris')
  }
  edition.set(patch)
  await edition.save()
  return edition
}

/**
 * Changement de statut manuel, avec les garde-fous de la documentation :
 * pas d'ouverture sans créneau, pas de finale tant qu'il reste des qualifications à saisir.
 */
export async function transition(id, { status, note }, actorId) {
  const edition = await getById(id)
  if (edition.status === status) return edition
  if (!canTransitionEdition(edition.status, status)) {
    throw badRequest(
      `Transition refusée : ${edition.status} → ${status}`,
      { allowed: EDITION_TRANSITIONS[edition.status] || [] }
    )
  }

  if (status === 'registration_open') {
    const { countForEdition } = await slotsService()
    if ((await countForEdition(edition._id)) === 0) {
      throw badRequest('Impossible d’ouvrir les inscriptions sans au moins un créneau')
    }
  }

  if (status === 'finals') {
    const { pendingQualificationCount } = await resultsService()
    const pending = await pendingQualificationCount(edition._id)
    if (pending > 0) {
      throw badRequest(`${pending} rencontre(s) de qualification sans résultat saisi`)
    }
  }

  const from = edition.status
  edition.status = status
  edition.history.push({ from, to: status, by: actorId, at: new Date(), note })
  await edition.save()

  bus.emitEvent('edition.status_changed', { editionId: String(edition._id), from, to: status })
  return edition
}

/** Tableau de bord staff : inscrits par statut, rôle, catégorie et école. */
export async function stats(editionId) {
  const { statsForEdition } = await registrationsService()
  return {
    seats: await seatsLeft(editionId),
    ...(await statsForEdition(editionId))
  }
}

export async function setRankingsCache(editionId, rankings) {
  await Edition.updateOne(
    { _id: editionId },
    { $set: { rankings: { ...rankings, computedAt: new Date() } } }
  )
}

export async function getRankingsCache(editionId) {
  const edition = await Edition.findById(editionId).select('rankings')
  return edition?.rankings || null
}
