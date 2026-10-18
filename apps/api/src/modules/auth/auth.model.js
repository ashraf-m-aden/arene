import mongoose from 'mongoose'
import { LOCALES, USER_ROLES } from '@gm/shared/constants'

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, select: false },
    role: { type: String, enum: USER_ROLES, default: 'parent', index: true },
    locale: { type: String, enum: LOCALES, default: 'fr' },
    acceptsWhatsapp: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    tokenVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
    otp: {
      codeHash: { type: String, select: false },
      expiresAt: Date,
      attempts: { type: Number, default: 0 }
    },
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
  return `${this.firstName} ${this.lastName}`.trim()
})

userSchema.set('toJSON', {
  virtuals: true,
  transform(_doc, ret) {
    delete ret.passwordHash
    delete ret.otp
    delete ret.passwordReset
    delete ret.__v
    return ret
  }
})

export const User = mongoose.models.User || mongoose.model('User', userSchema)
export default User
