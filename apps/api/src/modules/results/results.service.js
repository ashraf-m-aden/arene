import mongoose from 'mongoose'
import {
  computeMatchScore,
  FINALISTS_PER_ROLE,
  generateMatches,
  OPPONENTS_PER_STRIKER,
  rankDefenders,
  rankStrikers,
  SCHOOL_POINTS
} from '@arene/shared'
import { badRequest, notFound } from '../../core/errors.js'
import bus from '../../core/events.js'
import { Match } from './results.model.js'

const registrationsService = () => import('../registrations/registrations.service.js')
const slotsService = () => import('../slots/slots.service.js')
const editionsService = () => import('../editions/editions.service.js')

const oid = (value) => (typeof value === 'string' ? new mongoose.Types.ObjectId(value) : value)

/**
 * Génère les rencontres d'un créneau : chaque buteur pointé affronte
 * `opponents` défenseurs de sa catégorie, répartis sur les terrains.
 */
export async function generateForSlot(slotId, { opponents = OPPONENTS_PER_STRIKER, reset = false } = {}) {
  const slots = await slotsService()
  const slot = await slots.getById(slotId)

  const existing = await Match.countDocuments({ slotId: slot._id })
  if (existing > 0 && !reset) {
    throw badRequest('Les rencontres de ce créneau sont déjà générées')
  }
  if (reset) {
    const recorded = await Match.countDocuments({ slotId: slot._id, strikerScore: { $ne: null } })
    if (recorded > 0) throw badRequest('Des résultats sont déjà saisis : régénération refusée')
    await Match.deleteMany({ slotId: slot._id })
  }

  const { playersForSlot } = await registrationsService()
  const [strikers, defenders] = await Promise.all([
    playersForSlot(slot._id, 'striker'),
    playersForSlot(slot._id, 'defender')
  ])
  if (!strikers.length || !defenders.length) {
    throw badRequest('Il faut au moins un buteur et un défenseur pointés')
  }

  const pairs = generateMatches({
    strikers: strikers.map((s) => s._id),
    defenders: defenders.map((d) => d._id),
    opponents,
    pitches: slot.pitches
  })

  const docs = pairs.map((pair) => ({
    ...pair,
    editionId: slot.editionId,
    slotId: slot._id,
    phase: 'qualification',
    ageCategory: slot.ageCategory
  }))

  const created = await Match.insertMany(docs, { ordered: false })
  return { generated: created.length, matches: created }
}

export async function listForSlot(slotId) {
  return Match.find({ slotId })
    .populate('strikerRegId', 'player.firstName player.lastName bibNumber role')
    .populate('defenderRegId', 'player.firstName player.lastName bibNumber role')
    .sort({ order: 1 })
}

/** Saisie du marqueur : 5 tentatives, le score se calcule tout seul. */
export async function recordResult(matchId, { attempts, note }, staffId) {
  const match = await Match.findById(matchId)
  if (!match) throw notFound('Rencontre introuvable')

  const previous = match.isRecorded
    ? {
        attempts: match.attempts,
        strikerScore: match.strikerScore,
        defenderScore: match.defenderScore
      }
    : null

  const score = computeMatchScore(attempts)
  if (previous) {
    match.corrections.push({ by: staffId, at: new Date(), reason: note || 'correction', previous })
  }

  match.attempts = attempts
  match.strikerScore = score.strikerScore
  match.defenderScore = score.defenderScore
  match.enteredBy = staffId
  match.enteredAt = new Date()
  await match.save()

  bus.emitEvent('result.recorded', {
    matchId: String(match._id),
    editionId: String(match.editionId),
    phase: match.phase,
    corrected: Boolean(previous)
  })
  return match
}

export async function pendingQualificationCount(editionId) {
  return Match.countDocuments({
    editionId: oid(editionId),
    phase: 'qualification',
    strikerScore: null
  })
}

/**
 * Classements individuels, calculés par agrégation sur les rencontres.
 * Les buteurs comptent leurs buts, les défenseurs leurs arrêts.
 */
