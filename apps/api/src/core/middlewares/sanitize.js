/**
 * Neutralise l'injection d'opérateurs Mongo : toute clé commençant par `$`
 * ou contenant un point est retirée des entrées HTTP, avant validation Zod.
 *
 * On assainit la requête plutôt que les filtres Mongoose : l'option globale
 * `sanitizeFilter` transformerait aussi les opérateurs légitimes que les
 * services construisent eux-mêmes (`$in`, `$ne`, `$gt`) en égalités.
 */
const isDangerousKey = (key) => key.startsWith('$') || key.includes('.')

/** @returns true si la valeur a été vidée par l'assainissement et doit disparaître. */
function scrub(value, depth = 0) {
  if (depth > 8 || value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) {
    for (const item of value) scrub(item, depth + 1)
    return false
  }

  let removed = 0
  for (const key of Object.keys(value)) {
    if (isDangerousKey(key)) {
      delete value[key]
      removed += 1
    } else if (scrub(value[key], depth + 1)) {
      // `status[$ne]=draft` devient un objet vide : on retire le filtre entier
      // plutôt que de laisser passer une valeur que la validation rejetterait.
      delete value[key]
      removed += 1
    }
  }
  return removed > 0 && Object.keys(value).length === 0
}

export function sanitizeRequest(req, _res, next) {
  scrub(req.body)
  scrub(req.params)
  // req.query est un accesseur sur Express 5 : on modifie l'objet en place.
  if (req.query && typeof req.query === 'object') scrub(req.query)
  next()
}

export default sanitizeRequest
