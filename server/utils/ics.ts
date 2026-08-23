/**
 * Minimal iCalendar (RFC 5545) generator. Only what's needed to export/subscribe
 * to a Kortex calendar from an external app (Google/Apple/Outlook) — one VEVENT
 * per master event (recurring series are exported as-is with their RRULE/EXDATE,
 * not pre-expanded — the external app expands them itself), plus one VEVENT per
 * "modified" exception using RECURRENCE-ID, the standard way iCalendar expresses
 * a single overridden occurrence of a series.
 */

export interface IcsEventRow {
  id: string
  title: string
  description: string | null
  location: string | null
  start_at: string
  end_at: string
  all_day: boolean
  rrule: string | null
  exdate: string[] | null
  updated_at: string
}

export interface IcsExceptionRow {
  event_id: string
  type: string
  recurrence_id: string
  override_title: string | null
  override_description: string | null
  override_location: string | null
  override_start_at: string | null
  override_end_at: string | null
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function formatIcsDateTime(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
}

function formatIcsDate(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`
}

function buildVevent(params: {
  uid: string
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  allDay: boolean
  rrule?: string | null
  exdate?: string[] | null
  recurrenceId?: string | null
  updatedAt: string
}): string {
  const lines: string[] = ['BEGIN:VEVENT', `UID:${params.uid}`]

  if (params.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(params.startAt)}`)
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(params.endAt)}`)
  } else {
    lines.push(`DTSTART:${formatIcsDateTime(params.startAt)}`)
    lines.push(`DTEND:${formatIcsDateTime(params.endAt)}`)
  }

  lines.push(`DTSTAMP:${formatIcsDateTime(params.updatedAt)}`)
  lines.push(`SUMMARY:${escapeIcsText(params.title)}`)

  if (params.description) lines.push(`DESCRIPTION:${escapeIcsText(params.description)}`)
  if (params.location) lines.push(`LOCATION:${escapeIcsText(params.location)}`)
  if (params.rrule) lines.push(`RRULE:${params.rrule}`)
  if (params.exdate && params.exdate.length > 0) {
    lines.push(`EXDATE:${params.exdate.map(formatIcsDateTime).join(',')}`)
  }
  if (params.recurrenceId) lines.push(`RECURRENCE-ID:${formatIcsDateTime(params.recurrenceId)}`)

  lines.push('END:VEVENT')
  return lines.join('\r\n')
}

export function buildIcsCalendar(
  calendarName: string,
  events: IcsEventRow[],
  exceptions: IcsExceptionRow[]
): string {
  const vevents: string[] = []

  for (const evt of events) {
    vevents.push(buildVevent({
      uid: `${evt.id}@kortex`,
      title: evt.title,
      description: evt.description,
      location: evt.location,
      startAt: evt.start_at,
      endAt: evt.end_at,
      allDay: evt.all_day,
      rrule: evt.rrule,
      exdate: evt.exdate,
      updatedAt: evt.updated_at
    }))

    if (!evt.rrule) continue

    const modifiedExceptions = exceptions.filter(ex => ex.event_id === evt.id && ex.type === 'modified')
    const duration = new Date(evt.end_at).getTime() - new Date(evt.start_at).getTime()

    for (const ex of modifiedExceptions) {
      const startAt = ex.override_start_at ?? ex.recurrence_id
      const endAt = ex.override_end_at ?? new Date(new Date(startAt).getTime() + duration).toISOString()

      vevents.push(buildVevent({
        uid: `${evt.id}@kortex`,
        title: ex.override_title ?? evt.title,
        description: ex.override_description ?? evt.description,
        location: ex.override_location ?? evt.location,
        startAt,
        endAt,
        allDay: evt.all_day,
        recurrenceId: ex.recurrence_id,
        updatedAt: evt.updated_at
      }))
    }
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kortex//Appointments//PT',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...vevents,
    'END:VCALENDAR'
  ].join('\r\n')
}
