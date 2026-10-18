/** Erreur métier transportant un code stable, lisible par le front. */
export class AppError extends Error {
  constructor(message, { status = 400, code = 'bad_request', details } = {}) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
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
