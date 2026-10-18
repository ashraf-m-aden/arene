import config from '../../core/config.js'
import logger from '../../core/logger.js'

/**
 * Fournisseurs d'envoi. Sans identifiants configurés, les messages sont
 * seulement journalisés : le développement et les tests ne contactent personne.
 */
let sesClient
async function getSes() {
  if (sesClient !== undefined) return sesClient
  try {
    const { SESv2Client } = await import('@aws-sdk/client-ses')
    sesClient = new SESv2Client({ region: config.notifications.sesRegion })
  } catch {
    sesClient = null
  }
  return sesClient
}

export const emailProvider = {
  name: 'ses',
  async send({ to, subject, body, locale }) {
    const client = await getSes()
    if (!client) {
      logger.info({ to, subject, channel: 'email' }, 'email simulé (SES non configuré)')
      return { providerMessageId: `sim-${Date.now()}`, simulated: true }
    }

    const { SendEmailCommand } = await import('@aws-sdk/client-ses')
    const html = toHtml(body, locale)
    const result = await client.send(
      new SendEmailCommand({
        FromEmailAddress: config.notifications.sesFrom,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Text: { Data: body, Charset: 'UTF-8' },
              Html: { Data: html, Charset: 'UTF-8' }
            }
          }
        }
      })
    )
    return { providerMessageId: result.MessageId }
  }
}

/** Gabarit HTML simple, compatible avec les clients mail, version texte incluse. */
function toHtml(body, locale = 'fr') {
  const dir = locale === 'ar' ? 'rtl' : 'ltr'
  const paragraphs = String(body)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;line-height:1.6">${escapeHtml(p)}</p>`)
    .join('')

  return `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#f5f3ee;padding:24px;font-family:Helvetica,Arial,sans-serif;color:#1b2430">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden">
<tr><td style="background:#0b1b2b;padding:20px 24px;color:#c9992a;font-size:18px;letter-spacing:.08em">GÉNÉRATION MÉRITE</td></tr>
<tr><td style="padding:24px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:16px 24px;background:#f5f3ee;font-size:12px;color:#6b7280">${
    locale === 'ar' ? 'بطولة المبارزات الفردية — جيبوتي' : 'Tournoi de duels 1v1 — Djibouti'
  }</td></tr>
</table></td></tr></table></body></html>`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * WhatsApp Cloud API de Meta, en direct.
 * Les messages à l'initiative de la plateforme passent par un modèle pré-approuvé.
 */
export const whatsappProvider = {
  name: 'whatsapp',
  async send({ to, body, metaTemplateName, locale, variables }) {
    const { whatsappToken, whatsappPhoneId } = config.notifications
    if (!whatsappToken || !whatsappPhoneId) {
      logger.info({ to, channel: 'whatsapp', metaTemplateName }, 'WhatsApp simulé (non configuré)')
      return { providerMessageId: `sim-${Date.now()}`, simulated: true }
    }

    const payload = metaTemplateName
      ? {
          messaging_product: 'whatsapp',
          to,
          type: 'template',
          template: {
            name: metaTemplateName,
            language: { code: locale === 'ar' ? 'ar' : 'fr' },
            components: variables?.length
              ? [{ type: 'body', parameters: variables.map((text) => ({ type: 'text', text })) }]
              : undefined
          }
        }
      : { messaging_product: 'whatsapp', to, type: 'text', text: { body } }

    const response = await fetch(
      `https://graph.facebook.com/v21.0/${whatsappPhoneId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${whatsappToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    )

    const json = await response.json().catch(() => ({}))
    if (!response.ok) {
      throw new Error(json?.error?.message || `WhatsApp a répondu ${response.status}`)
    }
    return { providerMessageId: json?.messages?.[0]?.id }
  }
}

export const providers = { email: emailProvider, whatsapp: whatsappProvider }
