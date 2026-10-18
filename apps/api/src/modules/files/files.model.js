import mongoose from 'mongoose'
import { FILE_KINDS, FILE_VISIBILITIES } from '@gm/shared/constants'

const variantSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // thumb | medium | large
    storageKey: { type: String, required: true },
    mime: String,
    width: Number,
    height: Number,
    size: Number
  },
  { _id: false }
)

const fileSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    kind: { type: String, enum: FILE_KINDS, required: true },
    storageKey: { type: String, required: true },
    mime: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: String,
    visibility: { type: String, enum: FILE_VISIBILITIES, default: 'private' },
    variants: { type: [variantSchema], default: [] },
    checksum: String,
    editionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Edition', index: true }
  },
  { timestamps: true }
)

fileSchema.index({ owner: 1, kind: 1 })

fileSchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    // La clé de stockage ne sort jamais de l'API : seul un lien signé est exposé.
    delete ret.storageKey
    if (Array.isArray(ret.variants)) ret.variants.forEach((v) => delete v.storageKey)
    return ret
  }
})

export const FileDoc = mongoose.models.File || mongoose.model('File', fileSchema)
export default FileDoc
