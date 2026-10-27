import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { checkEligibility } from '@arene/shared'

/**
 * Les signalements des controles automatiques s'affichent dans l'espace du
 * candidat. Un code sans libelle y sortait tel quel — « age_out_of_range » en
 * toutes lettres sous les yeux d'un lyceen. Ce test tient les deux bouts
 * ensemble : tout code produit par les regles partagees doit avoir sa phrase,
 * en francais et en arabe.
 */
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const localeFile = (lang) =>
  JSON.parse(fs.readFileSync(path.join(repoRoot, `apps/web/layers/base/locales/${lang}.json`), 'utf8'))

/** Un dossier impossible : hors d'age, sans moyenne, sur un role complet. */
const codesFromRules = () =>
  checkEligibility({
    birthDate: '1990-01-01',
    ageCategory: 'lycee',
    gradeAverage: undefined,
    roleSeatsLeft: 0
  }).issues.map((issue) => issue.code)

describe('libelles des signalements', () => {
  const codes = [
    ...codesFromRules(),
    // Pose par `registrations.service.computeFlags`, hors de `checkEligibility`.
    'duplicate',
    // Moyenne presente mais sous le seuil : exclusif de `grade_missing`.
    ...checkEligibility({
      birthDate: '2008-01-01',
      ageCategory: 'lycee',
      gradeAverage: 8,
      gradeThreshold: 12
    }).issues.map((issue) => issue.code)
  ]

  it('couvre tous les codes des regles partagees', () => {
    // Si ce test tombe apres l'ajout d'une regle, c'est le libelle qui manque.
    expect(new Set(codes)).toEqual(
      new Set([
        'age_out_of_range',
        'grade_missing',
        'grade_below_threshold',
        'role_full',
        'duplicate'
      ])
    )
  })

  for (const lang of ['fr', 'ar']) {
    it(`traduit chaque signalement en ${lang}`, () => {
      const labels = localeFile(lang).flag
      expect(labels, `namespace flag absent en ${lang}`).toBeTruthy()
      for (const code of new Set(codes)) {
        expect(labels[code], `libelle manquant : flag.${code} (${lang})`).toBeTruthy()
      }
      // Repli pour un code que les locales ne connaitraient pas encore.
      expect(labels.unknown).toBeTruthy()
    })
  }

  it('garde les variables attendues par chaque phrase', () => {
    const fr = localeFile('fr').flag
    // Les nombres viennent du `detail` du signalement : age/min/max, average/threshold.
    expect(fr.age_out_of_range).toContain('{age}')
    expect(fr.age_out_of_range).toContain('{min}')
    expect(fr.age_out_of_range).toContain('{max}')
    expect(fr.grade_below_threshold).toContain('{average}')
    expect(fr.grade_below_threshold).toContain('{threshold}')

    // Et ces variables doivent exister dans le detail produit par les regles.
    const { issues } = checkEligibility({
      birthDate: '1990-01-01',
      ageCategory: 'lycee',
      gradeAverage: 8,
      gradeThreshold: 12
    })
    const detail = Object.fromEntries(issues.map((issue) => [issue.code, issue.detail || {}]))
    expect(detail.age_out_of_range).toMatchObject({ age: expect.any(Number), min: 15, max: 18 })
    expect(detail.grade_below_threshold).toMatchObject({ average: 8, threshold: 12 })
  })
})
