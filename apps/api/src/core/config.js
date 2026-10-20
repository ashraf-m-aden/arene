import { config as loadEnv } from 'dotenv'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '../../../..')

loadEnv({ path: path.join(repoRoot, '.env') })
loadEnv({ path: path.join(repoRoot, 'apps/api/.env'), override: true })

const bool = (value, fallback = false) =>
  value === undefined ? fallback : ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase())

export const config = {
  env: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  port: Number(process.env.API_PORT || 4000),
  apiPrefix: '/api/v1',

  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/arene',
  redisUrl: process.env.REDIS_URL || '',

  jwt: {
    accessSecret: process.env.JWT_SECRET || 'dev-access-secret',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    accessTtl: process.env.ACCESS_TOKEN_TTL || '15m',
    refreshTtl: process.env.REFRESH_TOKEN_TTL || '30d'
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || 'local',
    localDir: process.env.STORAGE_LOCAL_DIR || path.join(repoRoot, 'apps/api/storage'),
    publicBucket: process.env.S3_BUCKET_PUBLIC || '',
    privateBucket: process.env.S3_BUCKET_PRIVATE || '',
    region: process.env.S3_REGION || 'eu-west-3',
    cdnUrl: process.env.CDN_PUBLIC_URL || '',
    signedUrlTtl: Number(process.env.SIGNED_URL_TTL || 300)
  },

  notifications: {
    sesRegion: process.env.SES_REGION || 'eu-west-3',
    sesFrom: process.env.SES_FROM || "L'Arène <no-reply@dj-arene.com>",
    whatsappToken: process.env.WHATSAPP_TOKEN || '',
    whatsappPhoneId: process.env.WHATSAPP_PHONE_ID || '',
    maxAttempts: Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 5)
  },

  publicSiteUrl: process.env.PUBLIC_SITE_URL || 'http://localhost:3000',
  // URL publique de l'API elle-même, utilisée pour les liens de fichiers servis en local.
  apiPublicUrl: process.env.API_PUBLIC_URL || `http://localhost:${Number(process.env.API_PORT || 4000)}`,
  defaultLocale: process.env.DEFAULT_LOCALE || 'fr',
  corsOrigins: (process.env.CORS_ORIGINS || process.env.PUBLIC_SITE_URL || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  trustProxy: bool(process.env.TRUST_PROXY, true),
  seedPassword: process.env.SEED_PASSWORD || 'Merite2026!'
}

export default config
