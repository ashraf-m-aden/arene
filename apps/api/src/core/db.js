import mongoose from 'mongoose'
import config from './config.js'
import logger from './logger.js'

mongoose.set('strictQuery', true)

export async function connectDb(uri = config.mongoUri) {
  if (mongoose.connection.readyState === 1) return mongoose.connection
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000, autoIndex: !config.isProd })
  logger.info({ uri: uri.replace(/\/\/[^@]*@/, '//***@') }, 'MongoDB connecté')
  return mongoose.connection
}

export async function disconnectDb() {
  if (mongoose.connection.readyState === 0) return
  await mongoose.disconnect()
}

export { mongoose }
