import { ZodError } from 'zod'
import { unprocessable } from '../errors.js'

const formatIssues = (error) =>
  error.issues.map((issue) => ({
    path: issue.path.join('.'),
    code: issue.code,
    message: issue.message
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
        return next(unprocessable('Données invalides', formatIssues(error)))
      }
      return next(error)
    }
  }
}

export const validateBody = (schema) => validate({ body: schema })
export const validateQuery = (schema) => validate({ query: schema })
