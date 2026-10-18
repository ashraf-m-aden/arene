import mongoose from 'mongoose'

const { ObjectId } = mongoose.Schema.Types

const i18n = { fr: { type: String, default: '' }, ar: { type: String, default: '' } }

const itemSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['photo', 'youtube'], required: true },
    fileId: { type: ObjectId, ref: 'File' },
    /** Les vidéos restent sur YouTube : on ne stocke que l'identifiant. */
    youtubeId: String,
    caption: { type: i18n, default: () => ({}) },
    featuredRegIds: [{ type: ObjectId, ref: 'Registration' }],
    durationSeconds: Number,
    order: { type: Number, default: 0 }
  },
  { _id: true }
)

const gallerySchema = new mongoose.Schema(
  {
    editionId: { type: ObjectId, ref: 'Edition', required: true, index: true },
    slug: { type: String, required: true, lowercase: true, trim: true },
    title: { type: i18n, required: true },
    description: { type: i18n, default: () => ({}) },
    coverFileId: { type: ObjectId, ref: 'File' },
    items: { type: [itemSchema], default: [] },
    isPublished: { type: Boolean, default: false, index: true },
    publishedAt: Date
  },
  { timestamps: true }
)

gallerySchema.index({ editionId: 1, slug: 1 }, { unique: true })

gallerySchema.set('toJSON', {
  transform(_doc, ret) {
    delete ret.__v
    return ret
  }
})

export const Gallery = mongoose.models.Gallery || mongoose.model('Gallery', gallerySchema)
export default Gallery
