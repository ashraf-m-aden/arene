import config from './core/config.js'
import logger from './core/logger.js'
import { connectDb, disconnectDb } from './core/db.js'
import { closeQueues, registerWorker, QUEUES } from './core/queue.js'
import { createApp, registerEvents } from './app.js'
import * as notifications from './modules/notifications/notifications.service.js'
import * as results from './modules/results/results.service.js'

async function main() {
  await connectDb()
  registerEvents()

  // Sans Redis, l'API traite elle-même la file en mémoire : pratique en local.
  if (!config.redisUrl) {
    registerWorker(QUEUES.notifications, (job) => notifications.processJob(job))
    registerWorker(QUEUES.rankings, ({ editionId }) => results.refreshRankings(editionId))
    logger.warn('REDIS_URL absent : les tâches sont traitées en mémoire dans l’API')
  }

  const app = createApp()
  const server = app.listen(config.port, () => {
    logger.info(
      { port: config.port, env: config.env, prefix: config.apiPrefix },
      "API de l'Arène démarrée"
    )
  })

  const shutdown = async (signal) => {
    logger.info({ signal }, 'arrêt en cours')
    server.close()
    await closeQueues().catch(() => null)
    await disconnectDb()
    process.exit(0)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))
}

main().catch((error) => {
  logger.error({ err: error }, 'démarrage impossible')
  process.exit(1)
})
