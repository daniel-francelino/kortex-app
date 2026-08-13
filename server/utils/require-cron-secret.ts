import type { H3Event } from 'h3'

/**
 * Shared guard for endpoints meant to be called by the external CRON API
 * (not by any client in this app). Expects a `x-cron-secret` header matching
 * `runtimeConfig.cronSecret` (env `CRON_SECRET`).
 *
 * If `CRON_SECRET` is not set, the check is skipped entirely — keep it unset
 * only in local development, never in production.
 */
export function requireCronSecret(event: H3Event) {
  const config = useRuntimeConfig()
  const cronSecret = config.cronSecret

  if (!cronSecret)
    return

  const headerSecret = getHeader(event, 'x-cron-secret')
  if (headerSecret !== cronSecret) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }
}
