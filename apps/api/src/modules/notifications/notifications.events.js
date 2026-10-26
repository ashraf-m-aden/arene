import config from '../../core/config.js'
import bus from '../../core/events.js'
import logger from '../../core/logger.js'
import { pickLocale } from '../../core/utils/text.js'
import * as service from './notifications.service.js'

const registrationsService = () => import('../registrations/registrations.service.js')
const editionsService = () => import('../editions/editions.service.js')
const slotsService = () => import('../slots/slots.service.js')

const siteUrl = (locale, path) =>
  `${config.publicSiteUrl.replace(/\/$/, '')}${locale === 'ar' ? '/ar' : ''}${path}`

/** Rassemble tout ce dont un message a besoin : destinataire, langue, variables. */
async function buildContext(registrationId, extra = {}) {
  const registrations = await registrationsService()
  const registration = await registrations.getById(registrationId)
  const editions = await editionsService()
  const edition = await editions.getById(registration.editionId)

  const candidate = registration.candidateId
  const locale = registration.locale || candidate?.locale || config.defaultLocale
  const slot = registration.slotId
    ? await (await slotsService()).getById(registration.slotId)
    : null

  return {
    registration,
    edition,
    locale,
    to: { email: candidate?.email },
    userId: candidate?._id,
    payload: {
      prenom: registration.player?.name || '',
      edition: pickLocale(edition.title, locale),
      creneau: slot?.label || '',
      date: slot?.startsAt
        ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-DJ' : 'fr-FR', {
            dateStyle: 'full',
            timeStyle: 'short'
          }).format(slot.startsAt)
        : '',
      lieu: slot?.venue || edition.venue?.name || '',
      frais: edition.fee ?? 0,
      lien: siteUrl(locale, '/compte'),
      ...extra
    }
  }
}

/** Libellés du message interne : il part en français, sur la boîte de l'organisation. */
const ROLE_LABELS = { striker: 'buteur', defender: 'défenseur' }
const CATEGORY_LABELS = { lycee: 'lycée', universite: 'université' }

/**
 * Prévient l'organisation qu'un dossier attend dans la file de vérification.
 *
 * Le seul message qui ne s'adresse pas à un candidat. Il récapitule ce qui
 * décide de la suite — école, rôle, catégorie, moyenne déclarée, signalements
 * des contrôles automatiques — pour que l'organisation sache, sans ouvrir le
 * back-office, si le dossier demande un examen attentif. Le lien pointe la file
 * de l'édition concernée, pas l'espace du candidat.
 *
 * Un échec ici ne doit jamais empêcher le message du candidat : les deux envois
 * sont indépendants, et celui-ci est journalisé puis oublié.
 */
async function notifyStaff(registrationId, { corrected = false } = {}) {
  const to = config.notifications.orgEmail
  if (!to) return

  try {
    const { registration, edition, payload } = await buildContext(registrationId)
    const flags = (registration.flags || []).map((flag) => flag.code)

    await service.queueMessage({
      template: 'registration_submitted_staff',
      channel: 'email',
      to: { email: to },
      locale: 'fr',
      payload: {
        ...payload,
        etat: corrected ? 'Dossier corrigé' : 'Nouvelle candidature',
        dossier: String(registration._id).slice(-6).toUpperCase(),
        ecole: pickLocale(registration.schoolId?.name, 'fr') || '—',
        categorie: CATEGORY_LABELS[registration.ageCategory] || '—',
        role: ROLE_LABELS[registration.role] || '—',
        moyenne: registration.grades?.average ?? '—',
        signalements: flags.length ? flags.join(', ') : 'aucun',
        lien: siteUrl('fr', `/staff/dossiers?editionId=${edition._id}`)
      },
      editionId: edition._id,
      registrationId
    })
  } catch (error) {
    logger.error({ err: error, registrationId }, 'alerte organisation non mise en file')
  }
}

async function notify(template, registrationId, extra) {
  try {
    const context = await buildContext(registrationId, extra)
    await service.queueMessage({
      template,
      to: context.to,
      locale: context.locale,
      payload: context.payload,
      editionId: context.edition._id,
      registrationId,
      userId: context.userId
    })
  } catch (error) {
    logger.error({ err: error, template, registrationId }, 'notification non mise en file')
  }
}

/**
 * Abonnements du module : les autres modules émettent, celui-ci décide
 * du modèle, de la langue et du canal.
 */
export function registerNotificationEvents() {
  /*
   * Un dossier envoyé prévient deux destinataires : le candidat, qui reçoit un
   * accusé de réception, et l'organisation, pour qui c'est du travail qui
   * arrive. `corrected` distingue le renvoi après correction du premier dépôt.
   */
  bus.onEvent('registration.submitted', async ({ registrationId, corrected }) => {
    await notify('registration_received', registrationId)
    await notifyStaff(registrationId, { corrected })
  })

  bus.onEvent('registration.changes_requested', ({ registrationId, reason }) =>
    notify('registration_changes_requested', registrationId, { motif: reason || '' })
  )

  bus.onEvent('registration.approved', ({ registrationId }) =>
    notify('registration_approved', registrationId)
  )

  bus.onEvent('registration.rejected', ({ registrationId, reason }) =>
    notify('registration_rejected', registrationId, { motif: reason || '' })
  )

  bus.onEvent('registration.qualified', ({ registrationId }) =>
    notify('registration_qualified', registrationId)
  )

  /**
   * Convocation à l'attribution du créneau, puis rappel automatique la veille.
   *
   * Deux jeux de messages selon la nature du créneau : le rendez-vous
   * administratif annonce les frais à régler en espèces et la pièce d'identité à
   * apporter, la session de jeu ne parle que d'horaire et de dossard — une
   * semaine plus tard, tout est déjà signé et encaissé.
   */
  bus.onEvent('slot.assigned', async ({ registrationId, slotId, kind }) => {
    const competition = kind === 'competition'
    await notify(competition ? 'session_assigned' : 'slot_assigned', registrationId)

    try {
      const slots = await slotsService()
      const slot = await slots.getById(slotId)
      const context = await buildContext(registrationId)
      await service.queueMessage({
        template: competition ? 'session_reminder' : 'slot_reminder',
        channel: 'email',
        to: context.to,
        locale: context.locale,
        payload: context.payload,
        editionId: context.edition._id,
        registrationId,
        userId: context.userId,
        delay: slots.reminderDelayFor(slot)
      })
    } catch (error) {
      logger.error({ err: error, registrationId }, 'rappel de convocation non programmé')
    }
  })

  logger.debug('abonnements notifications enregistrés')
}

export default registerNotificationEvents
