import jwt from 'jsonwebtoken'
import config from '../config.js'
import { forbidden, unauthorized } from '../errors.js'

export const ACCESS_COOKIE = 'gm_at'
export const REFRESH_COOKIE = 'gm_rt'

export function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user._id), role: user.role, locale: user.locale },
    config.jwt.accessSecret,
    { expiresIn: config.jwt.accessTtl }
  )
}

export function signRefreshToken(user, tokenVersion = 0) {
  return jwt.sign({ sub: String(user._id), v: tokenVersion }, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshTtl
  })
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret)
}

export const refreshCookieOptions = {
  httpOnly: true,
  secure: config.isProd,
  sameSite: 'lax',
  path: `${config.apiPrefix}/auth`,
  maxAge: 30 * 24 * 3600 * 1000
}

function readToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.[ACCESS_COOKIE] || null
}

/** Pose req.user si un jeton valide est présent, sans jamais bloquer. */
export function attachUser(req, _res, next) {
  const token = readToken(req)
  if (!token) return next()
  try {
    const payload = jwt.verify(token, config.jwt.accessSecret)
    req.user = { id: payload.sub, role: payload.role, locale: payload.locale }
  } catch {
    // jeton expiré ou invalide : la route protégée répondra 401
  }
  next()
}

export const requireAuth = (req, _res, next) =>
  req.user ? next() : next(unauthorized())

/** requireRole('staff') laisse aussi passer l'admin : le rôle admin couvre le staff. */
export function requireRole(...roles) {
  const allowed = new Set(roles.flat())
  if (allowed.has('staff')) allowed.add('admin')
  return (req, _res, next) => {
    if (!req.user) return next(unauthorized())
    if (!allowed.has(req.user.role)) return next(forbidden())
    return next()
  }
}
