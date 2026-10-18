import config from './core/config.js'
import logger from './core/logger.js'
import { connectDb } from './core/db.js'
import { QUEUES, registerWorker } from './core/queue.js'
import { registerEvents } from './app.js'
import * as notifications from './modules/notifications/notifications.service.js'
import * as results from './modules/results/results.service.js'

/**
 * Worker : notifications, traitement d'images et recalcul des classements.
 * Même image que l'API, seule la commande change.
 */
async function main() {
  await connectDb()
  registerEvents()

  await registerWorker(QUEUES.notifications, (job) => notifications.processJob(job))
  await registerWorker(QUEUES.rankings, ({ editionId }) => results.refreshRankings(editionId))
  await registerWorker(QUEUES.images, async ({ fileId }) => {
    logger.info({ fileId }, 'déclinaisons d’image déjà produites à l’envoi')
    return { skipped: true }
  })

  logger.info(
    { redis: Boolean(config.redisUrl) },
    config.redisUrl ? 'worker BullMQ à l’écoute' : 'worker en mémoire (REDIS_URL absent)'
  )
}


main().catch((error) => {
  logger.error({ err: error }, 'worker : démarrage impossible')
  process.exit(1)
})
