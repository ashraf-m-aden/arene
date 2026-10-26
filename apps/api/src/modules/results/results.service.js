import mongoose from 'mongoose'
import {
  BARRAGE_OPPONENTS,
  BARRAGE_PER_ROLE,
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
 * Genere les rencontres d'une session de jeu : chaque buteur affecte a la
 * session affronte `opponents` defenseurs de la meme session, repartis sur les
 * terrains.
 *
 * Les joueurs sont lus sur `sessionId`, pas sur `slotId` : le rendez-vous
 * administratif s'est tenu une semaine plus tot, dans un autre creneau et
 * souvent dans un autre ordre. Lire le creneau de pointage reviendrait a
 * composer les rencontres du jour avec les groupes de la file d'attente.
 */
export async function generateForSession(
  sessionId,
  { opponents = OPPONENTS_PER_STRIKER, phase = 'qualification', reset = false } = {}
) {
  const slots = await slotsService()
  const slot = await slots.getById(sessionId)
  if (slot.kind !== 'competition') {
    throw badRequest(
      'Les rencontres se génèrent sur une session de jeu, pas sur un rendez-vous administratif'
    ).withKey('notACompetitionSlot')
  }

  const existing = await Match.countDocuments({ slotId: slot._id })
  if (existing > 0 && !reset) {
    throw badRequest('Les rencontres de cette session sont déjà générées')
  }
  if (reset) {
    const recorded = await Match.countDocuments({ slotId: slot._id, strikerScore: { $ne: null } })
    if (recorded > 0) throw badRequest('Des résultats sont déjà saisis : régénération refusée')
    await Match.deleteMany({ slotId: slot._id })
  }

  const { playersForSession } = await registrationsService()
  const [strikers, defenders] = await Promise.all([
    playersForSession(slot._id, 'striker'),
    playersForSession(slot._id, 'defender')
  ])
  if (!strikers.length || !defenders.length) {
    throw badRequest(
      'Il faut au moins un buteur et un défenseur inscrits sur cette session'
    ).withKey('sessionMissingRole')
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
    phase,
    ageCategory: slot.ageCategory
  }))

  const created = await Match.insertMany(docs, { ordered: false })
  return { generated: created.length, matches: created }
}

export async function listForSlot(slotId) {
  return Match.find({ slotId })
    .populate('strikerRegId', 'player.name bibNumber role')
    .populate('defenderRegId', 'player.name bibNumber role')
    .sort({ order: 1 })
}

/**
 * Dossiers ayant effectivement joue dans une session — au moins une rencontre
 * dont le resultat est saisi. Sert a la cloture d'une session : seuls ceux qui
 * n'apparaissent nulle part sont marques absents.
 */
