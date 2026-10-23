import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken
} from '../../core/middlewares/auth.js'
import { asyncHandler, created, ok } from '../../core/utils/http.js'
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
