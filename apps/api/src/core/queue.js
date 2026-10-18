import config from './config.js'
import logger from './logger.js'

/**
 * File de tâches : BullMQ sur Redis quand REDIS_URL est fourni,
 * sinon repli en mémoire pour le développement et les tests.
 */
const handlers = new Map()
const queues = new Map()
let bullmq = null

async function loadBullmq() {
  if (!config.redisUrl) return null
  if (bullmq) return bullmq
  try {
    bullmq = await import('bullmq')
  } catch {
    logger.warn('bullmq absent : la file repasse en mémoire')
    bullmq = null
  }
  return bullmq
}

async function getQueue(name) {
  const lib = await loadBullmq()
  if (!lib) return null
  if (!queues.has(name)) {
    queues.set(
      name,
      new lib.Queue(name, {
        connection: { url: config.redisUrl },
        defaultJobOptions: {
          attempts: config.notifications.maxAttempts,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 500,
          removeOnFail: 1000
        }
      })
    )
  }
  return queues.get(name)
}

/** Dépose une tâche ; `delay` en millisecondes pour les rappels programmés. */
export async function enqueue(name, payload, { delay = 0, jobId } = {}) {
  const queue = await getQueue(name)
  if (queue) {
    await queue.add(name, payload, { delay, jobId })
    return { queued: 'redis' }
  }

  const run = () => {
    const handler = handlers.get(name)
    if (!handler) {
      logger.warn({ name }, 'aucune tâche enregistrée pour cette file')
      return
    }
    Promise.resolve()
      .then(() => handler(payload))
      .catch((error) => logger.error({ err: error, name }, 'tâche en mémoire échouée'))
  }

  if (delay > 0) setTimeout(run, delay).unref?.()
  else setImmediate(run)
  return { queued: 'memory' }
}

/** Enregistre le traitement d'une file (appelé par le worker et par l'API en mode mémoire). */
export function registerWorker(name, handler) {
  handlers.set(name, handler)
  return loadBullmq().then((lib) => {
    if (!lib) return null
    const worker = new lib.Worker(name, async (job) => handler(job.data), {
      connection: { url: config.redisUrl },
      concurrency: Number(process.env.WORKER_CONCURRENCY || 5)
    })
    worker.on('failed', (job, err) => logger.error({ err, name, jobId: job?.id }, 'tâche échouée'))
    return worker
  })
}

export async function closeQueues() {
  await Promise.all([...queues.values()].map((q) => q.close()))
  queues.clear()
}

export const QUEUES = {
  notifications: 'notifications',
  images: 'images',
  rankings: 'rankings'
}
