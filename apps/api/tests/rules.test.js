import { describe, expect, it } from 'vitest'
import {
  ageAt,
  canTransitionEdition,
  canTransitionRegistration,
  categoryFromSchoolType,
  checkEligibility,
  checkinDeadline,
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

  it('départage d’abord sur les duels gagnés', () => {
    // Même total de buts et même nombre de tentatives : c'est celui qui a
    // emporté le plus de duels qui passe devant, pas celui qui a joué le plus tôt.
    const rows = [
      { id: 'a', goals: 9, attempts: 15, wins: 1, lastPlayedAt: '2026-06-10T09:00:00Z' },
      { id: 'b', goals: 9, attempts: 15, wins: 3, lastPlayedAt: '2026-06-10T11:00:00Z' }
    ]
    expect(rankStrikers(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('départage sur la force de l’opposition avant l’heure de passage', () => {
    /*
     * Le cas qui décide réellement d'une qualification : à 15 tentatives
     * chacun, buts égaux et duels gagnés égaux, le ratio est identique. Seule
     * l'opposition rencontrée sépare les deux — en qualification, un buteur
     * n'affronte que 3 défenseurs tirés dans un effectif de plusieurs dizaines.
     */
    const rows = [
      { id: 'facile', goals: 12, attempts: 15, wins: 3, opposition: 4, lastPlayedAt: '2026-06-10T09:00:00Z' },
      { id: 'dur', goals: 12, attempts: 15, wins: 3, opposition: 9, lastPlayedAt: '2026-06-10T11:00:00Z' }
    ]
    expect(rankStrikers(rows).map((r) => r.id)).toEqual(['dur', 'facile'])
    expect(
      rankDefenders([
        { id: 'facile', stops: 10, attempts: 15, wins: 2, opposition: 3 },
        { id: 'dur', stops: 10, attempts: 15, wins: 2, opposition: 11 }
      ]).map((r) => r.id)
    ).toEqual(['dur', 'facile'])
  })

  it('reste stable quand les critères ajoutés sont absents', () => {
    // Les classements mis en cache avant l'ajout de `wins`/`opposition` ne
    // portent pas ces champs : le tri doit retomber sur les critères suivants
    // sans produire d'ordre aléatoire.
    const rows = [
      { id: 'a', goals: 9, attempts: 15 },
      { id: 'b', goals: 11, attempts: 15 }
    ]
    expect(rankStrikers(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })
})

describe('fenêtre des rendez-vous administratifs', () => {
  it('place la date butoir une semaine avant le tournoi', () => {
    const deadline = checkinDeadline({ startsAt: '2026-12-18T06:00:00Z' })
    expect(deadline.toISOString()).toBe('2026-12-11T06:00:00.000Z')
  })

  it('ne promet rien sans date de tournoi', () => {
    expect(checkinDeadline({})).toBeNull()
    expect(checkinDeadline(null)).toBeNull()
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

  it('laisse un inscrit manquer sa session de jeu', () => {
    // L'inscription est scellée une semaine avant le tournoi : un joueur peut
    // avoir signé et payé, puis ne pas venir jouer. Tant que les deux moments
    // étaient confondus, ce cas n'existait pas et la transition était refusée.
    expect(canTransitionRegistration('checked_in', 'no_show')).toBe(true)
    expect(canTransitionRegistration('checked_in', 'qualified')).toBe(true)
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
