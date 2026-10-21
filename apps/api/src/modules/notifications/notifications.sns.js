import crypto from 'node:crypto'
import https from 'node:https'
import config from '../../core/config.js'
import logger from '../../core/logger.js'
import { badRequest, forbidden } from '../../core/errors.js'

/**
 * Enveloppes Amazon SNS : vérification de signature puis lecture de l'évènement SES.
 *
 * Ce point d'entrée peut rendre une adresse injoignable, donc il n'est jamais cru sur
 * parole : la signature est vérifiée contre le certificat AWS, et le topic doit
 * correspondre à celui configuré. Sans cette double vérification, n'importe qui
 * pourrait faire taire nos notifications en déclarant des plaintes.
 */

/** Champs signés, dans l'ordre imposé par SNS. */
const SIGNED_FIELDS = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: [
    'Message',
    'MessageId',
    'SubscribeURL',
    'Timestamp',
    'Token',
    'TopicArn',
    'Type'
  ]
}
SIGNED_FIELDS.UnsubscribeConfirmation = SIGNED_FIELDS.SubscriptionConfirmation

const CERT_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/
const certCache = new Map()

function fetchText(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: 5000 }, (response) => {
      if (response.statusCode !== 200) {
        response.resume()
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => (body += chunk))
      response.on('end', () => resolve(body))
    })
    request.on('timeout', () => request.destroy(new Error('délai dépassé')))
    request.on('error', reject)
  })
}

/** Le certificat de signature, mis en cache : SNS en change rarement. */
async function signingCertificate(certUrl) {
  let parsed
  try {
    parsed = new URL(certUrl)
  } catch {
    throw badRequest('SigningCertURL invalide')
  }
  if (parsed.protocol !== 'https:' || !CERT_HOST.test(parsed.hostname)) {
    throw forbidden('SigningCertURL hors du domaine SNS')
  }
  if (certCache.has(parsed.href)) return certCache.get(parsed.href)

  const pem = await fetchText(parsed.href)
  certCache.set(parsed.href, pem)
  return pem
}

function canonicalString(envelope) {
  const fields = SIGNED_FIELDS[envelope.Type]
  if (!fields) throw badRequest(`Type SNS inattendu : ${envelope.Type}`)
  let canonical = ''
  for (const field of fields) {
    const value = envelope[field]
    // Subject est absent la plupart du temps : il sort alors de la chaîne signée.
    if (value === undefined || value === null) continue
    canonical += `${field}\n${value}\n`
  }
  return canonical
}

/** Vérifie la signature et le topic. Lève si quoi que ce soit ne colle pas. */
export async function verifyEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') throw badRequest('Enveloppe SNS absente')

  const expectedTopic = config.notifications.snsTopicArn
  if (expectedTopic && envelope.TopicArn !== expectedTopic) {
    throw forbidden('TopicArn inattendu')
  }
  if (!expectedTopic) {
    logger.warn('SNS_TOPIC_ARN absent : le topic ne peut pas être contrôlé')
  }

  const algorithm = String(envelope.SignatureVersion) === '2' ? 'RSA-SHA256' : 'RSA-SHA1'
  const certificate = await signingCertificate(envelope.SigningCertURL)
  const verifier = crypto.createVerify(algorithm)
  verifier.update(canonicalString(envelope), 'utf8')

  if (!verifier.verify(certificate, String(envelope.Signature || ''), 'base64')) {
    throw forbidden('Signature SNS invalide')
  }
  return true
}

/** Confirmation d'abonnement : SNS attend qu'on appelle l'URL qu'il fournit. */
export async function confirmSubscription(envelope) {
  const url = new URL(envelope.SubscribeURL)
  if (url.protocol !== 'https:' || !CERT_HOST.test(url.hostname)) {
    throw forbidden('SubscribeURL hors du domaine SNS')
  }
  await fetchText(url.href)
  logger.info({ topicArn: envelope.TopicArn }, 'abonnement SNS confirmé')
  return { confirmed: true }
}

/**
 * Normalise un évènement SES en une décision simple : quel statut poser sur le
 * message, et quelles adresses ne plus jamais contacter.
 *
 * Un rebond `Permanent` et toute plainte suppriment l'adresse. Un rebond `Transient`
 * (boîte pleine, serveur indisponible) marque l'échec sans supprimer : l'adresse
 * redeviendra peut-être valide.
 */
export function readSesEvent(message) {
  const type = message?.eventType || message?.notificationType
  if (!type) return null

  const providerMessageId = message?.mail?.messageId
  const addressesOf = (list) =>
    (list || []).map((entry) => entry?.emailAddress).filter(Boolean)

  switch (type) {
    case 'Delivery':
      return { type, providerMessageId, status: 'delivered', suppress: [] }

    case 'Bounce': {
      const permanent = message.bounce?.bounceType === 'Permanent'
      return {
        type,
        providerMessageId,
        status: 'failed',
        error: `rebond ${message.bounce?.bounceType || 'inconnu'} (${
          message.bounce?.bounceSubType || '-'
        })`,
        suppress: permanent
          ? addressesOf(message.bounce?.bouncedRecipients).map((address) => ({
              address,
              reason: 'bounce',
              detail: message.bounce?.bounceSubType
            }))
          : []
      }
    }

    case 'Complaint':
      return {
        type,
        providerMessageId,
        status: 'failed',
        error: `plainte (${message.complaint?.complaintFeedbackType || 'non précisée'})`,
        suppress: addressesOf(message.complaint?.complainedRecipients).map((address) => ({
          address,
          reason: 'complaint',
          detail: message.complaint?.complaintFeedbackType
        }))
      }

    case 'Reject':
      return {
        type,
        providerMessageId,
        status: 'failed',
        error: `rejeté par SES (${message.reject?.reason || 'non précisé'})`,
        suppress: []
      }

    // Send, Open, Click, DeliveryDelay : rien à décider.
    default:
      return { type, providerMessageId, status: null, suppress: [] }
  }
}

export default { verifyEnvelope, confirmSubscription, readSesEvent }
