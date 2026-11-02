import { Router } from 'express'
import {
  createStaffSchema,
  deletionSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  userQuerySchema,
  common
} from '@arene/shared'
import { requireAuth, requireRole } from '../../core/middlewares/auth.js'
import { validate, validateBody } from '../../core/middlewares/validate.js'
import { authLimiter, writeLimiter } from '../../core/middlewares/rateLimit.js'
import * as controller from './auth.controller.js'

export const router = Router()

router.post('/register', authLimiter, validateBody(registerSchema), controller.register)
router.post('/login', authLimiter, validateBody(loginSchema), controller.login)
router.post('/refresh', controller.refresh)
router.post('/logout', controller.logout)
router.post(
  '/password/forgot',
  authLimiter,
  validateBody(forgotPasswordSchema),
  controller.forgotPassword
)
router.post(
  '/password/reset',
  authLimiter,
  validateBody(resetPasswordSchema),
  controller.resetPassword
)
router.get('/me', requireAuth, controller.me)

// Comptes staff : réservés à l'administrateur.
router.get('/staff', requireRole('admin'), controller.listStaff)
router.post(
  '/staff',
  requireRole('admin'),
  validateBody(createStaffSchema),
  controller.createStaff
)
router.patch(
  '/staff/:id',
  requireRole('admin'),
  validate({ params: common.idParam }),
  controller.setStaffActive
)

/*
 * Comptes, tous roles confondus. `/staff` ne montre que l'organisation : pour
 * supprimer le compte d'un candidat, encore faut-il pouvoir le retrouver.
 */
router.get(
  '/users',
  requireRole('admin'),
  validate({ query: userQuerySchema }),
  controller.searchUsers
)
router.get(
  '/users/:id/deletion-impact',
  requireRole('admin'),
  validate({ params: common.idParam }),
  controller.userDeletionImpact
)
router.delete(
  '/users/:id',
  requireRole('admin'),
  writeLimiter,
  validate({ params: common.idParam, body: deletionSchema }),
  controller.destroyUser
)

export default router
