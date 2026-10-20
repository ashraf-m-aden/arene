import crypto from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../core/errors.js'
import { toE164 } from '../../core/utils/text.js'
import { verifyRefreshToken } from '../../core/middlewares/auth.js'
import { enqueue, QUEUES } from '../../core/queue.js'
import logger from '../../core/logger.js'
import { User } from './auth.model.js'

const OTP_TTL_MS = 10 * 60 * 1000
const RESET_TTL_MS = 60 * 60 * 1000

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex')

export async function hashPassword(password) {
  return hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 })
}

async function checkPassword(hashValue, password) {
  if (!hashValue) return false
  try {
    return await verify(hashValue, password)
  } catch {
    return false
  }
}

export async function register(input) {
  const phone = toE164(input.phone)
  const existing = await User.findOne({
    $or: [{ phone }, ...(input.email ? [{ email: input.email }] : [])]
  })
  if (existing) throw conflict('Un compte existe déjà avec ce téléphone ou cet email')

  return User.create({
    ...input,
    phone,
    role: 'candidate',
    passwordHash: await hashPassword(input.password)
  })
}

export async function login({ identifier, password }) {
  const value = identifier.includes('@') ? identifier.toLowerCase().trim() : toE164(identifier)
  const user = await User.findOne({ $or: [{ email: value }, { phone: value }] }).select(
    '+passwordHash'
  )
  if (!user) throw unauthorized('Identifiants incorrects')
  if (!user.isActive) throw forbidden('Compte désactivé')
  if (!(await checkPassword(user.passwordHash, password))) {
    throw unauthorized('Identifiants incorrects')
  }
  user.lastLoginAt = new Date()
  await user.save()
  return user
}

/** Code à usage unique envoyé par WhatsApp, pour les candidats sans email. */
export async function requestOtp(rawPhone) {
  const phone = toE164(rawPhone)
  const user = await User.findOne({ phone })
  if (!user) throw notFound('Aucun compte avec ce numéro')

  const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0')
  user.otp = { codeHash: sha256(code), expiresAt: new Date(Date.now() + OTP_TTL_MS), attempts: 0 }
  await user.save()

  await enqueue(QUEUES.notifications, {
    template: 'otp_code',
    channel: 'whatsapp',
    to: phone,
    locale: user.locale,
    payload: { code }
  })

  logger.info({ phone }, 'code à usage unique envoyé')
  return { sent: true, expiresAt: user.otp.expiresAt }
}

export async function verifyOtp({ phone: rawPhone, code }) {
  const phone = toE164(rawPhone)
  const user = await User.findOne({ phone }).select('+otp.codeHash')
  if (!user?.otp?.codeHash) throw unauthorized('Aucun code en attente')
  if (user.otp.expiresAt < new Date()) throw unauthorized('Code expiré')
  if (user.otp.attempts >= 5) throw unauthorized('Trop de tentatives, demandez un nouveau code')

  if (user.otp.codeHash !== sha256(code)) {
    user.otp.attempts += 1
    await user.save()
    throw unauthorized('Code incorrect')
  }

  user.otp = undefined
  user.lastLoginAt = new Date()
  await user.save()
  return user
}

export async function rotateRefresh(token) {
  if (!token) throw unauthorized('Session absente')
  const payload = verifyRefreshToken(token)
  const user = await User.findById(payload.sub)
  if (!user || !user.isActive) throw unauthorized('Session invalide')
  if ((payload.v ?? 0) !== user.tokenVersion) throw unauthorized('Session révoquée')
  return user
}

export async function logout(userId) {
  await User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } })
}

export async function forgotPassword(identifier) {
  const value = identifier.includes('@') ? identifier.toLowerCase().trim() : toE164(identifier)
  const user = await User.findOne({ $or: [{ email: value }, { phone: value }] })
  // Réponse identique que le compte existe ou non, pour ne pas énumérer les comptes.
  if (!user) return { sent: true }

  const token = crypto.randomBytes(32).toString('hex')
  user.passwordReset = { tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) }
  await user.save()

  await enqueue(QUEUES.notifications, {
    template: 'password_reset',
    channel: user.email ? 'email' : 'whatsapp',
    to: user.email || user.phone,
    locale: user.locale,
    payload: { token, firstName: user.firstName }
  })
  return { sent: true }
}

export async function resetPassword({ token, password }) {
  const user = await User.findOne({
    'passwordReset.tokenHash': sha256(token),
    'passwordReset.expiresAt': { $gt: new Date() }
  }).select('+passwordReset.tokenHash')
  if (!user) throw badRequest('Lien de réinitialisation invalide ou expiré')

  user.passwordHash = await hashPassword(password)
  user.passwordReset = undefined
  user.tokenVersion += 1
  await user.save()
  return user
}

export async function createStaff(input) {
  const existing = await User.findOne({ email: input.email })
  if (existing) throw conflict('Un compte existe déjà avec cet email')
  return User.create({
    ...input,
    phone: input.phone ? toE164(input.phone) : undefined,
    passwordHash: await hashPassword(input.password)
  })
}

export async function listStaff() {
  return User.find({ role: { $in: ['staff', 'admin'] } }).sort({ createdAt: -1 })
}

export async function setActive(id, isActive) {
  const user = await User.findByIdAndUpdate(
    id,
    { isActive, $inc: { tokenVersion: 1 } },
    { new: true }
  )
  if (!user) throw notFound('Compte introuvable')
  return user
}

export async function getById(id) {
  const user = await User.findById(id)
  if (!user) throw notFound('Compte introuvable')
  return user
}
