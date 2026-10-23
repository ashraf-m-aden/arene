import {
  AGE_RANGES,
  ATTEMPTS_PER_MATCH,
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

/** La catégorie suit le niveau d'études déclaré ; l'âge ne sert qu'au contrôle. */
export function categoryFromSchoolType(schoolType) {
  return schoolType === 'universite' ? 'universite' : 'lycee'
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

  if (!isAgeEligible(birthDate, ageCategory, reference)) {
    const range = AGE_RANGES[ageCategory]
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

export function canTransitionEdition(from, to) {
  return (EDITION_TRANSITIONS[from] || []).includes(to)
}

export function canTransitionRegistration(from, to) {
  return (REGISTRATION_TRANSITIONS[from] || []).includes(to)
}

/**
 * Classement des buteurs : buts marqués, puis ratio, puis dernière rencontre jouée.
 * @param {Array<{ goals: number, attempts: number, lastPlayedAt?: Date|string }>} rows
 */
export function rankStrikers(rows) {
  return [...rows].sort(
    (a, b) =>
      b.goals - a.goals ||
      ratio(b.goals, b.attempts) - ratio(a.goals, a.attempts) ||
      time(a.lastPlayedAt) - time(b.lastPlayedAt)
  )
}

/** Classement des défenseurs : arrêts, puis ratio, puis dernière rencontre jouée. */
export function rankDefenders(rows) {
  return [...rows].sort(
    (a, b) =>
      b.stops - a.stops ||
      ratio(b.stops, b.attempts) - ratio(a.stops, a.attempts) ||
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
