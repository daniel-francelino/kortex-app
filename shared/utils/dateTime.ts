import { addDays, differenceInCalendarDays, format, isSameDay, parse, subDays } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz'

export interface ZonedDateParts {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

/** Every IANA zone the runtime knows about — used to reject garbage before it
 * ever reaches `date-fns-tz` (which throws on an invalid zone) or gets
 * persisted somewhere it can't be undone from. */
const IANA_ZONES = new Set(Intl.supportedValuesOf('timeZone'))

export function isValidTimeZone(tz: unknown): tz is string {
  return typeof tz === 'string' && IANA_ZONES.has(tz)
}

/** A Date whose *local* getters (getFullYear/getMonth/getDate/getHours/...) read
 * as the wall-clock time in `timeZone` — the convention every calendar view
 * relies on for grid positioning/comparisons, regardless of the viewer's own
 * system timezone. `date-fns-tz`'s toZonedTime does exactly this. Only ever
 * read this Date through local getters / other date-fns calls — its own UTC
 * instant is meaningless, it's a display/comparison convenience only. */
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

/** A real instant (Date/ISO string) → its `yyyy-MM-dd` calendar-day key in
 * `timeZone`. This is the one place "what day is this instant, *there*"
 * gets answered — every other day-key computation in the app should route
 * through this instead of `.toISOString().split('T')[0]` (which answers
 * "what day is this instant in UTC", almost never the question being asked). */
export function formatZonedDateKey(dateInput: string | Date, timeZone: string): string {
  return formatInTimeZone(dateInput, timeZone, 'yyyy-MM-dd')
}

/** "What calendar day is it right now, in `timeZone`" — the replacement for
 * every `new Date().toISOString().split('T')[0]` in the codebase, which
 * silently answers "what day is it in UTC" instead. */
export function todayInZone(timeZone: string): string {
  return formatZonedDateKey(new Date(), timeZone)
}

/** A `yyyy-MM-dd` key → a plain calendar-day `Date` with no attached
 * timezone — it exists purely to carry the year/month/day, using the JS
 * environment's own local Date constructor. Safe to hand to any *local*
 * date-fns function (`addDays`, `subDays`, `isSameDay`, `getDay`, `format`
 * without a `timeZone` option, `differenceInCalendarDays`, ...) as long as
 * every value in that chain came from this same convention — never mix it
 * with a real UTC instant or a `getZonedDate` result. To turn a calendar day
 * back into a real UTC instant, use `startOfDayInZone`/`endOfDayInZone`. */
export function parseCalendarDate(dateStr: string): Date {
  return parse(dateStr, 'yyyy-MM-dd', new Date())
}

/** Inverse of `parseCalendarDate` — a calendar-day `Date` → its `yyyy-MM-dd`
 * key, with no timezone conversion (it was never a real instant to begin
 * with). Use this after `addDays`/`subDays`-ing a `parseCalendarDate` result. */
export function formatCalendarDate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

/** A `yyyy-MM-dd` calendar day, interpreted as a day in `timeZone` → the real
 * UTC instant its midnight (00:00:00.000) falls on. Use for the lower bound
 * of a "this calendar day" DB range query. */
export function startOfDayInZone(dateStr: string, timeZone: string): Date {
  return fromZonedTime(`${dateStr}T00:00:00.000`, timeZone)
}

/** Same as `startOfDayInZone`, but the day's last instant (23:59:59.999) —
 * the upper bound of a "this calendar day" DB range query. */
export function endOfDayInZone(dateStr: string, timeZone: string): Date {
  return fromZonedTime(`${dateStr}T23:59:59.999`, timeZone)
}

/** Inverse of `getZonedDate`: given wall-clock date/time strings meant as
 * local time in `timeZone`, returns the equivalent UTC instant as an ISO
 * string — what every create/update/drag-drop payload sends the API. */
export function zonedDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hour, minute] = timeStr.split(':').map(Number)
  const wallClock = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, hour ?? 0, minute ?? 0, 0)
  return fromZonedTime(wallClock, timeZone).toISOString()
}

/** Adds (or, with a negative amount, subtracts) whole calendar days to a
 * `yyyy-MM-dd` key, returning a `yyyy-MM-dd` key — for streak/window walks
 * that used to mutate a `Date` by hand with `.setDate(.getDate() ± n)`. */
export function addCalendarDays(dateStr: string, amount: number): string {
  return formatCalendarDate(addDays(parseCalendarDate(dateStr), amount))
}

export function subCalendarDays(dateStr: string, amount: number): string {
  return formatCalendarDate(subDays(parseCalendarDate(dateStr), amount))
}

/** Whether two real instants fall on the same calendar day *in `timeZone`* —
 * not the same 24h window, the same wall-clock day. */
export function isSameCalendarDay(a: string | Date, b: string | Date, timeZone: string): boolean {
  return isSameDay(getZonedDate(a, timeZone), getZonedDate(b, timeZone))
}

/** Whole calendar days between two `yyyy-MM-dd` keys (or two real instants,
 * given a `timeZone` to resolve them in first) — positive when `b` is after
 * `a`. Use for "how many days overdue"/streak-gap style calculations instead
 * of subtracting raw millisecond timestamps, which drifts across DST/zone
 * boundaries. */
export function differenceInCalendarDaysInZone(a: string, b: string): number {
  return differenceInCalendarDays(parseCalendarDate(b), parseCalendarDate(a))
}

/** Centralized display formatter — the replacement for the ~20 scattered
 * `toLocaleDateString('pt-BR', {...})`/`toLocaleTimeString('pt-BR', {...})`/
 * bare `Intl.DateTimeFormat('pt-BR', {...})` call sites across the app, each
 * of which was hand-rolling its own `options` object. Pass `timeZone` to
 * format an instant as it reads in a specific zone (server-side, or "keep
 * showing Lisbon time" cases); omit it to format using the *environment's*
 * own local time — the same implicit behavior every one of those call sites
 * already had (correct on the client, since they only ever rendered there). */
export function formatDisplay(
  dateInput: string | Date,
  formatStr: string,
  options?: { timeZone?: string }
): string {
  const date = options?.timeZone ? getZonedDate(dateInput, options.timeZone) : new Date(dateInput)
  return format(date, formatStr, { locale: ptBR })
}
