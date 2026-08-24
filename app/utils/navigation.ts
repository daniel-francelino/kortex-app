/**
 * Routes that live under a different top-level path than the nav item they
 * conceptually belong to — e.g. scheduling pages/bookings are part of the
 * "Agenda" module but don't sit under /app/appointments, so a plain
 * `startsWith` match never highlights it.
 */
const NAV_PATH_ALIASES: Record<string, string[]> = {
  '/app/appointments': ['/app/scheduling']
}

export function isNavPathActive(currentPath: string, to?: string, exact?: boolean): boolean {
  if (!to) return false
  if (exact || to === '/app') return currentPath === to
  if (currentPath.startsWith(to)) return true
  return (NAV_PATH_ALIASES[to] ?? []).some(alias => currentPath.startsWith(alias))
}
