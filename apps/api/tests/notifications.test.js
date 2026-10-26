import { describe, expect, it } from 'vitest'
import { DEFAULT_TEMPLATES, renderTemplate } from '../src/modules/notifications/notifications.templates.js'

/**
 * Les modèles de messages sont du texte : ils se testent sans base ni réseau.
 * Ce qui casse en vrai, c'est une variable orpheline — `renderTemplate` remplace
 * silencieusement par du vide, et le message part amputé sans que rien n'échoue.
 */
describe('modèles de messages', () => {
  const variables = (template) => {
    const found = new Set()
    for (const text of [...Object.values(template.subject || {}), ...Object.values(template.body || {})]) {
      for (const [, key] of String(text).matchAll(/\{\{\s*(\w+)\s*\}\}/g)) found.add(key)
    }
    return found
  }

  it('alerte l’organisation à chaque dossier envoyé', () => {
    const template = DEFAULT_TEMPLATES.registration_submitted_staff
    expect(template).toBeTruthy()
    expect(template.channels).toEqual(['email'])
    // Message interne : il part en français, inutile de le traduire.
    expect(template.subject.fr).toContain('{{etat}}')
    expect(template.body.fr).toContain('{{lien}}')
  })

  it('ne laisse aucune variable de l’alerte sans valeur', () => {
    const template = DEFAULT_TEMPLATES.registration_submitted_staff
    // Exactement ce que `notifyStaff` pose dans la charge utile.
    const payload = {
      etat: 'Nouvelle candidature',
      prenom: 'Idriss Ahmed Farah',
      edition: 'Saison 1',
      dossier: 'A1B2C3',
      ecole: 'Lycée de Balbala',
      categorie: 'lycée',
      role: 'buteur',
      moyenne: 14.5,
      signalements: 'aucun',
      lien: 'https://dj-arene.com/staff/dossiers?editionId=1'
    }

    for (const key of variables(template)) expect(payload).toHaveProperty(key)

    const subject = renderTemplate(template.subject.fr, payload)
    const body = renderTemplate(template.body.fr, payload)
    expect(subject).toBe('Nouvelle candidature — Idriss Ahmed Farah (Saison 1)')
    expect(body).toContain('dossier n° A1B2C3')
    expect(body).toContain('14.5/20')
    expect(`${subject} ${body}`).not.toContain('{{')
  })

  it('garde un sujet et un corps en français pour chaque modèle', () => {
    for (const [key, template] of Object.entries(DEFAULT_TEMPLATES)) {
      expect(template.body?.fr, `corps manquant : ${key}`).toBeTruthy()
      expect(template.channels?.length, `canal manquant : ${key}`).toBeTruthy()
    }
  })
})
