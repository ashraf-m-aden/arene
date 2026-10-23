import rateLimit from 'express-rate-limit'
import config from '../config.js'

const base = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => config.isTest,
  message: {
    error: {
      code: 'too_many_requests',
      key: 'tooManyRequests',
      message: 'Trop de tentatives, réessayez plus tard'
    }
  }
}

/** L'auth, l'inscription et l'envoi de fichiers sont limités par IP. */
export const authLimiter = rateLimit({ ...base, windowMs: 15 * 60 * 1000, limit: 20 })
export const writeLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 60 })
export const uploadLimiter = rateLimit({ ...base, windowMs: 60 * 60 * 1000, limit: 40 })
export const apiLimiter = rateLimit({ ...base, windowMs: 60 * 1000, limit: 300 })
