import mongoose from 'mongoose'
import { NOTIFICATION_CHANNELS, NOTIFICATION_STATUSES } from '@arene/shared/constants'

const { ObjectId } = mongoose.Schema.Types
const i18n = { fr: { type: String, default: '' }, ar: { type: String, default: '' } }

const notificationSchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', index: true },
    registrationId: { type: ObjectId, ref: 'Registration', index: true },
    userId: { type: ObjectId, ref: 'User' },
    channel: { type: String, enum: NOTIFICATION_CHANNELS, required: true, index: true },
    template: { type: String, required: true, index: true },
    locale: { type: String, default: 'fr' },
    to: { type: String, required: true },
    payload: mongoose.Schema.Types.Mixed,
    status: { type: String, enum: NOTIFICATION_STATUSES, default: 'queued', index: true },
    attempts: { type: Number, default: 0 },
    providerMessageId: { type: String, index: true },
    error: String,
    sentAt: Date,
    deliveredAt: Date,
    readAt: Date
  },
  { timestamps: true }
)

notificationSchema.index({ status: 1, createdAt: -1 })

notificationSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const Notification =
  mongoose.models.Notification || mongoose.model('Notification', notificationSchema)

/** Modèles de messages éditables par l'admin, en français et en arabe. */
const templateSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    channels: { type: [String], enum: NOTIFICATION_CHANNELS, default: ['email'] },
    subject: { type: i18n, default: () => ({}) },
    body: { type: i18n, required: true },
    /** Nom du modèle pré-approuvé côté Meta, obligatoire pour WhatsApp. */
    metaTemplateName: String,
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
)

export const NotificationTemplate =
  mongoose.models.NotificationTemplate ||
  mongoose.model('NotificationTemplate', templateSchema)

export default Notification
