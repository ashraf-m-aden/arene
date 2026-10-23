import crypto from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'
import { badRequest, conflict, forbidden, notFound, unauthorized } from '../../core/errors.js'
import { toE164 } from '../../core/utils/text.js'
import { verifyRefreshToken } from '../../core/middlewares/auth.js'
import { enqueue, QUEUES } from '../../core/queue.js'
import logger from '../../core/logger.js'
import { User } from './auth.model.js'

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
  if (existing) throw conflict('Un compte existe déjà avec ce téléphone ou cet email').withKey('accountExistsPhoneOrEmail')

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
  if (!user) throw unauthorized('Identifiants incorrects').withKey('badCredentials')
  if (!user.isActive) throw forbidden('Compte désactivé').withKey('accountDisabled')
  if (!(await checkPassword(user.passwordHash, password))) {
    throw unauthorized('Identifiants incorrects').withKey('badCredentials')
  }
  user.lastLoginAt = new Date()
  await user.save()
  return user
}

export async function rotateRefresh(token) {
  if (!token) throw unauthorized('Session absente').withKey('sessionMissing')
  const payload = verifyRefreshToken(token)
  const user = await User.findById(payload.sub)
  if (!user || !user.isActive) throw unauthorized('Session invalide').withKey('sessionInvalid')
  if ((payload.v ?? 0) !== user.tokenVersion) throw unauthorized('Session révoquée').withKey('sessionRevoked')
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

  // Les comptes créés avant que l'email ne devienne obligatoire peuvent ne pas
  // en avoir : il n'existe alors aucun canal pour les joindre. On répond comme
  // pour un compte inconnu plutôt que de laisser croire à un envoi.
  if (!user.email) {
    logger.warn({ userId: String(user._id) }, 'réinitialisation impossible : compte sans email')
    return { sent: true }
  }

  await enqueue(QUEUES.notifications, {
    template: 'password_reset',
    channel: 'email',
    to: user.email,
    locale: user.locale,
    payload: { token, prenom: user.name }
  })
  return { sent: true }
}

export async function resetPassword({ token, password }) {
  const user = await User.findOne({
    'passwordReset.tokenHash': sha256(token),
    'passwordReset.expiresAt': { $gt: new Date() }
  }).select('+passwordReset.tokenHash')
  if (!user) throw badRequest('Lien de réinitialisation invalide ou expiré').withKey('resetLinkInvalid')

  user.passwordHash = await hashPassword(password)
  user.passwordReset = undefined
  user.tokenVersion += 1
  await user.save()
  return user
}

export async function createStaff(input) {
  const existing = await User.findOne({ email: input.email })
  if (existing) throw conflict('Un compte existe déjà avec cet email').withKey('accountExistsEmail')
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
  if (!user) throw notFound('Compte introuvable').withKey('accountNotFound')
  return user
}

export async function getById(id) {
  const user = await User.findById(id)
  if (!user) throw notFound('Compte introuvable').withKey('accountNotFound')
  return user
}
