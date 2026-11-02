/** Au-delà, on réencode même une image déjà petite en pixels : elle voyage mal. */
const SAFE_SIZE = 2 * 1024 * 1024

/**
 * Réduit une image avant l'envoi.
 *
 * Tant que le portrait se prenait obligatoirement à la caméra, les fichiers
 * reçus étaient des clichés compressés d'un ou deux mégaoctets. Depuis qu'il
 * peut se choisir dans la galerie du téléphone, un capteur récent en produit
 * couramment huit à douze — au-delà de la limite du serveur (8 Mo pour un
 * portrait), et bien au-delà de ce qu'une connexion mobile envoie sans peine.
 * Sans cette réduction, ouvrir la galerie n'aurait fait que remplacer une gêne
 * par un refus.
 *
 * Le portrait n'a pas besoin de cette finesse : le serveur en tire de toute
 * façon des déclinaisons de 400, 1000 et 1800 pixels de large, et c'est une
 * version d'écran que le staff regarde au scan du badge.
 *
 * Deux effets de bord utiles. Le réencodage passe par un canvas, qui ne recopie
 * pas les métadonnées EXIF : la position GPS du cliché ne quitte pas le
 * téléphone, sans dépendre du nettoyage que le serveur fait quand `sharp` est
 * installé. Et `imageOrientation: 'from-image'` applique l'orientation EXIF
 * avant de dessiner, sans quoi un portrait pris à la verticale arriverait
 * couché.
 */
export function useImageDownscale() {
  /**
   * Rend le fichier d'origine dès que le navigateur ne sait pas décoder
   * l'image — un HEIC d'iPhone hors de Safari, typiquement. Le serveur accepte
   * le HEIC : mieux vaut un envoi lourd qu'un refus.
   */
  const downscale = async (
    file: File,
    { maxSide = 1800, quality = 0.85 } = {}
  ): Promise<File> => {
    if (!import.meta.client || !file.type.startsWith('image/')) return file

    let bitmap: ImageBitmap | null = null
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
      const ratio = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))

      // Déjà aux bonnes dimensions et assez légère : ne pas dégrader pour rien.
      if (ratio === 1 && file.size <= SAFE_SIZE) return file

      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * ratio)
      canvas.height = Math.round(bitmap.height * ratio)
      const context = canvas.getContext('2d')
      if (!context) return file
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/jpeg', quality)
      )
      // Un réencodage qui alourdit le fichier n'a rien gagné.
      if (!blob || blob.size >= file.size) return file

      const name = file.name.replace(/\.[^.]+$/, '') || 'photo'
      return new File([blob], `${name}.jpg`, { type: 'image/jpeg' })
    } catch {
      return file
    } finally {
      bitmap?.close()
    }
  }

  return { downscale }
}
