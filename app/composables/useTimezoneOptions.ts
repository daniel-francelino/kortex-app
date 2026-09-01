import { detectBrowserTimeZone } from '#shared/utils/dateTime'

const FALLBACK_TIMEZONES = ['UTC', 'America/Fortaleza', 'America/Sao_Paulo', 'America/New_York', 'Europe/London']

export interface TimezoneOption {
  label: string
  value: string
}

/**
 * Builds the timezone picker's option list, ordered per
 * docs/timezone/ANALISE_TIMEZONE.md seção 7:
 *   1. the browser's own detected zone (what Regra 1 uses for display anyway)
 *   2. the currently saved fallback, if different
 *   3. every other zone the user has used before, most-used first
 *   4. the rest of the IANA list, alphabetically
 *
 * Shared between the Settings "Regional" picker and the Scheduling page's
 * own timezone field (docs/timezone/ANALISE_TIMEZONE.md, seção 5) so both
 * stop maintaining their own copy of this list/logic.
 */
export function useTimezoneOptions(currentTimezone: Ref<string>) {
  const browserTimezone = computed(() => detectBrowserTimeZone() ?? 'UTC')

  const { state: preferencesState } = useUserPreferences()

  const options = computed<TimezoneOption[]>(() => {
    const allZones = typeof Intl.supportedValuesOf === 'function'
      ? Intl.supportedValuesOf('timeZone')
      : FALLBACK_TIMEZONES

    const seen = new Set<string>()
    const ordered: string[] = []

    function push(tz: string | undefined | null) {
      if (!tz || seen.has(tz)) return
      seen.add(tz)
      ordered.push(tz)
    }

    push(browserTimezone.value)
    push(currentTimezone.value)

    const usage = preferencesState.value.timezoneUsage ?? {}
    const usedZones = Object.keys(usage)
      .filter(tz => !seen.has(tz) && allZones.includes(tz))
      .sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0))
    for (const tz of usedZones) push(tz)

    const rest = allZones.filter(tz => !seen.has(tz)).sort((a, b) => a.localeCompare(b))
    for (const tz of rest) push(tz)

    return ordered.map(tz => ({ label: tz, value: tz }))
  })

  return { browserTimezone, options }
}
