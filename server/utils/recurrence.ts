/**
 * Simple RRULE expansion utility for MVP.
 * Supports: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, COUNT, UNTIL, BYDAY
 * Generates occurrence start dates within a given range.
 */
import { fromZonedTime, toZonedTime } from 'date-fns-tz'

interface ParsedRRule {
  freq: 'DAILY' | 'WEEKLY' | 'MONTHLY'
  interval: number
  count?: number
  until?: Date
  byday?: string[]
}

const DAY_MAP: Record<string, number> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6
}

export function parseRRule(rrule: string): ParsedRRule {
  const parts = rrule.split(';')
  const result: ParsedRRule = {
    freq: 'DAILY',
    interval: 1
  }

  for (const part of parts) {
    const [key, value] = part.split('=')
    if (!key || !value) continue

    switch (key) {
      case 'FREQ':
        result.freq = value as ParsedRRule['freq']
        break
      case 'INTERVAL':
        result.interval = parseInt(value, 10)
        break
      case 'COUNT':
        result.count = parseInt(value, 10)
        break
      case 'UNTIL':
        result.until = parseRRuleDate(value)
        break
      case 'BYDAY':
        result.byday = value.split(',')
        break
    }
  }

  return result
}

/**
 * Formats a UTC instant as an iCalendar UNTIL value (`YYYYMMDDTHHMMSSZ`) —
 * the counterpart of `parseRRuleDate`'s full-datetime branch.
 */
export function formatRRuleUntil(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
}

function parseRRuleDate(value: string): Date {
  // Format: 20260315T120000Z or 20260315
  if (value.length === 8) {
    const y = value.substring(0, 4)
    const m = value.substring(4, 6)
    const d = value.substring(6, 8)
    return new Date(`${y}-${m}-${d}T00:00:00Z`)
  }
  // Full datetime
  const y = value.substring(0, 4)
  const m = value.substring(4, 6)
  const d = value.substring(6, 8)
  const h = value.substring(9, 11)
  const min = value.substring(11, 13)
  const s = value.substring(13, 15)
  return new Date(`${y}-${m}-${d}T${h}:${min}:${s}Z`)
}

/**
 * These operate on "zoned" Date objects (as produced by `toZonedTime`), whose
 * UTC-getters/setters represent wall-clock components in the target timezone
 * rather than a real UTC instant — same convention date-fns-tz uses. Adding a
 * calendar day/month this way means "same wall-clock time the next day/month",
 * which is what a recurring event actually means to a user, and stays correct
 * across DST transitions.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date)
  result.setUTCMonth(result.getUTCMonth() + months)
  return result
}

function getWeekStart(date: Date): Date {
  const result = new Date(date)
  const day = result.getUTCDay()
  // Sunday = 0, so week start is Sunday
  result.setUTCDate(result.getUTCDate() - day)
  result.setUTCHours(0, 0, 0, 0)
  return result
}

/**
 * Expand a recurring event into occurrence start dates within [rangeStart, rangeEnd].
 * Returns real UTC instants (as Date objects) of each occurrence start.
 *
 * `timezone` is the event's IANA timezone (`events.event_timezone`). All the
 * interval math (DAILY/WEEKLY/MONTHLY/BYDAY) is done on the wall-clock
 * representation of the dates in that timezone, then converted back to a real
 * UTC instant before being returned/compared against range bounds — this is
 * what keeps a "9am every day" series landing on 9am local time across DST
 * transitions instead of drifting by an hour.
 */
export function expandRecurrence(
  eventStartAt: string,
  rrule: string,
  rangeStart: Date,
  rangeEnd: Date,
  timezone: string,
  maxOccurrences: number = 500
): Date[] {
  const parsed = parseRRule(rrule)
  const eventStart = new Date(eventStartAt)
  const eventStartZoned = toZonedTime(eventStart, timezone)
  const rangeStartZoned = toZonedTime(rangeStart, timezone)
  const rangeEndZoned = toZonedTime(rangeEnd, timezone)
  const occurrences: Date[] = []

  let current = new Date(eventStartZoned)
  let count = 0
  const limit = parsed.count ?? maxOccurrences

  // Safety limit
  const absoluteMax = 1000
  let iterations = 0

  function tryPush(candidateZoned: Date) {
    if (count >= limit) return
    const candidateUtc = fromZonedTime(candidateZoned, timezone)
    if (parsed.until && candidateUtc > parsed.until) return
    if (candidateUtc < rangeStart || candidateUtc > rangeEnd) return
    occurrences.push(candidateUtc)
    count++
  }

  while (iterations < absoluteMax) {
    iterations++

    // Check termination conditions (all comparisons here happen in the
    // zoned/wall-clock space, consistent with how `current` advances).
    const currentUtc = fromZonedTime(current, timezone)
    if (parsed.until && currentUtc > parsed.until) break
    if (count >= limit) break
    if (current > rangeEndZoned) break

    if (parsed.freq === 'WEEKLY' && parsed.byday && parsed.byday.length > 0) {
      // For WEEKLY with BYDAY, iterate through the week
      const weekStart = getWeekStart(current)
      for (const dayCode of parsed.byday) {
        const dayNum = DAY_MAP[dayCode]
        if (dayNum === undefined) continue
        const candidate = addDays(weekStart, dayNum)
        // Preserve wall-clock time from event start
        candidate.setUTCHours(
          eventStartZoned.getUTCHours(),
          eventStartZoned.getUTCMinutes(),
          eventStartZoned.getUTCSeconds()
        )

        if (candidate >= eventStartZoned && candidate >= rangeStartZoned && candidate <= rangeEndZoned) {
          tryPush(candidate)
        }

        if (count >= limit) break
      }

      // Move to next interval week
      current = addDays(weekStart, 7 * parsed.interval)
    } else {
      // DAILY or MONTHLY or WEEKLY without BYDAY
      if (current >= rangeStartZoned && current <= rangeEndZoned && current >= eventStartZoned) {
        tryPush(current)
      }

      switch (parsed.freq) {
        case 'DAILY':
          current = addDays(current, parsed.interval)
          break
        case 'WEEKLY':
          current = addDays(current, 7 * parsed.interval)
          break
        case 'MONTHLY':
          current = addMonths(current, parsed.interval)
          break
      }
    }
  }

  occurrences.sort((a, b) => a.getTime() - b.getTime())

  return occurrences
}
