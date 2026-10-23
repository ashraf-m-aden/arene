import { z } from 'zod'
import { USER_ROLES } from '../constants.js'
import { email, locale, password, phone } from './common.js'

/**
 * Le nom est saisi UNE SEULE FOIS, ici, a la creation du compte : un seul champ,
 * pas de prenom/nom separes. Les noms djiboutiens s'ecrivent en chaine (nom propre,
 * nom du pere, nom du grand-pere) et ne se decoupent pas en deux cases.
 *
 * Il porte le compte permanent : il n'est plus jamais modifie, et il est repris tel
 * quel d'une edition a l'autre.
 */
/**
 * L'email est obligatoire : c'est le seul canal de la plateforme. Sans lui, un
 * compte ne recevrait ni décision, ni convocation, ni lien de réinitialisation.
 * Le téléphone reste demandé, mais comme contact de secours uniquement.
 */
export const registerSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email,
  phone,
  password,
  locale: locale.default('fr')
})

export const loginSchema = z
  .object({
    identifier: z.string().trim().min(5).max(120),
    password: z.string().min(1)
  })

export const forgotPasswordSchema = z.object({ identifier: z.string().trim().min(5) })
export const resetPasswordSchema = z.object({
  token: z.string().min(20),
  password
})

export const createStaffSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email,
  phone: phone.optional(),
  password,
  role: z.enum(USER_ROLES).default('staff')
})
