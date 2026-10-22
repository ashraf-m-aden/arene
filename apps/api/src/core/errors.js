/**
 * Erreur métier transportant un code stable, lisible par le front.
 *
 * `message` reste en français : il sert aux journaux et de repli. `key` désigne une
 * entrée de `apiError.*` dans les locales du front, qui l'affiche dans la langue du
 * visiteur. Un code HTTP couvre plusieurs situations (un 401 vaut aussi bien pour de
 * mauvais identifiants que pour un code expiré), d'où une clé distincte du code.
 */
export class AppError extends Error {
  constructor(message, { status = 400, code = 'bad_request', details, key } = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
    this.key = key
  }

  /** `unauthorized('Identifiants incorrects').withKey('badCredentials')` */
  withKey(key) {
    this.key = key
    return this
  }
}

export const badRequest = (message, details) =>
  new AppError(message, { status: 400, code: 'bad_request', details })

export const unauthorized = (message = 'Authentification requise') =>
  new AppError(message, { status: 401, code: 'unauthorized' })

export const forbidden = (message = 'Accès refusé') =>
  new AppError(message, { status: 403, code: 'forbidden' })

export const notFound = (message = 'Ressource introuvable') =>
  new AppError(message, { status: 404, code: 'not_found' })

export const conflict = (message, details) =>
  new AppError(message, { status: 409, code: 'conflict', details })

export const unprocessable = (message, details) =>
  new AppError(message, { status: 422, code: 'unprocessable', details })

export const tooMany = (message = 'Trop de tentatives, réessayez plus tard') =>
  new AppError(message, { status: 429, code: 'too_many_requests' })
