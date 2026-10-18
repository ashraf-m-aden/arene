import bus from '../../core/events.js'
import { enqueue, QUEUES } from '../../core/queue.js'

/**
 * Chaque résultat saisi et chaque check-in déclenche le recalcul des classements.
 * Le calcul part en file : les pages publiques lisent le cache de l'édition.
 */
export function registerResultEvents() {
  const refresh = ({ editionId }) =>
    enqueue(QUEUES.rankings, { editionId }, { jobId: `rankings:${editionId}` })

  bus.onEvent('result.recorded', refresh)
  bus.onEvent('registration.checked_in', refresh)
  bus.onEvent('slot.closed', async ({ slotId }) => {
    const { getById } = await import('../slots/slots.service.js')
    const slot = await getById(slotId)
    await refresh({ editionId: String(slot.editionId) })
  })
}

export default registerResultEvents
