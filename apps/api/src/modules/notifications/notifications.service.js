import config from '../../core/config.js'
import logger from '../../core/logger.js'
import { enqueue, QUEUES } from '../../core/queue.js'
import { notFound } from '../../core/errors.js'
import { toE164 } from '../../core/utils/text.js'
import { Notification, NotificationTemplate } from './notifications.model.js'
import { DEFAULT_TEMPLATES, renderTemplate } from './notifications.templates.js'
import { providers } from './notifications.providers.js'

const registrationsService = () => import('../registrations/registrations.service.js')

export async function getTemplate(key) {
  const stored = await NotificationTemplate.findOne({ key, isActive: true })
  if (stored) return stored.toObject()
  const fallback = DEFAULT_TEMPLATES[key]
  if (!fallback) throw notFound(`Modèle de message inconnu : ${key}`)
  return { key, ...fallback }
}

export async function listTemplates() {
  const stored = await NotificationTemplate.find().sort({ key: 1 })
  const storedKeys = new Set(stored.map((t) => t.key))
  const defaults = Object.entries(DEFAULT_TEMPLATES)
    .filter(([key]) => !storedKeys.has(key))
    .map(([key, value]) => ({ key, ...value, isDefault: true }))
  return [...stored.map((t) => ({ ...t.toObject(), isDefault: false })), ...defaults]
}

export async function upsertTemplate(key, input) {
  return NotificationTemplate.findOneAndUpdate(
    { key },
    { ...input, key },
    { new: true, upsert: true, runValidators: true }
  )
}

/**
 * Met un message en file. Le canal et la langue sont choisis ici :
 * langue du candidat, canaux du modèle, numéro normalisé en E.164.
 */
export async function queueMessage({
  template,
  channel,
  channels,
  to,
  locale = config.defaultLocale,
  payload = {},
  editionId,
  registrationId,
  userId,
  delay = 0
}) {
  const definition = await getTemplate(template)
  const targets = channel ? [channel] : channels || definition.channels || ['email']
  const queued = []

  for (const target of targets) {
    const recipient = target === 'whatsapp' ? toE164(to?.whatsapp ?? to) : to?.email ?? to
    if (!recipient) continue

    const notification = await Notification.create({
      editionId,
      registrationId,
      userId,
      channel: target,
      template,
      locale,
      to: recipient,
      payload,
      status: 'queued'
    })

    await enqueue(QUEUES.notifications, { notificationId: String(notification._id) }, { delay })
    queued.push(notification)
  }

  return queued
}

/** Traitement d'une tâche de la file : rend le modèle puis appelle le fournisseur. */
export async function processJob({ notificationId, ...inline }) {
  if (!notificationId) {
    // Message direct (code à usage unique, réinitialisation) : pas de trace préalable.
    const queued = await queueMessage(inline)
    return { queued: queued.length }
  }

  const notification = await Notification.findById(notificationId)
  if (!notification) return { skipped: true }
  if (['sent', 'delivered', 'read'].includes(notification.status)) return { skipped: true }

  const definition = await getTemplate(notification.template)
  const locale = notification.locale || config.defaultLocale
  const variables = notification.payload || {}

  const subject = renderTemplate(
    definition.subject?.[locale] || definition.subject?.fr || '',
    variables
  )
  const body = renderTemplate(definition.body?.[locale] || definition.body?.fr || '', variables)

  notification.status = 'sending'
  notification.attempts += 1
  await notification.save()

  try {
    const provider = providers[notification.channel]
    const result = await provider.send({
      to: notification.to,
      subject,
      body,
      locale,
      metaTemplateName: definition.metaTemplateName,
      variables: definition.metaTemplateName ? templateVariables(variables) : undefined
    })

    notification.status = 'sent'
    notification.sentAt = new Date()
    notification.providerMessageId = result.providerMessageId
    notification.error = undefined
    await notification.save()
    return { sent: true, simulated: Boolean(result.simulated) }
  } catch (error) {
    notification.error = error.message
    notification.status =
      notification.attempts >= config.notifications.maxAttempts ? 'failed' : 'queued'
    await notification.save()
    logger.error(
      { err: error, notificationId, attempts: notification.attempts },
      'envoi de notification échoué'
    )
    throw error
  }
}

/** Ordre des variables attendu par les modèles Meta (paramètres positionnels). */
function templateVariables(payload) {
  return ['prenom', 'edition', 'creneau', 'date', 'lieu', 'frais', 'motif', 'code', 'lien']
    .filter((key) => payload[key] !== undefined)
    .map((key) => String(payload[key]))
}

export async function list(query) {
  const { page = 1, limit = 50, ...rest } = query
  const filter = {}
  for (const [key, value] of Object.entries(rest)) if (value !== undefined) filter[key] = value

  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Notification.countDocuments(filter)
  ])
  return { items, meta: { total, page, limit } }
}

export async function retry(id) {
  const notification = await Notification.findById(id)
  if (!notification) throw notFound('Notification introuvable')
  notification.status = 'queued'
  notification.error = undefined
  await notification.save()
  await enqueue(QUEUES.notifications, { notificationId: String(notification._id) })
  return notification
}

/** Mise à jour depuis les webhooks fournisseurs : distribué, lu, échoué. */
export async function handleWebhook(provider, { providerMessageId, status, error }) {
  const notification = await Notification.findOne({ providerMessageId })
  if (!notification) return { matched: false }

  notification.status = status
  if (status === 'delivered') notification.deliveredAt = new Date()
  if (status === 'read') notification.readAt = new Date()
  if (error) notification.error = error
  await notification.save()
  logger.info({ provider, providerMessageId, status }, 'statut de notification mis à jour')
  return { matched: true }
}

/** Annonce groupée à un segment d'inscrits (édition, rôle, créneau, école). */
export async function broadcast({ editionId, channels, template, segment, payload }, actorId) {
  const { list: listRegistrations } = await registrationsService()
  const { items } = await listRegistrations({ editionId, ...segment, page: 1, limit: 200 })

  let queued = 0
  for (const registration of items) {
    const candidate = registration.candidateId
    const recipients = { email: candidate?.email, whatsapp: candidate?.phone }
    for (const channel of channels) {
      if (!recipients[channel]) continue
      const sent = await queueMessage({
        template,
        channel,
        to: recipients[channel],
        locale: registration.locale || candidate?.locale,
        editionId,
        registrationId: registration._id,
        userId: candidate?._id,
        payload: {
          prenom: registration.player?.firstName,
          sujet: payload.subject?.[registration.locale || 'fr'] || payload.subject?.fr,
          message: payload.body?.[registration.locale || 'fr'] || payload.body?.fr
        }
      })
      queued += sent.length
    }
  }

  logger.info({ editionId, template, queued, by: actorId }, 'annonce mise en file')
  return { queued, recipients: items.length }
}
