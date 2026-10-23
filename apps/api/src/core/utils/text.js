const DIACRITICS = /[̀-ͯ]/g

/** Marque d'ordre des octets : Excel en a besoin pour lire les accents d'un CSV. */
export const BOM = String.fromCharCode(0xfeff)

/** Slug ASCII stable, sans accents, utilisable dans une URL. */
export function slugify(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-zA-Z0-9\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 70)
}

/** Clé de dédoublonnage : même nom, même date de naissance, même école. */
export function dedupeKey({ name, birthDate, schoolId }) {
  const norm = (v) =>
    String(v || '')
      .normalize('NFD')
      .replace(DIACRITICS, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()
  const day = birthDate ? new Date(birthDate).toISOString().slice(0, 10) : ''
  return [norm(name), day, String(schoolId || '')].join('|')
}

// La normalisation des numéros vit dans `@arene/shared` : le schéma Zod partagé
// l'applique avant de valider. Réexportée ici pour les appelants de l'API.
export { toE164 } from '@arene/shared'

/** Sérialisation CSV minimale, sans dépendance. Le BOM garde les accents dans Excel. */
export function toCsv(rows, columns) {
  const header = columns.map((c) => c.label ?? c.key)
  const escape = (value) => {
    if (value === null || value === undefined) return ''
    const str = value instanceof Date ? value.toISOString() : String(value)
    return /[",;\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
  }
  const lines = [header.join(';')]
  for (const row of rows) {
    lines.push(
      columns.map((c) => escape(typeof c.get === 'function' ? c.get(row) : row[c.key])).join(';')
    )
  }
  return BOM + lines.join('\r\n')
}

/** Choisit la langue disponible d'un texte bilingue. */
export const pickLocale = (text, locale = 'fr') =>
  (text && (text[locale] || text.fr || text.ar)) || ''
