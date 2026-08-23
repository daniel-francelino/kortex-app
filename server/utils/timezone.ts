/**
 * Timezone helpers shared across the server — originally lived only inside
 * habit-event-sync.ts (habits materializing calendar events from a
 * scheduled_time + IANA timezone), extracted here so the scheduling-page
 * availability calculation can reuse the exact same wall-clock <-> UTC math
 * instead of a third hand-rolled copy.
 */

export function getTimeZoneParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })

  const parts = formatter.formatToParts(date)
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]))
  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    weekday: weekdayMap[map.weekday ?? 'Sun'] ?? 0,
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

export function getTimeZoneOffsetMilliseconds(date: Date, timeZone: string): number {
  const parts = getTimeZoneParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - date.getTime()
}

export function zonedDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)

  const utcGuess = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0)
  const offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone)

  return new Date(utcGuess - offset).toISOString()
}
