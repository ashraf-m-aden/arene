/**
 * Accès aux pièces d'un dossier (bulletin, portrait).
 *
 * Deux façons de lire une pièce privée, pour deux besoins :
 *
 * - `linkFor` rend un lien signé de courte durée, bon pour ouvrir un bulletin
 *   dans un onglet.
 * - `blobFor` rapatrie les octets par l'API. C'est ce qu'il faut pour afficher
 *   une image dans la page : le jeton voyage dans l'en-tête `Authorization`,
 *   qu'une balise `img` ne sait pas poser, et les octets se gardent en mémoire
 *   pour un écran qui doit tenir hors ligne.
 */
export function useFiles() {
  const { $api } = useNuxtApp()

  const blobFor = (fileId: string, variant?: 'thumb' | 'medium' | 'large') =>
    $api.raw<Blob>(`/files/${fileId}/content${variant ? `?variant=${variant}` : ''}`, {
      method: 'GET',
      responseType: 'blob'
    })

  const linkFor = async (fileId: string) => {
    const { data } = await $api.get<{ data: { url: string } }>(`/files/${fileId}/url`)
    return data.url
  }

  /** Lien local affichable dans la page. À révoquer par l'appelant. */
  const objectUrlFor = async (fileId: string, variant?: 'thumb' | 'medium' | 'large') =>
    URL.createObjectURL(await blobFor(fileId, variant))

  return { blobFor, linkFor, objectUrlFor }
}
