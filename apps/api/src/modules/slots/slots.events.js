import bus from '../../core/events.js'
import logger from '../../core/logger.js'

/**
 * Un dossier accepté REJOINT LA FILE d'attente ; il ne reçoit pas de rendez-vous
 * tout seul.
 *
 * L'attribution automatique au fil de l'eau existait quand les créneaux étaient
 * publics et créés d'avance. Elle entre maintenant en conflit direct avec la
 * répartition voulue par l'organisation : un dossier auto-attribué sortirait de
 * `listAwaitingSlot` et le bouton « Répartir » trouverait une file vide, alors
 * que chacun serait déjà placé dans le premier rendez-vous ayant de la place.
 *
 * Les rendez-vous sont donc posés en une fois, depuis le calendrier de l'édition,
 * puis communiqués par message. L'abonnement reste ici pour tracer l'attente.
 */
export function registerSlotEvents() {
  bus.onEvent('registration.approved', async ({ registrationId, editionId }) => {
    logger.info(
      { registrationId, editionId },
      'dossier accepté : en attente de répartition'
    )
  })
}

export default registerSlotEvents
