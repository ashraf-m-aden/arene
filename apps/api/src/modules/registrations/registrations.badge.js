import PDFDocument from 'pdfkit'
import QRCode from 'qrcode'
import { CURRENCY } from '@gm/shared/constants'

const INK = '#0b1b2b'
const GOLD = '#c9992a'

/**
 * Badge de convocation : QR du jeton, numéro de dossier, créneau et frais à prévoir.
 * Le QR ne contient aucune donnée personnelle, seulement un jeton non devinable.
 */
export async function buildBadgePdf({ registration, edition, slot }) {
  const qrPng = await QRCode.toBuffer(registration.qrToken, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320
  })

  const doc = new PDFDocument({ size: 'A5', margin: 32 })
  const chunks = []
  doc.on('data', (chunk) => chunks.push(chunk))
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))))

  const width = doc.page.width - 64

  doc.rect(0, 0, doc.page.width, 86).fill(INK)
  doc.fillColor(GOLD).fontSize(20).text('GÉNÉRATION MÉRITE', 32, 28, { width })
  doc.fillColor('#ffffff').fontSize(11).text(edition?.title?.fr || 'Tournoi de duels 1v1', 32, 54, {
    width
  })

  doc.fillColor(INK).fontSize(22).text(registration.playerName || '—', 32, 110, { width })
  doc.fontSize(11).fillColor('#444444')
  doc.text(
    [
      registration.role === 'striker' ? 'Buteur' : 'Défenseur',
      registration.ageCategory === 'lycee' ? 'Lycée' : 'Université',
      registration.schoolId?.name?.fr || ''
    ]
      .filter(Boolean)
      .join('  ·  '),
    { width }
  )

  doc.moveDown(1)
  doc.fillColor(INK).fontSize(12).text('Convocation', { width })
  doc.fontSize(11).fillColor('#444444')
  doc.text(`Créneau : ${slot?.label || 'à confirmer'}`)
  if (slot?.startsAt) {
    doc.text(
      `Date : ${new Date(slot.startsAt).toLocaleString('fr-FR', {
        dateStyle: 'full',
        timeStyle: 'short'
      })}`
    )
  }
  doc.text(`Lieu : ${slot?.venue || edition?.venue?.name || 'Djibouti'}`)
  doc.text(`Frais à régler en espèces à l'accueil : ${edition?.fee ?? 0} ${CURRENCY}`)
  doc.text('À présenter : ce badge, une pièce d’identité et le bulletin original.')

  const qrSize = 150
  doc.image(qrPng, doc.page.width - qrSize - 32, doc.page.height - qrSize - 72, {
    width: qrSize
  })
  doc
    .fillColor(INK)
    .fontSize(10)
    .text(
      `Dossier n° ${String(registration._id).slice(-6).toUpperCase()}`,
      32,
      doc.page.height - 96,
      { width: 200 }
    )
  if (registration.bibNumber) {
    doc.fontSize(26).fillColor(GOLD).text(`#${registration.bibNumber}`, 32, doc.page.height - 80)
  }

  doc.end()
  return done
}

export default buildBadgePdf
