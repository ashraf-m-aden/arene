import bus from '../../core/events.js'
import logger from '../../core/logger.js'
import * as service from './slots.service.js'

/** Un dossier accepté reçoit automatiquement un créneau, sans intervention du staff. */
export function registerSlotEvents() {
  bus.onEvent('registration.approved', async ({ registrationId }) => {
    const slot = await service.autoAssign(registrationId)
    if (!slot) {
      logger.warn({ registrationId }, 'dossier accepté sans créneau disponible (liste d’attente)')
    }
  })
}

export default registerSlotEvents
