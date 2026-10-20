import { badRequest, notFound } from '../../core/errors.js'
import bus from '../../core/events.js'
import { Gallery } from './galleries.model.js'

const registrationsService = () => import('../registrations/registrations.service.js')
const filesService = () => import('../files/files.service.js')

/**
 * Un joueur n'est identifiable dans une galerie que si son dossier porte
 * le consentement au droit à l'image. Sinon le service refuse l'identification.
 */
async function assertImageRights(featuredRegIds = []) {
  if (!featuredRegIds.length) return []
  const { imageRightsByIds } = await registrationsService()
  const consents = await imageRightsByIds(featuredRegIds)

  const refused = featuredRegIds.filter((id) => !consents.get(String(id))?.imageRights)
  if (refused.length) {
    throw badRequest('Identification refusée : consentement au droit à l’image manquant', {
      registrationIds: refused.map(String)
    })
  }
  return featuredRegIds
}

/**
 * Les médias publics sortent avec leur URL de CDN résolue : les pages sont
 * rendues côté serveur et les images doivent être dans le HTML initial.
 */
async function withUrls(gallery) {
  const files = await filesService()
  const json = gallery.toJSON ? gallery.toJSON() : gallery

  const resolve = async (fileId) => {
    if (!fileId) return null
    try {
      const { url } = await files.signedUrlFor(fileId, null, { variant: 'medium' })
      return url
    } catch {
      return null
    }
  }

  json.coverUrl = await resolve(json.coverFileId)
  json.items = await Promise.all(
    (json.items || []).map(async (item) => ({
      ...item,
      url: item.type === 'photo' ? await resolve(item.fileId) : null,
      thumbUrl:
        item.type === 'youtube'
          ? `https://i.ytimg.com/vi/${item.youtubeId}/hqdefault.jpg`
          : await resolve(item.fileId)
    }))
  )
  json.counts = {
    photos: json.items.filter((item) => item.type === 'photo').length,
    videos: json.items.filter((item) => item.type === 'youtube').length
  }
  return json
}

export async function listForEdition(editionId, { publishedOnly = true } = {}) {
  const filter = { editionId }
  if (publishedOnly) filter.isPublished = true
  const galleries = await Gallery.find(filter).sort({ publishedAt: -1, createdAt: -1 })
  return Promise.all(galleries.map((gallery) => withUrls(gallery)))
}

export async function getBySlug(slug, { publishedOnly = true } = {}) {
  const gallery = await Gallery.findOne({ slug }).populate(
    'items.featuredRegIds',
    'player.firstName player.lastName role'
  )
  if (!gallery || (publishedOnly && !gallery.isPublished)) throw notFound('Galerie introuvable')
  return withUrls(gallery)
}

export async function getById(id) {
  const gallery = await Gallery.findById(id)
  if (!gallery) throw notFound('Galerie introuvable')
  return gallery
}

export async function create(input) {
  return Gallery.create(input)
}

export async function update(id, patch) {
  const gallery = await Gallery.findByIdAndUpdate(id, patch, { new: true, runValidators: true })
  if (!gallery) throw notFound('Galerie introuvable')
  return gallery
}

export async function addItems(id, items) {
  const gallery = await getById(id)
  let order = gallery.items.length

  for (const item of items) {
    await assertImageRights(item.featuredRegIds)
    gallery.items.push({ ...item, order: order++ })
  }
  await gallery.save()
  return gallery
}

export async function reorder(id, order) {
  const gallery = await getById(id)
  const positions = new Map(order.map((o) => [String(o.itemId), o.order]))
  gallery.items.forEach((item) => {
    const position = positions.get(String(item._id))
    if (position !== undefined) item.order = position
  })
  gallery.items.sort((a, b) => a.order - b.order)
  await gallery.save()
  return gallery
}

export async function removeItem(id, itemId) {
  const gallery = await getById(id)
  const item = gallery.items.id(itemId)
  if (!item) throw notFound('Élément introuvable')
  if (item.fileId) {
    const files = await filesService()
    await files.remove(item.fileId).catch(() => null)
  }
  item.deleteOne()
  await gallery.save()
  return gallery
}

export async function publish(id, isPublished = true) {
  const gallery = await getById(id)
  gallery.isPublished = isPublished
  gallery.publishedAt = isPublished ? new Date() : null
  await gallery.save()
  if (isPublished) {
    bus.emitEvent('gallery.published', {
      galleryId: String(gallery._id),
      editionId: String(gallery.editionId)
    })
  }
  return gallery
}

/** Retire un joueur de toutes les galeries (suppression de données demandée par le candidat). */
export async function removeIdentification(registrationId) {
  const result = await Gallery.updateMany(
    { 'items.featuredRegIds': registrationId },
    { $pull: { 'items.$[].featuredRegIds': registrationId } }
  )
  return result.modifiedCount ?? 0
}
