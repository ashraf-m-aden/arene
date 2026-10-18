import express from 'express'
import cookieParser from 'cookie-parser'
import cors from 'cors'
import helmet from 'helmet'
import pinoHttp from 'pino-http'

import config from './core/config.js'
import logger from './core/logger.js'
import { attachUser } from './core/middlewares/auth.js'
import { sanitizeRequest } from './core/middlewares/sanitize.js'
import { apiLimiter } from './core/middlewares/rateLimit.js'
import { errorHandler, notFoundHandler } from './core/middlewares/error.js'

import auth from './modules/auth/index.js'
import editions from './modules/editions/index.js'
import registrations from './modules/registrations/index.js'
import schools from './modules/schools/index.js'
import files from './modules/files/index.js'
import * as slots from './modules/slots/index.js'
import * as results from './modules/results/index.js'
import * as galleries from './modules/galleries/index.js'
import * as notifications from './modules/notifications/index.js'

import { registerSlotEvents } from './modules/slots/slots.events.js'
import { registerResultEvents } from './modules/results/results.events.js'
import { registerGalleryEvents } from './modules/galleries/galleries.events.js'
import { registerNotificationEvents } from './modules/notifications/notifications.events.js'

/** Abonnements inter-modules : montés une seule fois, API comme worker. */
let eventsRegistered = false
export function registerEvents() {
  if (eventsRegistered) return
  registerSlotEvents()
  registerResultEvents()
  registerGalleryEvents()
  registerNotificationEvents()
  eventsRegistered = true
  logger.info('bus d’événements prêt')
}

export function createApp() {
  const app = express()

  if (config.trustProxy) app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          frameAncestors: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"]
        }
      }
    })
  )
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS']
    })
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/health' } }))
  app.use(sanitizeRequest)
  app.use(attachUser)

  app.get('/health', (_req, res) => res.json({ status: 'ok', env: config.env, time: new Date() }))

  const api = express.Router()
  api.use(apiLimiter)

  api.use('/auth', auth.router)
  api.use('/editions', editions.router)
  api.use('/registrations', registrations.router)
  api.use('/schools', schools.router)
  api.use('/slots', slots.router)
  api.use('/matches', results.router)
  api.use('/galleries', galleries.router)
  api.use('/notifications', notifications.router)
  api.use('/notification-templates', notifications.templatesRouter)
  api.use('/checkin', slots.checkinRouter)
  api.use('/files', files.router)

  // Ressources imbriquées : l'URL reste celle de la documentation.
  api.use('/editions/:editionId/slots', slots.editionRouter)
  api.use('/editions/:editionId/rankings', results.rankingsRouter)
  api.use('/editions/:editionId/finals', results.finalsRouter)
  api.use('/editions/:editionId/galleries', galleries.editionRouter)
  api.use('/slots/:slotId/matches', results.slotRouter)

  app.use(config.apiPrefix, api)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export default createApp
