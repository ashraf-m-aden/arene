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
  bus.onEvent('registration.submitted', ({ registrationId }) =>
    notify('registration_received', registrationId)
  )

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
