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

/* ─── Suppression définitive d'un compte ─── */

const registrationsService = () => import('../registrations/registrations.service.js')
const resultsService = () => import('../results/results.service.js')
const slotsService = () => import('../slots/slots.service.js')
const notificationsService = () => import('../notifications/notifications.service.js')
const editionsService = () => import('../editions/editions.service.js')
const filesService = () => import('../files/files.service.js')

/**
 * Recherche de comptes pour l'écran d'administration — tous rôles confondus.
 *
 * `listStaff` ne montre que l'organisation ; supprimer le compte d'un candidat
 * suppose de pouvoir le retrouver, et il n'y a pas d'écran qui les liste. La
 * recherche porte sur le nom, l'email et le téléphone, et le motif est échappé :
 * un nom contenant un point ne doit pas se mettre à filtrer n'importe quoi.
 */
export async function searchUsers({ q, role, limit = 25 } = {}) {
  const filter = {}
  if (role) filter.role = role
  if (q) {
    const safe = String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = new RegExp(safe, 'i')
    filter.$or = [{ name: pattern }, { email: pattern }, { phone: pattern }]
  }
  return User.find(filter).sort({ createdAt: -1 }).limit(limit)
}

/**
 * Nombre d'actes qu'un compte a posés sur le dossier d'autrui : vérifications,
 * encaissements, contrats signés, pointages, scores saisis, transitions
 * d'édition, mises en liste de suppression.
 *
 * C'est le compteur qui décide qu'un compte n'est pas supprimable. Un dossier
 * garde dans son historique qui l'a accepté et qui a encaissé ses frais ;
 * effacer ce compte laisserait ces lignes pointer un fantôme, et l'historique
 * d'un dossier est précisément ce qui permet de répondre « qui a validé ça ? »
 * des mois plus tard. Pour retirer l'accès d'un membre de l'organisation, il y a
 * la désactivation, qui préserve la trace.
 */
async function countStaffActs(userId) {
  const [registrations, results, slots, editions, notifications] = await Promise.all([
    registrationsService(),
    resultsService(),
    slotsService(),
    editionsService(),
    notificationsService()
  ])

  const counts = await Promise.all([
    registrations.countActsBy(userId),
    results.countEnteredBy(userId),
    slots.countCheckinOperationsByStaff(userId),
    editions.countHistoryBy(userId),
    notifications.countSuppressionsBy(userId)
  ])
  return counts.reduce((sum, count) => sum + count, 0)
}

/**
 * Ce que la suppression d'un compte emporterait, et ce qui s'y oppose.
 *
 * Les blocages se lisent en deux familles. Les `hard` ne se forcent pas : se
 * supprimer soi-même, retirer le dernier administrateur, effacer un compte qui
 * porte l'histoire des dossiers d'autrui. Les autres viennent des dossiers du
 * compte et se lèvent avec `force`, comme pour une suppression de dossier.
 */
export async function userDeletionImpact(id, actor) {
  const user = await getById(id)
  const [registrations, notifications, files] = await Promise.all([
    registrationsService(),
    notificationsService(),
    filesService()
  ])

  const own = await registrations.listMine(user._id)
  const perRegistration = []
  for (const registration of own) {
    const preview = await registrations.deletionImpact(registration._id)
    perRegistration.push({
      id: preview.registration.id,
      reference: preview.registration.reference,
      status: preview.registration.status,
      blockers: preview.blockers,
      impact: preview.impact
    })
  }

  const [messages, ownedFiles, staffActs, activeAdmins] = await Promise.all([
    notifications.countForUser(user._id),
    files.countOwnedBy(user._id),
    countStaffActs(user._id),
    User.countDocuments({ role: 'admin', isActive: true })
  ])

  const hard = []
  if (actor?.id && String(actor.id) === String(user._id)) {
    hard.push({ code: 'cannotDeleteSelf' })
  }
  if (user.role === 'admin' && user.isActive && activeAdmins <= 1) {
    hard.push({ code: 'lastActiveAdmin' })
  }
  if (staffActs > 0) {
    hard.push({ code: 'accountHasHistory', detail: { acts: staffActs } })
  }

  const blockers = perRegistration.flatMap((row) =>
    row.blockers.map((blocker) => ({ ...blocker, registration: row.reference }))
  )

  return {
    user: {
      id: user._id,
      name: user.name,
      email: user.email ?? null,
      phone: user.phone ?? null,
      role: user.role,
      isActive: user.isActive
    },
    impact: {
      registrations: perRegistration.length,
      messages,
      files: ownedFiles,
      staffActs
    },
    registrations: perRegistration,
    hard,
    blockers,
    /*
     * L'email est la reference a retaper : c'est ce qui identifie un compte sans
     * ambiguite, la ou deux candidats peuvent porter le meme nom. Repli sur le
     * telephone, puis sur le nom, pour les comptes anciens sans adresse.
     */
    confirm: user.email || user.phone || user.name
  }
}

/**
 * Efface un compte, ses dossiers et ses fichiers. Irréversible, et réservé à
 * l'administrateur.
 *
 * Note sur l'accès : le compte parti, le renouvellement de session échoue
 * aussitôt (`refresh` relit le compte en base), mais le jeton d'accès déjà
 * délivré reste valable jusqu'à son expiration — un quart d'heure par défaut,
 * `ACCESS_TOKEN_TTL`. Les jetons ne sont pas vérifiés en base à chaque requête,
 * et ce n'est pas cette fonctionnalité qui va changer ce choix.
 */
export async function destroyUser(id, actor, { reason, confirm, force = false }) {
  const preview = await userDeletionImpact(id, actor)

  if (String(confirm).trim().toLowerCase() !== String(preview.confirm).trim().toLowerCase()) {
    throw badRequest(
      `La confirmation attendue est « ${preview.confirm} »`
    ).withKey('deletionConfirmMismatch')
  }

  // Les blocages structurels ne se forcent pas : `force` ne les regarde meme pas.
  if (preview.hard.length) {
    throw conflict('Ce compte ne peut pas être supprimé', { blockers: preview.hard }).withKey(
      preview.hard[0].code
    )
  }

  if (preview.blockers.length && !force) {
    throw conflict('Les dossiers de ce compte s’opposent à la suppression', {
      blockers: preview.blockers
    }).withKey(preview.blockers[0].code)
  }

  const user = await getById(id)
  const [registrations, notifications, files] = await Promise.all([
    registrationsService(),
    notificationsService(),
    filesService()
  ])

  /*
   * Les dossiers d'abord, chacun par le meme chemin qu'une suppression unitaire
   * — fichiers, rencontres, messages, galeries, cache de classement. La
   * confirmation est deja faite au niveau du compte : on repasse celle que
   * chaque dossier attend.
   */
  for (const row of preview.registrations) {
    await registrations.destroy(row.id, actor, {
      reason,
      confirm: row.reference,
      force: true
    })
  }

  await notifications.deleteForUser(user._id)
  await files.removeOwnedBy(user._id)
  await user.deleteOne()

  logger.warn(
    { userId: String(id), actorId: actor?.id, forced: force, impact: preview.impact },
    'compte supprimé définitivement'
  )

  return { deleted: true, ...preview, forced: Boolean(force), reason }
}
