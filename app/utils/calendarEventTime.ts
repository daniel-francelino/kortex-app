import type { CalendarEvent } from '~/types/appointments'

interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

export function getEventTimeZone(event?: Pick<CalendarEvent, 'eventTimezone'> | null): string {
  return event?.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function getZonedDateParts(dateInput: string | Date, timeZone: string): ZonedDateParts {
  const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  })

  const parts = formatter.formatToParts(date)
  const map = Object.fromEntries(parts.map(part => [part.type, part.value]))

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  }
}

export function getZonedDate(dateInput: string | Date, timeZone: string): Date {
  const parts = getZonedDateParts(dateInput, timeZone)
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
}

export function formatZonedDateKey(dateInput: string | Date, timeZone: string): string {
  const parts = getZonedDateParts(dateInput, timeZone)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

export function formatEventTime(event: CalendarEvent, field: 'startAt' | 'endAt' = 'startAt'): string {
  return new Date(event[field]).toLocaleTimeString('pt-BR', {
    timeZone: getEventTimeZone(event),
    hour: '2-digit',
    minute: '2-digit'
  })
}

export function formatEventDate(event: CalendarEvent, field: 'startAt' | 'endAt' = 'startAt'): string {
  return formatZonedDateKey(event[field], getEventTimeZone(event))
}

/** Orders a day's events the way the day/week views already lay them out:
 * all-day items (the journal marker included) first — they have no time
 * of their own, so they read as the day's "header" items — then timed
 * events chronologically. */
export function sortDayEvents(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    if (a.allDay && b.allDay) return 0
    const timeA = getZonedDate(a.startAt, getEventTimeZone(a)).getTime()
    const timeB = getZonedDate(b.startAt, getEventTimeZone(b)).getTime()
    return timeA - timeB
  })
}

export function zonedDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const utcGuess = Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0)
  const parts = getZonedDateParts(new Date(utcGuess), timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  const offset = asUtc - utcGuess

  return new Date(utcGuess - offset).toISOString()
}
