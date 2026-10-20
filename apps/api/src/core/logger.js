import pino from 'pino'
import config from './config.js'

export const logger = pino({
  level: process.env.LOG_LEVEL || (config.isTest ? 'silent' : 'info'),
  base: { service: 'arene-api' },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.passwordHash',
      '*.passwordHash'
    ],
    remove: true
  },
  transport:
    config.isProd || config.isTest
      ? undefined
      : { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
})

export default logger
