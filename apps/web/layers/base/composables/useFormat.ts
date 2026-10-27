/** Mise en forme partagée : textes bilingues, dates, montants, statuts. */
export function useFormat() {
  const { locale, t, te } = useI18n()

  /** Texte stocké en double langue dans le document : on prend la langue dispo. */
  const text = (value?: { fr?: string; ar?: string } | string | null) => {
    if (!value) return ''
    if (typeof value === 'string') return value
    return value[locale.value as 'fr' | 'ar'] || value.fr || value.ar || ''
  }

  const date = (value?: string | Date | null, withTime = false) => {
    if (!value) return ''
    return new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-DJ' : 'fr-FR', {
      dateStyle: 'long',
      ...(withTime ? { timeStyle: 'short' } : {}),
      calendar: 'gregory',
      numberingSystem: 'latn'
    }).format(new Date(value))
  }

  const dayMonth = (value?: string | Date | null) => {
    if (!value) return ''
    return new Intl.DateTimeFormat(locale.value === 'ar' ? 'ar-DJ' : 'fr-FR', {
      day: 'numeric',
      month: 'short',
      calendar: 'gregory',
      numberingSystem: 'latn'
    }).format(new Date(value))
  }

  const money = (value?: number | null) =>
    new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(value ?? 0) + ' DJF'

  const number = (value?: number | null) =>
    new Intl.NumberFormat('fr-FR').format(value ?? 0)

  /** Jours restants avant une date, pour les comptes à rebours d'inscription. */
  const daysUntil = (value?: string | Date | null) => {
    if (!value) return 0
    return Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86400000))
  }

  const statusLabel = (status?: string) => (status ? t(`status.${status}`) : '')

  const statusTone = (status?: string) => {
    if (!status) return ''
    if (['approved', 'scheduled', 'checked_in', 'qualified', 'finalist'].includes(status)) {
      return 'badge--pitch'
    }
    if (['rejected', 'disqualified', 'no_show'].includes(status)) return 'badge--danger'
    if (['submitted', 'under_review', 'changes_requested', 'draft'].includes(status)) {
      return 'badge--warning'
    }
    return ''
  }

  const roleLabel = (role?: string) => (role ? t(`role.${role}`) : '')
  const categoryLabel = (category?: string) => (category ? t(`category.${category}`) : '')

  /**
   * Signalement d'un contrôle automatique, en clair.
   *
   * Les codes (`age_out_of_range`, `grade_below_threshold`…) viennent des règles
   * partagées et s'affichaient tels quels, jusque dans l'espace du candidat. Le
   * `detail` du signalement porte les nombres qui rendent la phrase utile : âge
   * constaté et tranche attendue, moyenne et seuil.
   *
   * Un code sans traduction retombe sur une phrase neutre plutôt que de laisser
   * sortir son nom technique — c'est précisément ce qu'on corrige ici.
   */
  const flagLabel = (flag?: { code?: string; detail?: Record<string, unknown> } | null) => {
    if (!flag?.code) return ''
    const key = `flag.${flag.code}`
    return te(key) ? t(key, { ...(flag.detail || {}) }) : t('flag.unknown')
  }

  return {
    text,
    date,
    dayMonth,
    money,
    number,
    daysUntil,
    statusLabel,
    statusTone,
    roleLabel,
    categoryLabel,
    flagLabel
  }
}
