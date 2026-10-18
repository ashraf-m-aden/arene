import mongoose from 'mongoose'
import logger from '../logger.js'

/** Journal d'audit des accès staff aux dossiers (qui a consulté quel bulletin, quand). */
const auditSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    actorRole: String,
    action: { type: String, required: true, index: true },
    target: { kind: String, id: String },
    ip: String,
    meta: mongoose.Schema.Types.Mixed
  },
  { timestamps: { createdAt: true, updatedAt: false } }
)

auditSchema.index({ createdAt: -1 })

export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditSchema)

export async function recordAudit(req, action, target, meta) {
  try {
    await AuditLog.create({
      actorId: req.user?.id,
      actorRole: req.user?.role,
      action,
      target,
      ip: req.ip,
      meta
    })
  } catch (error) {
    logger.warn({ err: error, action }, 'audit non enregistré')
  }
}

/** Middleware prêt à poser sur une route sensible. */
export const audit = (action, targetFrom = (req) => ({ kind: 'registration', id: req.params.id })) =>
  (req, _res, next) => {
    recordAudit(req, action, targetFrom(req))
    next()
  }
