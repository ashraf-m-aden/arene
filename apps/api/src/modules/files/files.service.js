import crypto from 'node:crypto'
import { MAX_BULLETIN_SIZE } from '@gm/shared/constants'
import { badRequest, forbidden, notFound } from '../../core/errors.js'
import storage from '../../core/storage.js'
import logger from '../../core/logger.js'
import { FileDoc } from './files.model.js'

/** Signatures réelles acceptées : on ne fait jamais confiance à l'extension. */
const SIGNATURES = [
  { mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString('latin1') === '%PDF-' },
  { mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  {
    mime: 'image/png',
    test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  },
  {
    mime: 'image/webp',
    test: (b) =>
      b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'
  },
  {
    mime: 'image/heic',
    test: (b) => b.subarray(4, 8).toString('latin1') === 'ftyp' && /heic|heif|mif1/.test(b.subarray(8, 12).toString('latin1'))
  }
]

const KIND_RULES = {
  bulletin: { mimes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxSize: MAX_BULLETIN_SIZE, visibility: 'private' },
  photo: { mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'], maxSize: 8 * 1024 * 1024, visibility: 'private' },
  media: { mimes: ['image/jpeg', 'image/png', 'image/webp'], maxSize: 15 * 1024 * 1024, visibility: 'public' }
}

export function detectMime(buffer) {
  return SIGNATURES.find((s) => s.test(buffer))?.mime || null
}

let sharpLib
async function getSharp() {
  if (sharpLib !== undefined) return sharpLib
  try {
    sharpLib = (await import('sharp')).default
  } catch {
    logger.warn('sharp absent : les images sont stockées telles quelles')
    sharpLib = null
  }
  return sharpLib
}

const VARIANTS = [
  { name: 'thumb', width: 400 },
  { name: 'medium', width: 1000 },
  { name: 'large', width: 1800 }
]

/**
 * Déclinaisons WebP pour les médias publics, métadonnées EXIF supprimées
 * (la position GPS d'une photo d'enfant ne doit jamais sortir).
 */
async function buildVariants(buffer, baseKey, visibility) {
  const sharp = await getSharp()
  if (!sharp) return []
  const made = []
  for (const variant of VARIANTS) {
    try {
      const pipeline = sharp(buffer, { failOn: 'none' })
      const meta = await pipeline.metadata()
      if (meta.width && meta.width < variant.width && variant.name !== 'thumb') continue
      const output = await pipeline
        .rotate()
        .resize({ width: variant.width, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer({ resolveWithObject: true })
      const key = `${baseKey}.${variant.name}.webp`
      await storage.put({ key, body: output.data, visibility, mime: 'image/webp' })
      made.push({
        name: variant.name,
        storageKey: key,
        mime: 'image/webp',
        width: output.info.width,
        height: output.info.height,
        size: output.info.size
      })
    } catch (error) {
      logger.warn({ err: error, variant: variant.name }, 'déclinaison d’image ignorée')
    }
  }
  return made
}

export async function upload({ buffer, originalName, kind, owner, editionId }) {
  const rules = KIND_RULES[kind]
  if (!rules) throw badRequest('Type de fichier inconnu')
  if (!buffer?.length) throw badRequest('Fichier vide')
  if (buffer.length > rules.maxSize) {
    throw badRequest(`Fichier trop volumineux (max ${Math.round(rules.maxSize / 1024 / 1024)} Mo)`)
  }

  const mime = detectMime(buffer)
  if (!mime || !rules.mimes.includes(mime)) {
    throw badRequest('Format refusé : PDF ou image uniquement')
  }

  const visibility = rules.visibility
  const key = storage.randomKey(kind, originalName)
  await storage.put({ key, body: buffer, visibility, mime })

  const isImage = mime.startsWith('image/')
  const variants = isImage ? await buildVariants(buffer, key, visibility) : []

  return FileDoc.create({
    owner,
    kind,
    storageKey: key,
    mime,
    size: buffer.length,
    originalName: originalName?.slice(0, 180),
    visibility,
    variants,
    editionId,
    checksum: crypto.createHash('sha256').update(buffer).digest('hex')
  })
}

/** Lien signé de courte durée, généré après contrôle des droits. */
export async function signedUrlFor(fileId, user, { variant } = {}) {
  const file = await FileDoc.findById(fileId)
  if (!file) throw notFound('Fichier introuvable')
  await assertCanRead(file, user)

  const target =
    (variant && file.variants.find((v) => v.name === variant)?.storageKey) || file.storageKey
  const url =
    file.visibility === 'public'
      ? await storage.publicUrl(target)
      : await storage.signedUrl(target, file.visibility)
  return { url, mime: file.mime, expiresIn: file.visibility === 'public' ? null : 300 }
}

export async function assertCanRead(file, user) {
  if (file.visibility === 'public') return
  if (!user) throw forbidden('Document privé')
  if (user.role === 'admin' || user.role === 'staff') return
  if (String(file.owner) === String(user.id)) return
  throw forbidden('Document privé')
}

export async function readBuffer(fileId, user) {
  const file = await FileDoc.findById(fileId)
  if (!file) throw notFound('Fichier introuvable')
  await assertCanRead(file, user)
  return { file, buffer: await storage.get(file.storageKey, file.visibility) }
}

export async function remove(fileId) {
  const file = await FileDoc.findById(fileId)
  if (!file) return
  const keys = [file.storageKey, ...file.variants.map((v) => v.storageKey)]
  await Promise.all(keys.map((key) => storage.remove(key, file.visibility).catch(() => null)))
  await file.deleteOne()
}

/** Purge de fin d'édition : bulletins et photos d'identité effacés. */
export async function purgeEdition(editionId) {
  const files = await FileDoc.find({ editionId, kind: { $in: ['bulletin', 'photo'] } })
  for (const file of files) await remove(file._id)
  return { purged: files.length }
}
