import config from '../../core/config.js'
import logger from '../../core/logger.js'
import { enqueue, QUEUES } from '../../core/queue.js'
import { badRequest, notFound } from '../../core/errors.js'
import { toE164 } from '../../core/utils/text.js'
import { Notification, NotificationTemplate, Suppression } from './notifications.model.js'
import { DEFAULT_TEMPLATES, renderTemplate } from './notifications.templates.js'
import { providers } from './notifications.providers.js'
import { confirmSubscription, readSesEvent, verifyEnvelope } from './notifications.sns.js'

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

    // Adresse supprimée : on garde une trace visible pour l'organisation, mais
    // on n'envoie rien. Insister sur un rebond définitif abîme la réputation.
    const blocked = await isSuppressed(target, recipient)
    if (blocked) {
      const skipped = await Notification.create({
        editionId,
        registrationId,
        userId,
        channel: target,
        template,
        locale,
        to: recipient,
        payload,
        status: 'failed',
        error: `adresse supprimée (${blocked.reason}) : aucun envoi`
      })
      logger.warn(
        { channel: target, template, reason: blocked.reason },
        'envoi annulé : destinataire supprimé'
      )
      queued.push(skipped)
      continue
    }

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

/* ─── Liste de suppression ─── */

/** Le destinataire est-il sur la liste ? Renvoie l'entrée, ou null. */
export async function isSuppressed(channel, address) {
  if (!address) return null
  return Suppression.findOne({ channel, address: String(address).toLowerCase().trim() }).lean()
}

/** Ajoute (ou met à jour) une entrée. Idempotent : rejouer un évènement ne casse rien. */
export async function suppress({ channel, address, reason, detail, notificationId, suppressedBy }) {
  if (!address) return null
  const entry = await Suppression.findOneAndUpdate(
    { channel, address: String(address).toLowerCase().trim() },
    { channel, address: String(address).toLowerCase().trim(), reason, detail, notificationId, suppressedBy },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  )
  logger.warn({ channel, reason, detail }, 'destinataire ajouté à la liste de suppression')
  return entry
}

export async function listSuppressions({ channel, page = 1, limit = 50 } = {}) {
  const filter = channel ? { channel } : {}
  const [items, total] = await Promise.all([
    Suppression.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Suppression.countDocuments(filter)
  ])
  return { items, meta: { page, limit, total } }
}

/** Réhabilite un destinataire : à n'utiliser qu'après vérification humaine. */
export async function unsuppress(id) {
  const removed = await Suppression.findByIdAndDelete(id)
  if (!removed) throw notFound('Entrée de suppression introuvable')
  logger.info({ channel: removed.channel, reason: removed.reason }, 'destinataire réhabilité')
  return removed
}

/* ─── Évènements SES relayés par SNS ─── */

/**
 * Point d'entrée du webhook SES. Vérifie la signature SNS, confirme l'abonnement
 * si c'est ce qui est demandé, puis applique l'évènement : statut du message et,
 * pour un rebond définitif ou une plainte, suppression du destinataire.
 */
export async function handleSnsEvent(envelope) {
  await verifyEnvelope(envelope)

  if (envelope.Type === 'SubscriptionConfirmation') return confirmSubscription(envelope)
  if (envelope.Type !== 'Notification') return { ignored: envelope.Type }

  let message
  try {
    message = JSON.parse(envelope.Message)
  } catch {
    throw badRequest('Message SNS illisible')
  }

  const event = readSesEvent(message)
  if (!event) return { ignored: 'évènement non reconnu' }

  const notification = event.providerMessageId
    ? await Notification.findOne({ providerMessageId: event.providerMessageId })
    : null

  if (notification && event.status) {
    notification.status = event.status
    if (event.status === 'delivered') notification.deliveredAt = new Date()
    if (event.error) notification.error = event.error
    await notification.save()
  }

  const suppressed = []
  for (const target of event.suppress) {
    await suppress({
      channel: 'email',
      address: target.address,
      reason: target.reason,
      detail: target.detail,
      notificationId: notification?._id
    })
    suppressed.push(target.address)
  }

  logger.info(
    { type: event.type, matched: Boolean(notification), suppressed: suppressed.length },
    'évènement SES traité'
  )
  return { type: event.type, matched: Boolean(notification), suppressed: suppressed.length }
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
