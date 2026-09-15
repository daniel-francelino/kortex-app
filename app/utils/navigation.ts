/**
 * Routes that live under a different top-level path than the nav item they
 * conceptually belong to, so a plain `startsWith` match never highlights it.
 * Empty for now — scheduling pages/bookings moved under /app/appointments,
 * so they're covered by the plain `startsWith` check below.
 */
const NAV_PATH_ALIASES: Record<string, string[]> = {}

export function isNavPathActive(currentPath: string, to?: string, exact?: boolean): boolean {
  if (!to) return false
  if (exact || to === '/app') return currentPath === to
  if (currentPath.startsWith(to)) return true
  return (NAV_PATH_ALIASES[to] ?? []).some(alias => currentPath.startsWith(alias))
}
