import { EventEmitter } from 'node:events'
import logger from './logger.js'

/**
 * Bus d'événements interne : un module ne s'appelle jamais directement,
 * il émet et les autres s'abonnent (convocations, classements, notifications).
 */
class EventBus extends EventEmitter {
  emitEvent(name, payload = {}) {
    logger.debug({ event: name, payload }, 'événement émis')
    this.emit(name, payload)
    this.emit('*', { name, payload })
    return this
  }

  onEvent(name, handler) {
    this.on(name, (payload) => {
      Promise.resolve()
        .then(() => handler(payload))
        .catch((error) => logger.error({ err: error, event: name }, 'échec du handler d’événement'))
    })
    return this
  }
}

export const bus = new EventBus().setMaxListeners(50)
export default bus
