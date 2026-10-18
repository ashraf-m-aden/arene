import { z } from 'zod'
import { USER_ROLES } from '../constants.js'
import { email, locale, password, phone } from './common.js'

export const registerSchema = z
  .object({
    firstName: z.string().trim().min(2).max(60),
    lastName: z.string().trim().min(2).max(60),
    email: email.optional(),
    phone,
    password,
    locale: locale.default('fr'),
    acceptsWhatsapp: z.boolean().default(true)
  })
  .refine((v) => v.email || v.phone, { message: 'email ou téléphone requis' })

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(5).max(120),
    password: z.string().min(1)
  })

export const otpRequestSchema = z.object({ phone })
export const otpVerifySchema = z.object({ phone, code: z.string().regex(/^\d{6}$/) })

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(5) })
export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password
})

export const createStaffSchema = z.object({
  firstName: z.string().trim().min(2).max(60),
  lastName: z.string().trim().min(2).max(60),
  email,
  phone: phone.optional(),
  password,
  role: z.enum(USER_ROLES).default('staff')
})
