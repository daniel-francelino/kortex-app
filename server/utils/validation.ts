import type { z } from 'zod'

/**
 * `schema.parse(data)`, but a validation failure becomes a proper H3 400
 * response instead of an uncaught `ZodError` — which Nitro turns into a
 * generic 500 (nothing in `server/` maps `ZodError` to a status code
 * globally). Use this everywhere a request body/query is validated instead
 * of calling `.parse()` directly.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)

  if (!result.success) {
    throw createError({
      statusCode: 400,
      statusMessage: result.error.issues[0]?.message ?? 'Dados inválidos',
      data: result.error.issues
    })
  }

  return result.data
}
