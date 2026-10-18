import bus from '../../core/events.js'
import logger from '../../core/logger.js'
import * as service from './galleries.service.js'

/** Suppression des données d'un enfant : son identification quitte aussi les galeries. */
export function registerGalleryEvents() {
  bus.onEvent('registration.deleted', async ({ registrationId }) => {
    const touched = await service.removeIdentification(registrationId)
    if (touched) logger.info({ registrationId, touched }, 'identifications retirées des galeries')
  })
}

export default registerGalleryEvents