export async function playerRankings(editionId, { phase, ageCategory } = {}) {
  const match = { editionId: oid(editionId), strikerScore: { $ne: null } }
  if (phase) match.phase = phase
  if (ageCategory) match.ageCategory = ageCategory

  const [strikerRows, defenderRows] = await Promise.all([
    Match.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$strikerRegId',
          goals: { $sum: '$strikerScore' },
          attempts: { $sum: { $size: '$attempts' } },
          matches: { $sum: 1 },
          wins: { $sum: { $cond: [{ $gt: ['$strikerScore', '$defenderScore'] }, 1, 0] } },
          lastPlayedAt: { $max: '$enteredAt' }
        }
      }
    ]),
    Match.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$defenderRegId',
          stops: { $sum: '$defenderScore' },
          attempts: { $sum: { $size: '$attempts' } },
          matches: { $sum: 1 },
          wins: { $sum: { $cond: [{ $gt: ['$defenderScore', '$strikerScore'] }, 1, 0] } },
          lastPlayedAt: { $max: '$enteredAt' }
        }
      }
    ])
  ])

  const ids = [...strikerRows, ...defenderRows].map((row) => row._id)
  const profiles = await playerProfiles(ids)

  const strikers = rankStrikers(
    strikerRows.map((row) => ({ ...row, ...profiles.get(String(row._id)) }))
  ).map((row, index) => ({ rank: index + 1, ...row }))

  const defenders = rankDefenders(
    defenderRows.map((row) => ({ ...row, ...profiles.get(String(row._id)) }))
  ).map((row, index) => ({ rank: index + 1, ...row }))

  return { strikers, defenders }
}

async function playerProfiles(ids) {
  const { publicProfilesByIds } = await registrationsService()
  return publicProfilesByIds(ids)
}

/**
 * Classement des écoles selon le barème validé : présence, victoires,
 * finalistes, podium et titres. Deux vues : points totaux et points par joueur inscrit.
 */
export async function schoolRankings(editionId) {
  const { listForRanking } = await registrationsService()
  const edId = oid(editionId)
  const registrations = await listForRanking(edId)

  const schools = new Map()
  const ensure = (school) => {
    const key = String(school._id)
    if (!schools.has(key)) {
      schools.set(key, {
        schoolId: school._id,
        name: school.name,
        slug: school.slug,
        type: school.type,
        players: 0,
        checkedIn: 0,
        wins: 0,
        finalists: 0,
        podiums: 0,
        champions: 0,
        points: 0
      })
    }
    return schools.get(key)
  }

  const schoolOfRegistration = new Map()
  for (const registration of registrations) {
    if (!registration.schoolId) continue
    const entry = ensure(registration.schoolId)
    entry.players += 1
    schoolOfRegistration.set(String(registration._id), entry)
    if (
      ['checked_in', 'eliminated', 'qualified', 'finalist'].includes(registration.status)
    ) {
      entry.checkedIn += 1
      entry.points += SCHOOL_POINTS.checkedIn
    }
    if (['qualified', 'finalist'].includes(registration.status)) {
      entry.finalists += 1
      entry.points += SCHOOL_POINTS.finalist
    }
  }

  // Victoires en qualification : le vainqueur est celui qui a le plus marqué sur 5 tentatives.
  const wins = await Match.aggregate([
    { $match: { editionId: edId, phase: 'qualification', strikerScore: { $ne: null } } },
    {
      $project: {
        winner: {
          $cond: [{ $gt: ['$strikerScore', '$defenderScore'] }, '$strikerRegId', '$defenderRegId']
        }
      }
    },
    { $group: { _id: '$winner', wins: { $sum: 1 } } }
  ])
  for (const row of wins) {
    const entry = schoolOfRegistration.get(String(row._id))
    if (!entry) continue
    entry.wins += row.wins
    entry.points += row.wins * SCHOOL_POINTS.qualificationWin
  }

  // Podiums et titres : issus du classement de la phase finale, par catégorie et par rôle.
  for (const ageCategory of ['lycee', 'universite']) {
    const finals = await playerRankings(edId, { phase: 'finale', ageCategory })
    for (const list of [finals.strikers, finals.defenders]) {
      list.slice(0, 3).forEach((row, index) => {
        const entry = schoolOfRegistration.get(String(row.registrationId))
        if (!entry) return
        entry.points += SCHOOL_POINTS.podium[index] || 0
        entry.podiums += 1
        if (index === 0) {
          entry.champions += 1
          entry.points += SCHOOL_POINTS.champion
        }
      })
    }
  }

  const rows = [...schools.values()].map((row) => ({
    ...row,
    pointsPerPlayer: row.players ? Number((row.points / row.players).toFixed(2)) : 0
  }))

  const byTotal = [...rows].sort((a, b) => b.points - a.points || b.checkedIn - a.checkedIn)
  const byPlayer = [...rows].sort((a, b) => b.pointsPerPlayer - a.pointsPerPlayer)

  const withRank = (list, key) =>
    list.map((row, index) => ({ ...row, [key]: index + 1 }))

  return {
    lycee: withRank(byTotal.filter((r) => r.type === 'lycee'), 'rank'),
    universite: withRank(byTotal.filter((r) => r.type === 'universite'), 'rank'),
    perPlayer: {
      lycee: withRank(byPlayer.filter((r) => r.type === 'lycee'), 'rank'),
      universite: withRank(byPlayer.filter((r) => r.type === 'universite'), 'rank')
    }
  }
}

