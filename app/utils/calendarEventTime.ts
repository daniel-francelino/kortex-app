import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'
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

/** A Date whose *local* getters (getFullYear/getMonth/getDate/getHours/...) read
 * as the wall-clock time in `timeZone` — the convention every calendar view
 * relies on for grid positioning/comparisons, regardless of the viewer's own
 * system timezone. `date-fns-tz`'s toZonedTime does exactly this. */
export function getZonedDate(dateInput: string | Date, timeZone: string): Date {
  return toZonedTime(dateInput, timeZone)
}

export function getZonedDateParts(dateInput: string | Date, timeZone: string): ZonedDateParts {
  const zoned = getZonedDate(dateInput, timeZone)
  return {
    year: zoned.getFullYear(),
    month: zoned.getMonth() + 1,
    day: zoned.getDate(),
    hour: zoned.getHours(),
    minute: zoned.getMinutes(),
    second: zoned.getSeconds()
  }
}

export function formatZonedDateKey(dateInput: string | Date, timeZone: string): string {
  return formatInTimeZone(dateInput, timeZone, 'yyyy-MM-dd')
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

/** Inverse of getZonedDate: given wall-clock date/time strings meant as local
 * time in `timeZone`, returns the equivalent UTC instant as an ISO string —
 * what every create/update/drag-drop payload sends the API. */
export function zonedDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const wallClock = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0)
  return fromZonedTime(wallClock, timeZone).toISOString()
}
