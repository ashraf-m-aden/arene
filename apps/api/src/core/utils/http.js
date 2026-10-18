/** Enrobe un contrôleur async pour que les rejets partent au middleware d'erreurs. */
export const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve(handler(req, res, next)).catch(next)

export const ok = (res, data, meta) => res.json(meta ? { data, meta } : { data })
export const created = (res, data) => res.status(201).json({ data })
export const noContent = (res) => res.status(204).end()