/** Recalcule et met en cache les classements de l'édition. */
export async function refreshRankings(editionId) {
  const [players, schools] = await Promise.all([
    playerRankings(editionId),
    schoolRankings(editionId)
  ])
  const editions = await editionsService()
  await editions.setRankingsCache(editionId, { players, schools: schools.lycee.concat(schools.universite), schoolsByCategory: schools })
  return { players, schools }
}

/**
 * Sélection des finalistes : les 2 meilleurs de chaque rôle dans chaque catégorie,
 * puis génération des 4 rencontres de la phase finale.
 */
export async function selectFinalists(editionId, { ageCategory, dryRun = false } = {}) {
  const categories = ageCategory ? [ageCategory] : ['lycee', 'universite']
  const registrations = await registrationsService()
  const selection = []

  for (const category of categories) {
    const { strikers, defenders } = await playerRankings(editionId, {
      phase: 'qualification',
      ageCategory: category
    })
    const chosenStrikers = strikers.slice(0, FINALISTS_PER_ROLE)
    const chosenDefenders = defenders.slice(0, FINALISTS_PER_ROLE)
    if (chosenStrikers.length < FINALISTS_PER_ROLE || chosenDefenders.length < FINALISTS_PER_ROLE) {
      throw badRequest(`Pas assez de joueurs classés en ${category} pour composer la finale`)
    }

    selection.push({ ageCategory: category, strikers: chosenStrikers, defenders: chosenDefenders })
    if (dryRun) continue

    for (const row of [...chosenStrikers, ...chosenDefenders]) {
      await registrations.setCompetitionStatus(row.registrationId, 'qualified', null, 'finaliste')
    }

    // Chaque buteur finaliste affronte chaque défenseur finaliste : 4 rencontres.
    const finals = []
    chosenStrikers.forEach((striker, i) => {
      chosenDefenders.forEach((defender, j) => {
        finals.push({
          editionId: oid(editionId),
          phase: 'finale',
          ageCategory: category,
          round: i * FINALISTS_PER_ROLE + j + 1,
          pitch: 1,
          order: i * FINALISTS_PER_ROLE + j + 1,
          strikerRegId: striker.registrationId,
          defenderRegId: defender.registrationId
        })
      })
    })
    await Match.deleteMany({ editionId: oid(editionId), phase: 'finale', ageCategory: category, strikerScore: null })
    await Match.insertMany(finals, { ordered: false })
  }

  return { dryRun, selection }
}

export async function listFinals(editionId, ageCategory) {
  const filter = { editionId: oid(editionId), phase: 'finale' }
  if (ageCategory) filter.ageCategory = ageCategory
  return Match.find(filter)
    .populate('strikerRegId', 'player.firstName player.lastName bibNumber')
    .populate('defenderRegId', 'player.firstName player.lastName bibNumber')
    .sort({ ageCategory: 1, order: 1 })
}
