import mongoose from 'mongoose'
import { LOCALES, USER_ROLES } from '@arene/shared/constants'

const userSchema = new mongoose.Schema(
  {
    /**
     * Nom complet, en un seul champ. Saisi a la creation du compte et jamais
     * modifie ensuite : c'est l'identite du compte permanent, reprise telle quelle
     * d'une edition a l'autre.
     */
    name: { type: String, required: true, trim: true },
    /**
     * Seul canal de la plateforme, et donc obligatoire à l'inscription —
     * `registerSchema` l'exige. Volontairement pas `required` ici : les comptes
     * créés avant cette règle n'en ont pas, et le marquer obligatoire ferait
     * échouer toute sauvegarde de ces documents, connexion comprise.
     */
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, default: 'candidate', index: true },
    locale: { type: String, enum: LOCALES, default: 'fr' },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    passwordReset: {
      tokenHash: { type: String, select: false },
      expiresAt: Date
    }
  },
  { timestamps: true }
)

userSchema.index(
  { email: 1 },
  { unique: true, partialFilterExpression: { email: { $type: 'string' } } }
)
userSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
)

userSchema.virtual('fullName').get(function fullName() {
  return String(this.name || '').trim()
})

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.passwordHash
    delete ret.passwordReset
    delete ret.__v
    return ret
  }
})

export const User = mongoose.models.User || mongoose.model('User', userSchema)
export default User
