import { describe, expect, it } from 'vitest'
import {
  ageAt,
  canTransitionEdition,
  canTransitionRegistration,
  categoryFromSchoolType,
  checkEligibility,
  common,
  computeMatchScore,
  generateMatches,
  isAgeEligible,
  rankDefenders,
  rankStrikers,
  toE164
} from '@arene/shared'

const REF = new Date('2026-06-15T12:00:00Z')

describe('âge et catégorie', () => {
  it('calcule l’âge révolu', () => {
    expect(ageAt('2008-06-16', REF)).toBe(17)
    expect(ageAt('2008-06-15', REF)).toBe(18)
  })

  it('suit le niveau d’études déclaré', () => {
    expect(categoryFromSchoolType('universite')).toBe('universite')
    expect(categoryFromSchoolType('lycee')).toBe('lycee')
  })

  it('tranche le cas des 18 ans par la catégorie', () => {
    const birth18 = '2008-01-01'
    expect(isAgeEligible(birth18, 'lycee', REF)).toBe(true)
    expect(isAgeEligible(birth18, 'universite', REF)).toBe(true)
  })

  it('refuse un âge hors bornes', () => {
    expect(isAgeEligible('2013-01-01', 'lycee', REF)).toBe(false)
    expect(isAgeEligible('2000-01-01', 'universite', REF)).toBe(false)
  })
})

describe('contrôles automatiques à l’envoi', () => {
  const base = {
    birthDate: '2009-03-10',
    ageCategory: 'lycee',
    gradeAverage: 14.5,
    gradeThreshold: 12,
    reference: REF
  }

  it('laisse passer un dossier conforme', () => {
    expect(checkEligibility(base).ok).toBe(true)
  })

  it('signale une moyenne sous le seuil, sans refuser', () => {
    const { ok, issues } = checkEligibility({ ...base, gradeAverage: 11.2 })
    expect(ok).toBe(false)
    expect(issues[0].code).toBe('grade_below_threshold')
    expect(issues[0].detail).toMatchObject({ average: 11.2, threshold: 12 })
  })

  it('signale un rôle complet', () => {
    const { issues } = checkEligibility({ ...base, roleSeatsLeft: 0 })
    expect(issues.map((i) => i.code)).toContain('role_full')
  })

  it('signale une moyenne manquante', () => {
    const { issues } = checkEligibility({ ...base, gradeAverage: undefined })
    expect(issues.map((i) => i.code)).toContain('grade_missing')
  })
})

describe('score d’une rencontre', () => {
  it('compte les buts du buteur et les arrêts du défenseur', () => {
    expect(computeMatchScore(['goal', 'stop', 'goal', 'goal', 'stop'])).toEqual({
      attempts: 5,
      strikerScore: 3,
      defenderScore: 2
    })
  })

  it('ignore les tentatives au-delà de cinq', () => {
    const score = computeMatchScore(['goal', 'goal', 'goal', 'goal', 'goal', 'goal'])
    expect(score.attempts).toBe(5)
    expect(score.strikerScore).toBe(5)
  })
})

describe('classements individuels', () => {
  it('départage les buteurs par ratio puis par dernière rencontre', () => {
    const rows = [
      { id: 'a', goals: 9, attempts: 15, lastPlayedAt: '2026-06-10T10:00:00Z' },
      { id: 'b', goals: 9, attempts: 10, lastPlayedAt: '2026-06-10T11:00:00Z' },
      { id: 'c', goals: 9, attempts: 10, lastPlayedAt: '2026-06-10T09:00:00Z' }
    ]
    expect(rankStrikers(rows).map((r) => r.id)).toEqual(['c', 'b', 'a'])
  })

  it('classe les défenseurs sur les arrêts', () => {
    const rows = [
      { id: 'x', stops: 4, attempts: 10 },
      { id: 'y', stops: 7, attempts: 15 }
    ]
    expect(rankDefenders(rows)[0].id).toBe('y')
  })
})

describe('génération des rencontres', () => {
  it('donne trois adversaires différents à chaque buteur', () => {
    const matches = generateMatches({
      strikers: ['s1', 's2', 's3'],
      defenders: ['d1', 'd2', 'd3', 'd4'],
      opponents: 3,
      pitches: 2
    })

    expect(matches).toHaveLength(9)
    for (const striker of ['s1', 's2', 's3']) {
      const opponents = matches.filter((m) => m.strikerRegId === striker).map((m) => m.defenderRegId)
      expect(new Set(opponents).size).toBe(3)
    }
    expect(new Set(matches.map((m) => m.pitch))).toEqual(new Set([1, 2]))
  })

  it('s’adapte quand il y a moins de défenseurs que d’adversaires demandés', () => {
    const matches = generateMatches({ strikers: ['s1'], defenders: ['d1', 'd2'], opponents: 3 })
    expect(matches).toHaveLength(2)
  })
})

describe('transitions de statut', () => {
  it('suit le cycle de vie d’une édition', () => {
    expect(canTransitionEdition('registration_open', 'registration_closed')).toBe(true)
    expect(canTransitionEdition('draft', 'finals')).toBe(false)
  })

  it('suit le cycle de vie d’un dossier', () => {
    expect(canTransitionRegistration('submitted', 'approved')).toBe(true)
    expect(canTransitionRegistration('approved', 'checked_in')).toBe(false)
    expect(canTransitionRegistration('scheduled', 'checked_in')).toBe(true)
  })
})

describe('numéro de téléphone', () => {
  it('accepte les groupes de chiffres que les gens écrivent', () => {
    // Le champ du site donne lui-même « +253 77 12 34 56 » en exemple : la
    // validation doit accepter cette forme, sinon toute saisie correcte
    // repart en « Données invalides ».
    expect(toE164('+253 77 48 47 07')).toBe('+25377484707')
    expect(toE164('+253-77-48-47-07')).toBe('+25377484707')
  })

  it('complète les écritures locales et internationales', () => {
    expect(toE164('77 48 47 07')).toBe('+25377484707')
    expect(toE164('077484707')).toBe('+25377484707')
    expect(toE164('00253 77 48 47 07')).toBe('+25377484707')
    expect(toE164('+33 6 12 34 56 78')).toBe('+33612345678')
  })

  it('laisse le schéma refuser ce qui ne forme pas un numéro', () => {
    expect(common.phone.safeParse('+253 77 48 47 07').success).toBe(true)
    expect(common.phone.safeParse('abc').success).toBe(false)
    expect(common.phone.safeParse('').success).toBe(false)
  })
})
