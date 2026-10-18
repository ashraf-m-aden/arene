import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import config from './config.js'
import logger from './logger.js'

/**
 * Stockage objet : pilote local (développement) ou S3 (production).
 * Les bulletins et photos d'identité vont dans le bucket privé et ne sont
 * servis que par des liens signés de courte durée.
 */
const PUBLIC = 'public'
const PRIVATE = 'private'

function randomKey(prefix, originalName) {
  const ext = path.extname(originalName || '').toLowerCase().slice(0, 10)
  return `${prefix}/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}${ext}`
}

const localDriver = {
  name: 'local',
  async put({ key, body, visibility }) {
    const target = path.join(config.storage.localDir, visibility, key)
    await fs.mkdir(path.dirname(target), { recursive: true })
    await fs.writeFile(target, body)
    return { key }
  },
  async get(key, visibility) {
    return fs.readFile(path.join(config.storage.localDir, visibility, key))
  },
  async remove(key, visibility) {
    await fs.rm(path.join(config.storage.localDir, visibility, key), { force: true })
  },
  async signedUrl(key, visibility) {
    // En local, l'API sert le fichier elle-même après contrôle des droits.
    return `${config.apiPublicUrl}${config.apiPrefix}/files/${visibility}/${encodeURIComponent(key)}`
  },
  publicUrl(key) {
    return config.storage.cdnUrl
      ? `${config.storage.cdnUrl.replace(/\/$/, '')}/${key}`
      : `${config.apiPublicUrl}${config.apiPrefix}/files/public/${encodeURIComponent(key)}`
  }
}

let s3Driver = null

async function getS3Driver() {
  if (s3Driver) return s3Driver
  let S3, presigner
  try {
    S3 = await import('@aws-sdk/client-s3')
    presigner = await import('@aws-sdk/s3-request-presigner')
  } catch {
    logger.warn('@aws-sdk/client-s3 absent : repli sur le stockage local')
    return localDriver
  }

  const client = new S3.S3Client({ region: config.storage.region })
  const bucketFor = (visibility) =>
    visibility === PUBLIC ? config.storage.publicBucket : config.storage.privateBucket

  s3Driver = {
    name: 's3',
    async put({ key, body, visibility, mime }) {
      await client.send(
        new S3.PutObjectCommand({
          Bucket: bucketFor(visibility),
          Key: key,
          Body: body,
          ContentType: mime,
          ServerSideEncryption: 'AES256'
        })
      )
      return { key }
    },
    async get(key, visibility) {
      const res = await client.send(
        new S3.GetObjectCommand({ Bucket: bucketFor(visibility), Key: key })
      )
      return Buffer.from(await res.Body.transformToByteArray())
    },
    async remove(key, visibility) {
      await client.send(new S3.DeleteObjectCommand({ Bucket: bucketFor(visibility), Key: key }))
    },
    async signedUrl(key, visibility) {
      return presigner.getSignedUrl(
        client,
        new S3.GetObjectCommand({ Bucket: bucketFor(visibility), Key: key }),
        { expiresIn: config.storage.signedUrlTtl }
      )
    },
    publicUrl(key) {
      return config.storage.cdnUrl
        ? `${config.storage.cdnUrl.replace(/\/$/, '')}/${key}`
        : `https://${config.storage.publicBucket}.s3.${config.storage.region}.amazonaws.com/${key}`
    }
  }
  return s3Driver
}

async function driver() {
  return config.storage.driver === 's3' ? getS3Driver() : localDriver
}

export const storage = {
  PUBLIC,
  PRIVATE,
  randomKey,
  async put(options) {
    return (await driver()).put(options)
  },
  async get(key, visibility = PRIVATE) {
    return (await driver()).get(key, visibility)
  },
  async remove(key, visibility = PRIVATE) {
    return (await driver()).remove(key, visibility)
  },
  async signedUrl(key, visibility = PRIVATE) {
    return (await driver()).signedUrl(key, visibility)
  },
  async publicUrl(key) {
    return (await driver()).publicUrl(key)
  }
}

export default storage
