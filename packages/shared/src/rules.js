import {
  AGE_CATEGORIES,
  AGE_RANGES,
  ATTEMPTS_PER_MATCH,
  CHECKIN_LEAD_TIME_DAYS,
  DEFAULT_GRADE_THRESHOLD,
  EDITION_TRANSITIONS,
  REGISTRATION_TRANSITIONS
} from './constants.js'

/**
 * Normalise un numéro djiboutien vers E.164.
 *
 * Vit ici et non dans l'API : le schéma Zod partagé s'en sert pour nettoyer la
 * saisie avant de la valider. Sans cela, la validation refusait « +253 77 12 34
 * 56 » — la forme que les champs du site donnent pourtant en exemple — et le
 * normaliseur de l'API n'était jamais atteint.
 */
export function toE164(input, defaultCountry = '+253') {
  const raw = String(input || '').replace(/[^\d+]/g, '')
  if (raw.startsWith('+')) return raw
  if (raw.startsWith('00')) return `+${raw.slice(2)}`
  if (raw.startsWith('253')) return `+${raw}`
  return `${defaultCountry}${raw.replace(/^0+/, '')}`
}

/** Âge révolu à une date de référence. */
export function ageAt(birthDate, reference = new Date()) {
  const b = new Date(birthDate)
  const ref = new Date(reference)
  let age = ref.getFullYear() - b.getFullYear()
  const monthDiff = ref.getMonth() - b.getMonth()
  if (monthDiff < 0 || (monthDiff === 0 && ref.getDate() < b.getDate())) age -= 1
  return age
}

/**
 * Catégorie d'une candidature, déduite du niveau de l'établissement : une
 * catégorie porte le nom du niveau d'études qui y concourt.
 *
 * Rend `null` pour un niveau qui n'ouvre aucune catégorie — un lycée, depuis que
 * l'édition ne recrute plus qu'à l'université. Le référentiel des écoles en
 * garde la trace (`SCHOOL_TYPES`), mais un dossier ne peut plus s'y rattacher :
 * le refus est prononcé par `registrations.service.patch`, pas ici.
 */
export function categoryFromSchoolType(schoolType) {
  return AGE_CATEGORIES.find((category) => category === schoolType) ?? null
}

/**
 * Catégories qu'une édition ouvre **encore**.
 *
 * Une édition créée avant la fermeture d'une catégorie en garde la trace dans
 * `ageCategories` tant que la migration n'est pas passée. Croiser avec
 * `AGE_CATEGORIES` évite d'annoncer des places, un quota ou une carte de
 * tableau de bord pour un public qui ne peut plus s'inscrire.
 */
export function openCategories(edition) {
  return (edition?.ageCategories || []).filter((category) => AGE_CATEGORIES.includes(category))
}

export function isAgeEligible(birthDate, ageCategory, reference = new Date()) {
  const range = AGE_RANGES[ageCategory]
  if (!range) return false
  const age = ageAt(birthDate, reference)
  return age >= range.min && age <= range.max
}

/**
 * Contrôles automatiques à l'envoi d'un dossier.
 * Aucun refus automatique : on renvoie des signalements que le staff tranche.
 * @returns {{ ok: boolean, issues: Array<{ code: string, field: string, detail?: object }> }}
 */
export function checkEligibility({
  birthDate,
  ageCategory,
  gradeAverage,
  gradeThreshold = DEFAULT_GRADE_THRESHOLD,
  roleSeatsLeft = null,
  reference = new Date()
}) {
  const issues = []

  const range = AGE_RANGES[ageCategory]
  if (!range) {
    /*
     * Categorie fermee depuis le depot du dossier — un dossier Lycee rouvert
     * apres le passage a l'edition universitaire. Il n'y a plus de tranche
     * d'age a opposer : annoncer « hors de la tranche » avec des bornes vides
     * n'aiderait ni le candidat ni le staff. Comme tous les controles, c'est un
     * signalement, pas un refus : le staff tranche.
     */
    issues.push({ code: 'category_closed', field: 'ageCategory', detail: { category: ageCategory } })
  } else if (!isAgeEligible(birthDate, ageCategory, reference)) {
    issues.push({
      code: 'age_out_of_range',
      field: 'player.birthDate',
      detail: { age: ageAt(birthDate, reference), ...range }
    })
  }

  if (typeof gradeAverage !== 'number' || Number.isNaN(gradeAverage)) {
    issues.push({ code: 'grade_missing', field: 'grades.average' })
  } else if (gradeAverage < gradeThreshold) {
    issues.push({
      code: 'grade_below_threshold',
      field: 'grades.average',
      detail: { average: gradeAverage, threshold: gradeThreshold }
    })
  }

  if (roleSeatsLeft !== null && roleSeatsLeft <= 0) {
    issues.push({ code: 'role_full', field: 'role' })
  }

  return { ok: issues.length === 0, issues }
}