export async function playedRegistrationIds(sessionId) {
  const rows = await Match.find({ slotId: sessionId, strikerScore: { $ne: null } }).select(
    'strikerRegId defenderRegId'
  )
  const ids = new Set()
  for (const row of rows) {
    ids.add(String(row.strikerRegId))
    ids.add(String(row.defenderRegId))
  }
  return [...ids]
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

/**
 * Rencontres sans resultat saisi dans les phases qui doivent etre closes avant
 * la finale. Le barrage y est compte : il appartient aux qualifications, et
 * composer la finale alors qu'il lui manque des resultats designerait les
 * finalistes sur un classement incomplet.
 */
export async function pendingBeforeFinals(editionId) {
  return Match.countDocuments({
    editionId: oid(editionId),
    phase: { $in: ['qualification', 'barrage'] },
    strikerScore: null
  })
}

/**
 * Classements individuels, calculés par agrégation sur les rencontres.
 * Les buteurs comptent leurs buts, les défenseurs leurs arrêts.
 *
 * L'agrégation collecte aussi les adversaires de chacun, pour en déduire la
 * force de l'opposition : la somme des arrêts des défenseurs qu'un buteur a
 * affrontés, et symétriquement. En qualification personne ne rencontre le même
 * lot — 3 adversaires tirés dans un effectif de 50 — et le total de points seul
 * récompense autant un bon buteur qu'un tirage facile. Ce critère départage à
 * points égaux en faveur de celui qui a eu la tâche la plus dure, là où le code
 * d'origine tranchait sur l'heure de passage.
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
          opponents: { $push: '$defenderRegId' },
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
          opponents: { $push: '$strikerRegId' },
          lastPlayedAt: { $max: '$enteredAt' }
        }
      }
    ])
  ])

  const ids = [...strikerRows, ...defenderRows].map((row) => row._id)
  const profiles = await playerProfiles(ids)

  const stopsOf = new Map(defenderRows.map((row) => [String(row._id), row.stops]))
  const goalsOf = new Map(strikerRows.map((row) => [String(row._id), row.goals]))

  /*
   * `opponents` ne sort pas d'ici : ce sont des identifiants de dossiers, et le
   * classement est public. On en garde le total, pas la liste.
   */
  const withOpposition = (table) => ({ opponents, ...row }) => ({
    ...row,
    opposition: opponents.reduce((sum, id) => sum + (table.get(String(id)) || 0), 0),
    ...profiles.get(String(row._id))
  })

  const strikers = rankStrikers(strikerRows.map(withOpposition(stopsOf))).map((row, index) => ({
    rank: index + 1,
    ...row
  }))

  const defenders = rankDefenders(defenderRows.map(withOpposition(goalsOf))).map((row, index) => ({
    rank: index + 1,
    ...row
  }))

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

  /*
   * Victoires en qualification : le vainqueur est celui qui a le plus marque sur
   * 5 tentatives. Le barrage y est inclus — c'est un duel gagne au meme titre, et
   * l'exclure penaliserait les ecoles dont les joueurs sont alles le plus loin.
   */
  const wins = await Match.aggregate([
    {
      $match: {
        editionId: edId,
        phase: { $in: ['qualification', 'barrage'] },
        strikerScore: { $ne: null }
      }
    },
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
 * Composition du barrage : les `perRole` meilleurs de chaque role sortis de la
 * qualification s'y rencontrent dans un tableau ferme.
 *
 * C'est le tour qui rend la selection defendable. En qualification chaque buteur
 * n'affronte que 3 defenseurs pris dans un effectif de plusieurs dizaines : le
 * maximum (15 points) est atteint par plusieurs joueurs et les lots
 * d'adversaires sont tres inegaux. Ici tous les retenus affrontent la meme
 * opposition, et c'est ce classement-la qui designe les finalistes.
 *
 * Aucun statut de dossier ne change : le barrage fait partie de la competition,
 * les joueurs restent `checked_in` jusqu'a la designation des finalistes.
 */
export async function selectBarrage(
  editionId,
  {
    ageCategory,
    perRole = BARRAGE_PER_ROLE,
    opponents = BARRAGE_OPPONENTS,
    dryRun = false
  } = {}
) {
  const categories = ageCategory ? [ageCategory] : ['lycee', 'universite']
  const edId = oid(editionId)
  const selection = []

  for (const category of categories) {
    const recorded = await Match.countDocuments({
      editionId: edId,
      phase: 'barrage',
      ageCategory: category,
      strikerScore: { $ne: null }
    })
    if (recorded > 0) {
      throw badRequest(
        `Des résultats de barrage sont déjà saisis en ${category} : recomposition refusée`
      ).withKey('barrageAlreadyPlayed')
    }

    const { strikers, defenders } = await playerRankings(editionId, {
      phase: 'qualification',
      ageCategory: category
    })
    const chosenStrikers = strikers.slice(0, perRole)
    const chosenDefenders = defenders.slice(0, perRole)
    if (
      chosenStrikers.length < FINALISTS_PER_ROLE ||
      chosenDefenders.length < FINALISTS_PER_ROLE
    ) {
      throw badRequest(
        `Pas assez de joueurs classés en ${category} pour composer le barrage`
      ).withKey('notEnoughRanked')
    }

    const pairs = generateMatches({
      strikers: chosenStrikers.map((row) => row.registrationId),
      defenders: chosenDefenders.map((row) => row.registrationId),
      opponents,
      pitches: 2
    })

    selection.push({
      ageCategory: category,
      strikers: chosenStrikers,
      defenders: chosenDefenders,
      matches: pairs.length
    })
    if (dryRun) continue

    await Match.deleteMany({ editionId: edId, phase: 'barrage', ageCategory: category })
    await Match.insertMany(
      pairs.map((pair) => ({
        ...pair,
        editionId: edId,
        phase: 'barrage',
        ageCategory: category
      })),
      { ordered: false }
    )
  }

  return { dryRun, selection }
}

/**
 * Sélection des finalistes : les 2 meilleurs de chaque rôle dans chaque catégorie,
 * puis génération des 4 rencontres de la phase finale.
 *
 * Le classement lu est celui du **barrage** dès qu'il a été joué, la
 * qualification ne servant alors qu'à filtrer les prétendants. Repli sur la
 * qualification pour une édition trop petite pour justifier un tour
 * intermédiaire : la finale reste composable sans barrage.
 */
export async function selectFinalists(editionId, { ageCategory, dryRun = false } = {}) {
  const categories = ageCategory ? [ageCategory] : ['lycee', 'universite']
  const registrations = await registrationsService()
  const selection = []

  for (const category of categories) {
    const barragePlayed = await Match.countDocuments({
      editionId: oid(editionId),
      phase: 'barrage',
      ageCategory: category,
      strikerScore: { $ne: null }
    })
    const source = barragePlayed > 0 ? 'barrage' : 'qualification'

    const { strikers, defenders } = await playerRankings(editionId, {
      phase: source,
      ageCategory: category
    })
    const chosenStrikers = strikers.slice(0, FINALISTS_PER_ROLE)
    const chosenDefenders = defenders.slice(0, FINALISTS_PER_ROLE)
    if (chosenStrikers.length < FINALISTS_PER_ROLE || chosenDefenders.length < FINALISTS_PER_ROLE) {
      throw badRequest(`Pas assez de joueurs classés en ${category} pour composer la finale`)
    }

    selection.push({
      ageCategory: category,
      source,
      strikers: chosenStrikers,
      defenders: chosenDefenders
    })
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

/**
 * Rencontres d'une phase sans creneau propre — barrage et finale se jouent hors
 * des sessions reparties, sur un terrain unique et devant du public. L'ecran de
 * saisie les liste donc par phase et non par session.
 */
export async function listForPhase(editionId, phase, ageCategory) {
  const filter = { editionId: oid(editionId), phase }
  if (ageCategory) filter.ageCategory = ageCategory
  return Match.find(filter)
    .populate('strikerRegId', 'player.name bibNumber role')
    .populate('defenderRegId', 'player.name bibNumber role')
    .sort({ ageCategory: 1, order: 1 })
}

export async function listFinals(editionId, ageCategory) {
  return listForPhase(editionId, 'finale', ageCategory)
}
