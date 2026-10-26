import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * L'enchaînement « dossier envoyé → deux messages en file », sans base ni SES.
 *
 * Les services voisins sont remplacés : ce qui est testé ici, c'est la décision
 * du module notifications — qui est prévenu, avec quel modèle, et avec quelles
 * variables. Le reste (Mongo, la file, le fournisseur) a ses propres tests.
 */
const queueMessage = vi.fn(async () => [])

vi.mock('../src/modules/notifications/notifications.service.js', () => ({ queueMessage }))

const registration = {
  _id: '6500000000000000000abcde',
  editionId: 'edition-1',
  locale: 'fr',
  candidateId: { _id: 'user-1', email: 'candidat@example.dj', locale: 'fr' },
  player: { name: 'Idriss Ahmed Farah' },
  schoolId: { name: { fr: 'Lycée de Balbala', ar: '' } },
  role: 'striker',
  ageCategory: 'lycee',
  grades: { average: 14.5 },
  flags: [{ code: 'gradeBelowThreshold' }],
  slotId: null
}

vi.mock('../src/modules/registrations/registrations.service.js', () => ({
  getById: async () => registration
}))

vi.mock('../src/modules/editions/editions.service.js', () => ({
  getById: async () => ({
    _id: 'edition-1',
    title: { fr: 'Saison 1', ar: '' },
    fee: 1000,
    venue: { name: 'Stade du Ville' }
  })
}))

const { default: bus } = await import('../src/core/events.js')
const { registerNotificationEvents } = await import(
  '../src/modules/notifications/notifications.events.js'
)
const { default: config } = await import('../src/core/config.js')

registerNotificationEvents()

const messages = () => Object.fromEntries(queueMessage.mock.calls.map(([m]) => [m.template, m]))

describe('dossier envoyé', () => {
  beforeEach(() => queueMessage.mockClear())

  it('prévient le candidat et l’organisation', async () => {
    bus.emitEvent('registration.submitted', { registrationId: String(registration._id) })
    await vi.waitFor(() => expect(queueMessage).toHaveBeenCalledTimes(2))

    const sent = messages()
    expect(Object.keys(sent).sort()).toEqual([
      'registration_received',
      'registration_submitted_staff'
    ])

    // Le candidat sur son adresse, l'organisation sur la sienne.
    expect(sent.registration_received.to).toEqual({ email: 'candidat@example.dj' })
    expect(sent.registration_submitted_staff.to).toEqual({ email: config.notifications.orgEmail })
    // Adresse par defaut, sauf si l'environnement en impose une autre.
    if (!process.env.ORG_EMAIL) expect(config.notifications.orgEmail).toBe('contact@dj-arene.com')
  })

  it('récapitule le dossier dans l’alerte de l’organisation', async () => {
    bus.emitEvent('registration.submitted', { registrationId: String(registration._id) })
    await vi.waitFor(() => expect(queueMessage).toHaveBeenCalledTimes(2))

    const { payload, locale, registrationId, editionId } = messages().registration_submitted_staff
    expect(locale).toBe('fr')
    expect(registrationId).toBe(String(registration._id))
    expect(String(editionId)).toBe('edition-1')
    expect(payload).toMatchObject({
      etat: 'Nouvelle candidature',
      prenom: 'Idriss Ahmed Farah',
      edition: 'Saison 1',
      dossier: '0ABCDE',
      ecole: 'Lycée de Balbala',
      categorie: 'lycée',
      role: 'buteur',
      moyenne: 14.5,
      signalements: 'gradeBelowThreshold'
    })
    // Le lien mène à la file de vérification de l'édition, pas à l'espace candidat.
    expect(payload.lien).toContain('/staff/dossiers?editionId=edition-1')
  })

  it('distingue un dossier corrigé d’une nouvelle candidature', async () => {
    bus.emitEvent('registration.submitted', {
      registrationId: String(registration._id),
      corrected: true
    })
    await vi.waitFor(() => expect(queueMessage).toHaveBeenCalledTimes(2))

    expect(messages().registration_submitted_staff.payload.etat).toBe('Dossier corrigé')
  })
})
