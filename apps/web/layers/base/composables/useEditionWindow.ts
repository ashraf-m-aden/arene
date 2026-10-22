/**
 * État d'ouverture d'une édition, calculé exactement comme l'API.
 *
 * Deux conditions doivent tenir ensemble : le statut vaut `registration_open` ET
 * la date du jour tombe dans la fenêtre d'inscription. Plusieurs écrans ne
 * testaient que le statut, ce qui proposait le formulaire alors que l'API le
 * refusait — le candidat cliquait, remplissait, et se faisait jeter.
 *
 * On préfère le virtuel `isRegistrationOpen` renvoyé par l'API ; à défaut, on
 * recalcule depuis les trois mêmes champs pour ne jamais rester sans réponse.
 */
export type EditionWindow = 'open' | 'soon' | 'closed' | 'none'

export function editionWindowState(edition: any): EditionWindow {
  if (!edition) return 'none'

  if (typeof edition.isRegistrationOpen === 'boolean' && edition.isRegistrationOpen) return 'open'

  const opensAt = edition.registrationOpensAt ? new Date(edition.registrationOpensAt) : null
  const closesAt = edition.registrationClosesAt ? new Date(edition.registrationClosesAt) : null
  const now = new Date()

  if (edition.status === 'registration_open') {
    if (opensAt && now < opensAt) return 'soon'
    if (closesAt && now > closesAt) return 'closed'
    return 'open'
  }

  // Avant l'ouverture du statut, l'édition est à venir ; après, c'est fini.
  if (edition.status === 'draft' || edition.status === 'announced') return 'soon'
  return 'closed'
}

/** Raccourci pour les écrans qui n'ont besoin que du oui/non. */
export function useEditionWindow(edition: Ref<any> | ComputedRef<any>) {
  const state = computed(() => editionWindowState(edition.value))
  return {
    state,
    isOpen: computed(() => state.value === 'open'),
    isSoon: computed(() => state.value === 'soon'),
    isClosed: computed(() => state.value === 'closed')
  }
}
