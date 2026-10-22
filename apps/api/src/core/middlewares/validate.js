import { ZodError } from 'zod'
import { unprocessable } from '../errors.js'

/**
 * Détail par champ. On transporte le code Zod et ses bornes pour que le front
 * puisse formuler le message dans la langue du visiteur : les messages de Zod
 * sont en anglais, et ils n'ont rien à faire sur un écran public.
 */
const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message,
    ...(issue.minimum !== undefined ? { minimum: Number(issue.minimum) } : {}),
    ...(issue.maximum !== undefined ? { maximum: Number(issue.maximum) } : {}),
    ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
    ...(issue.received !== undefined ? { received: issue.received } : {}),
    ...(issue.type !== undefined ? { type: issue.type } : {}),
    ...(issue.validation !== undefined ? { validation: issue.validation } : {})
  }))

/**
 * Valide body / query / params avec les schémas partagés et remplace
 * la valeur brute par la valeur typée (coercion des dates et des nombres).
 */
export function validate({ body, query, params }) {
  return (req, _res, next) => {
    try {
      if (params) req.params = params.parse(req.params)
      if (query) req.validatedQuery = query.parse(req.query)
      if (body) req.body = body.parse(req.body ?? {})
      return next()
    } catch (error) {
      if (error instanceof ZodError) {
        return next(unprocessable('Données invalides', formatIssues(error)).withKey('invalidData'))
      }
      return next(error)
    }
  }
}

export const validateBody = (schema) => validate({ body: schema })
export const validateQuery = (schema) => validate({ query: schema })
