import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken
} from '../../core/middlewares/auth.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
import { recordAudit } from '../../core/middlewares/audit.js'
import * as service from './auth.service.js'

/** Une session = un jeton d'accès court dans la réponse + un jeton de rafraîchissement en cookie. */
function issueSession(res, user) {
  res.cookie(REFRESH_COOKIE, signRefreshToken(user, user.tokenVersion), refreshCookieOptions)
  return {
    accessToken: signAccessToken(user),
    user: user.toJSON ? user.toJSON() : user
  }
}

export const register = asyncHandler(async (req, res) => {
  const user = await service.register(req.body)
  created(res, issueSession(res, user))
})

export const login = asyncHandler(async (req, res) => {
  const user = await service.login(req.body)
  ok(res, issueSession(res, user))
})

export const refresh = asyncHandler(async (req, res) => {
  const user = await service.rotateRefresh(req.cookies?.[REFRESH_COOKIE])
  ok(res, issueSession(res, user))
})

export const logout = asyncHandler(async (req, res) => {
  if (req.user) await service.logout(req.user.id)
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions)
  res.clearCookie(ACCESS_COOKIE)
  ok(res, { loggedOut: true })
})

export const forgotPassword = asyncHandler(async (req, res) => {
  ok(res, await service.forgotPassword(req.body.identifier))
})

export const resetPassword = asyncHandler(async (req, res) => {
  const user = await service.resetPassword(req.body)
  ok(res, issueSession(res, user))
})

export const me = asyncHandler(async (req, res) => {
  ok(res, await service.getById(req.user.id))
})

export const createStaff = asyncHandler(async (req, res) => {
  created(res, await service.createStaff(req.body))
})

export const listStaff = asyncHandler(async (req, res) => {
  ok(res, await service.listStaff())
})

export const setStaffActive = asyncHandler(async (req, res) => {
  ok(res, await service.setActive(req.params.id, req.body.isActive !== false))
})

export const searchUsers = asyncHandler(async (req, res) => {
  ok(res, await service.searchUsers(req.validatedQuery))
})

/** Aperçu d'impact d'une suppression de compte, tracé comme la suppression. */
export const userDeletionImpact = asyncHandler(async (req, res) => {
  const preview = await service.userDeletionImpact(req.params.id, req.user)
  await recordAudit(req, 'user.deletion_preview', { kind: 'user', id: req.params.id })
  ok(res, preview)
})

/**
 * Suppression définitive d'un compte, tracée en deux temps comme celle d'un
 * dossier : l'instantané avant (le compte disparu, son nom et son email ne se
 * retrouvent plus nulle part), la confirmation après le succès — sans quoi une
 * tentative refusée se lirait comme un effacement.
 */
export const destroyUser = asyncHandler(async (req, res) => {
  const target = { kind: 'user', id: req.params.id }
  const preview = await service.userDeletionImpact(req.params.id, req.user)
  await recordAudit(req, 'user.delete_requested', target, {
    reason: req.body.reason,
    forced: Boolean(req.body.force),
    snapshot: preview.user,
    impact: preview.impact,
    blockers: [...preview.hard, ...preview.blockers].map((blocker) => blocker.code)
  })

  const result = await service.destroyUser(req.params.id, req.user, req.body)
  await recordAudit(req, 'user.delete', target, {
    email: preview.user.email,
    reason: req.body.reason,
    forced: Boolean(req.body.force)
  })
  ok(res, result)
})