/** Score d'une rencontre : le buteur marque ses buts, le défenseur ses arrêts. */
export function computeMatchScore(attempts = []) {
  const kept = attempts.slice(0, ATTEMPTS_PER_MATCH)
  const strikerScore = kept.filter((a) => a === 'goal' || a?.outcome === 'goal').length
  return {
    attempts: kept.length,
    strikerScore,
    defenderScore: kept.length - strikerScore
  }
}

/**
 * Date a laquelle les rendez-vous administratifs doivent etre termines :
 * `CHECKIN_LEAD_TIME_DAYS` avant le premier jour de tournoi.
 *
 * Indicative et non bloquante — c'est la cible que l'organisation se donne et
 * que la repartition automatique prend par defaut. Ce qui est reellement
 * interdit, c'est de valider apres le coup d'envoi : cette regle vit dans
 * `registrations.service.checkIn`.
 *
 * @returns {Date|null} null si l'edition n'a pas encore de date de tournoi.
 */
export function checkinDeadline(edition, leadDays = CHECKIN_LEAD_TIME_DAYS) {
  if (!edition?.startsAt) return null
  return new Date(new Date(edition.startsAt).getTime() - leadDays * 24 * 60 * 60 * 1000)
}

export function canTransitionEdition(from, to) {
  return (EDITION_TRANSITIONS[from] || []).includes(to)
}

export function canTransitionRegistration(from, to) {
  return (REGISTRATION_TRANSITIONS[from] || []).includes(to)
}

/**
 * Classement des buteurs : buts, duels gagnés, ratio, force de l'opposition,
 * puis dernière rencontre jouée.
 *
 * Les trois premiers critères ne suffisent pas à l'échelle réelle : sur 3 duels
 * de 5 tentatives, le maximum est 15 points et tout le monde tire le même
 * nombre de fois — le ratio est donc identique dès que les buts le sont, et des
 * joueurs se retrouvent à égalité parfaite pile sur la place qualificative.
 * `opposition` les sépare sur ce qu'ils ont réellement affronté (somme des
 * arrêts de leurs défenseurs) : à buts égaux, celui qui a eu le lot le plus
 * difficile passe devant. `lastPlayedAt` ne reste qu'en dernier recours — c'est
 * un départage arbitraire, il ne doit jamais décider seul d'une qualification.
 *
 * @param {Array<{ goals: number, attempts: number, wins?: number,
 *   opposition?: number, lastPlayedAt?: Date|string }>} rows
 */
export function rankStrikers(rows) {
  return [...rows].sort(
    (a, b) =>
      b.goals - a.goals ||
      b.wins - a.wins ||
      ratio(b.goals, b.attempts) - ratio(a.goals, a.attempts) ||
      b.opposition - a.opposition ||
      time(a.lastPlayedAt) - time(b.lastPlayedAt)
  )
}

/**
 * Classement des défenseurs : arrêts, duels gagnés, ratio, force de
 * l'opposition, puis dernière rencontre jouée. Symétrique de `rankStrikers` ;
 * `opposition` y vaut la somme des buts des buteurs affrontés.
 */
export function rankDefenders(rows) {
  return [...rows].sort(
    (a, b) =>
      b.stops - a.stops ||
      b.wins - a.wins ||
      ratio(b.stops, b.attempts) - ratio(a.stops, a.attempts) ||
      b.opposition - a.opposition ||
      time(a.lastPlayedAt) - time(b.lastPlayedAt)
  )
}

function ratio(part, total) {
  return total > 0 ? part / total : 0
}

function time(value) {
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY
}

/**
 * Génère les rencontres d'un créneau : chaque buteur affronte `opponents`
 * défenseurs différents de sa catégorie, répartis sur les terrains disponibles.
 * Le décalage tournant évite qu'un défenseur enchaîne tous ses duels d'affilée.
 */
export function generateMatches({ strikers, defenders, opponents = 3, pitches = 1 }) {
  if (!strikers.length || !defenders.length) return []
  const matches = []
  const effectiveOpponents = Math.min(opponents, defenders.length)

  strikers.forEach((striker, strikerIndex) => {
    for (let n = 0; n < effectiveOpponents; n += 1) {
      const defender = defenders[(strikerIndex + n * Math.max(1, Math.floor(defenders.length / effectiveOpponents))) % defenders.length]
      matches.push({ strikerRegId: striker, defenderRegId: defender, round: n + 1 })
    }
  })

  return matches.map((match, index) => ({
    ...match,
    pitch: (index % Math.max(1, pitches)) + 1,
    order: index + 1
  }))
}
