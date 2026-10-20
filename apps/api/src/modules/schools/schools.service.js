import { badRequest, conflict, notFound } from '../../core/errors.js'
import { slugify } from '../../core/utils/text.js'
import bus from '../../core/events.js'
import { School } from './schools.model.js'

const registrationsService = () => import('../registrations/registrations.service.js')

async function uniqueSlug(base) {
  const root = slugify(base) || 'ecole'
  let slug = root
  let suffix = 2
  while (await School.exists({ slug })) {
    slug = `${root}-${suffix}`
    suffix += 1
  }
  return slug
}

export async function search({ q, type, limit = 50 } = {}) {
  const filter = { mergedInto: null }
  if (type) filter.type = type
  if (q) {
    const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    filter.$or = [{ 'name.fr': new RegExp(safe, 'i') }, { 'name.ar': new RegExp(safe, 'i') }]
  }
  return School.find(filter).sort({ 'name.fr': 1 }).limit(limit)
}

export async function getById(id, { follow = true } = {}) {
  const school = await School.findById(id)
  if (!school) throw notFound('École introuvable')
  if (follow && school.mergedInto) return getById(school.mergedInto, { follow })
  return school
}

export async function getBySlug(slug) {
  const school = await School.findOne({ slug })
  if (!school) throw notFound('École introuvable')
  if (school.mergedInto) return getById(school.mergedInto)
  return school
}

export async function create(input, { source = 'staff' } = {}) {
  const slug = input.slug || (await uniqueSlug(input.name.fr))
  if (await School.exists({ slug })) throw conflict('Ce slug est déjà pris')
  return School.create({ ...input, slug, source })
}

/** Appelée quand un candidat choisit « autre école » : créée non vérifiée, à valider par le staff. */
export async function createFromRegistration({ name, type, city }) {
  const existing = await School.findOne({
    'name.fr': new RegExp(`^${name.fr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
    mergedInto: null
  })
  if (existing) return existing
  return create({ name, type, city, isVerified: false }, { source: 'registration' })
}

export async function update(id, patch) {
  const school = await School.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
  if (!school) throw notFound('École introuvable')
  return school
}

/** Fusion de doublons : les inscriptions de la source sont réattribuées à la cible. */
export async function merge(sourceId, intoId) {
  if (String(sourceId) === String(intoId)) throw badRequest('Une école ne se fusionne pas avec elle-même')
  const source = await School.findById(sourceId)
  const target = await School.findById(intoId)
  if (!source || !target) throw notFound('École introuvable')
  if (target.mergedInto) throw badRequest('L’école cible est elle-même fusionnée')

  const { reassignSchool } = await registrationsService()
  const moved = await reassignSchool(source._id, target._id)

  source.mergedInto = target._id
  await source.save()

  bus.emitEvent('school.merged', {
    sourceId: String(source._id),
    targetId: String(target._id),
    moved
  })
  return { target, movedRegistrations: moved }
}

/**
 * Import initial du référentiel : CSV `nom;nom_ar;type;ville`.
 * Les lignes déjà connues sont ignorées, rien n'est écrasé.
 */
export async function importCsv(content) {
  const raw = String(content)
  const lines = (raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) throw badRequest('Fichier vide')
  const [header, ...rows] = lines
  if (!/nom/i.test(header)) rows.unshift(header) // fichier sans en-tête

  const report = { created: 0, skipped: 0, errors: [] }
  for (const [index, row] of rows.entries()) {
    const [nameFr, nameAr, type, city] = row.split(/[;,]/).map((c) => c?.trim())
    if (!nameFr || !['lycee', 'universite'].includes(type)) {
      report.errors.push({ line: index + 2, row, reason: 'nom ou type invalide' })
      continue
    }
    const exists = await School.findOne({ 'name.fr': nameFr, mergedInto: null })
    if (exists) {
      report.skipped += 1
      continue
    }
    await create(
      { name: { fr: nameFr, ar: nameAr || '' }, type, city: city || 'Djibouti', isVerified: true },
      { source: 'import' }
    )
    report.created += 1
  }
  return report
}

export async function listByIds(ids) {
  return School.find({ _id: { $in: ids } })
}

/**
 * Fiche publique d'une école : joueurs qualifiés de l'édition courante
 * (prénom, initiale du nom) et place au classement.
 */
export async function publicProfile(slug) {
  const school = await getBySlug(slug)
  const editions = await import('../editions/editions.service.js')
  const edition = await editions.getCurrent()
  if (!edition) return { school, edition: null, players: [], ranking: null }

  const { publicPlayersForSchool } = await import('../registrations/registrations.service.js')
  const players = await publicPlayersForSchool(edition._id, school._id)
  const cache = await editions.getRankingsCache(edition._id)
  const ranking =
    cache?.schools?.find?.((row) => String(row.schoolId) === String(school._id)) || null

  return { school, edition, players, ranking }
}
