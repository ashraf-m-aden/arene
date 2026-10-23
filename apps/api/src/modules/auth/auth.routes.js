import { Router } from 'express'
import {
  createStaffSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  common
} from '@arene/shared'
import { requireAuth, requireRole } from '../../core/middlewares/auth.js'
import { validate, validateBody } from '../../core/middlewares/validate.js'
import { authLimiter } from '../../core/middlewares/rateLimit.js'
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

export default router
