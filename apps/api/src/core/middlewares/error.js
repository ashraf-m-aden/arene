import { ZodError } from 'zod'
import { AppError } from '../errors.js'
import logger from '../logger.js'
import config from '../config.js'

export function notFoundHandler(req, res) {
  res.status(404).json({
    error: { code: 'not_found', message: `Route inconnue : ${req.method} ${req.originalUrl}` }
  })
}

export function errorHandler(error, req, res, _next) {
  let status = error.status || 500
  let code = error.code || 'internal_error'
  let message = error.message || 'Erreur interne'
  let details = error.details

  if (error instanceof ZodError) {
    status = 422
    code = 'unprocessable'
    message = 'Données invalides'
    details = error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }))
  } else if (error?.name === 'ValidationError' && error.errors) {
    status = 422
    code = 'unprocessable'
    details = Object.entries(error.errors).map(([path, e]) => ({ path, message: e.message }))
  } else if (error?.code === 11000) {
    status = 409
    code = 'duplicate_key'
    message = 'Cette valeur existe déjà'
    details = error.keyValue
  } else if (error?.name === 'CastError') {
    status = 400
    code = 'bad_request'
    message = 'Identifiant invalide'
  } else if (error?.name === 'TokenExpiredError') {
    status = 401
    code = 'token_expired'
    message = 'Session expirée'
  } else if (error?.name === 'JsonWebTokenError') {
    status = 401
    code = 'unauthorized'
    message = 'Jeton invalide'
  } else if (error?.code === 'LIMIT_FILE_SIZE') {
    status = 413
    code = 'file_too_large'
    message = 'Fichier trop volumineux'
  }

  if (status >= 500) {
    logger.error({ err: error, url: req.originalUrl, method: req.method }, 'erreur non gérée')
    if (config.isProd) message = 'Erreur interne'
  } else if (!(error instanceof AppError)) {
    logger.warn({ err: error, url: req.originalUrl }, 'requête rejetée')
  }

  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } })
}
