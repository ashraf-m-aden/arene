import { describe, expect, it } from 'vitest'
import { deletionSchema, userQuerySchema } from '@arene/shared'

/**
 * Garde-fous d'une suppression definitive.
 *
 * Le motif et la confirmation retapee ne sont pas du decor d'ecran : c'est le
 * schema partage qui les exige, donc l'API, donc aussi `curl`. Ce test tient ce
 * contrat — le jour ou quelqu'un rendrait `reason` optionnel pour simplifier un
 * formulaire, le journal d'audit perdrait la seule explication qui survit a
 * l'objet supprime.
 */
describe('corps d’une suppression définitive', () => {
  const valid = { reason: 'doublon créé par erreur au guichet', confirm: 'A1B2C3' }

  it('accepte un motif et une confirmation', () => {
    const parsed = deletionSchema.parse(valid)
    expect(parsed.reason).toBe('doublon créé par erreur au guichet')
    expect(parsed.confirm).toBe('A1B2C3')
  })

  it('ne force rien par défaut', () => {
    // `force` leve les blocages d'arbitrage : il doit se demander, jamais se supposer.
    expect(deletionSchema.parse(valid).force).toBe(false)
  })

  it('refuse un motif absent ou expédié', () => {
    expect(() => deletionSchema.parse({ confirm: 'A1B2C3' })).toThrow()
    expect(() => deletionSchema.parse({ ...valid, reason: 'test' })).toThrow()
  })

  it('refuse une confirmation vide', () => {
    expect(() => deletionSchema.parse({ ...valid, confirm: '' })).toThrow()
    expect(() => deletionSchema.parse({ reason: valid.reason })).toThrow()
  })

  it('rogne les espaces de bord du motif et de la confirmation', () => {
    const parsed = deletionSchema.parse({
      reason: '   doublon créé par erreur au guichet   ',
      confirm: '  A1B2C3  '
    })
    expect(parsed.reason).toBe('doublon créé par erreur au guichet')
    expect(parsed.confirm).toBe('A1B2C3')
  })
})

describe('recherche de comptes', () => {
  it('borne le nombre de résultats', () => {
    expect(userQuerySchema.parse({}).limit).toBe(25)
    expect(() => userQuerySchema.parse({ limit: 1000 })).toThrow()
  })

  it('n’accepte que les rôles connus', () => {
    expect(userQuerySchema.parse({ role: 'candidate' }).role).toBe('candidate')
    expect(() => userQuerySchema.parse({ role: 'root' })).toThrow()
  })
})
