import { formatInTimeZone } from 'date-fns-tz'
import type { CalendarEvent } from '~/types/appointments'
import { detectBrowserTimeZone, formatZonedDateKey, getZonedDate, getZonedDateParts, zonedDateTimeToUtcIso } from '#shared/utils/dateTime'

// getZonedDate/getZonedDateParts/formatZonedDateKey/zonedDateTimeToUtcIso now
// live in shared/utils/dateTime.ts (usable from server/ too) — re-exported
// here so existing call sites importing them from this file keep working.
export { formatZonedDateKey, getZonedDate, getZonedDateParts, zonedDateTimeToUtcIso }

export function getEventTimeZone(event?: Pick<CalendarEvent, 'eventTimezone'> | null): string {
  return event?.eventTimezone || detectBrowserTimeZone() || 'UTC'
}

export function formatEventTime(event: CalendarEvent, field: 'startAt' | 'endAt' = 'startAt'): string {
  return formatInTimeZone(event[field], getEventTimeZone(event), 'HH:mm')
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
