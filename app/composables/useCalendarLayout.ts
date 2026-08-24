import type { CalendarEvent } from '~/types/appointments'
import { getEventTimeZone, getZonedDate } from '~/utils/calendarEventTime'

export interface PositionedEvent extends CalendarEvent {
  leftRatio: number
  widthRatio: number
}

export const HOUR_HEIGHT = 48 // px per hour

export function getEventTopPx(event: CalendarEvent, dayDate: Date): number {
  const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())
  const evtStart = getZonedDate(event.startAt, getEventTimeZone(event))
  const startMinutes = Math.max(0, (evtStart.getTime() - dayStart.getTime()) / 60000)
  return (startMinutes / 60) * HOUR_HEIGHT
}

export function getEventHeightPx(event: CalendarEvent, dayDate: Date): number {
  const dayStart = new Date(dayDate.getFullYear(), dayDate.getMonth(), dayDate.getDate())
  const timeZone = getEventTimeZone(event)
  const evtStart = getZonedDate(event.startAt, timeZone)
  const evtEnd = getZonedDate(event.endAt, timeZone)
  const startMinutes = Math.max(0, (evtStart.getTime() - dayStart.getTime()) / 60000)
  const endMinutes = Math.min(1440, (evtEnd.getTime() - dayStart.getTime()) / 60000)
  const duration = Math.max(endMinutes - startMinutes, 15)
  return Math.max((duration / 60) * HOUR_HEIGHT, 20)
}

export function layoutTimedEvents(events: CalendarEvent[]): PositionedEvent[] {
  if (events.length === 0) return []

  const sorted = [...events].sort(
    (a, b) =>
      getZonedDate(a.startAt, getEventTimeZone(a)).getTime()
      - getZonedDate(b.startAt, getEventTimeZone(b)).getTime()
  )

  // Build groups of overlapping events
  const groups: CalendarEvent[][] = []
  let currentGroup: CalendarEvent[] = []
  let groupEnd: Date | null = null

  for (const evt of sorted) {
    const timeZone = getEventTimeZone(evt)
    const start = getZonedDate(evt.startAt, timeZone)
    const end = getZonedDate(evt.endAt, timeZone)

    if (groupEnd === null || start >= groupEnd) {
      if (currentGroup.length > 0) groups.push(currentGroup)
      currentGroup = [evt]
      groupEnd = end
    } else {
      currentGroup.push(evt)
      if (end > groupEnd) groupEnd = end
    }
  }
  if (currentGroup.length > 0) groups.push(currentGroup)

  const result: PositionedEvent[] = []

  for (const group of groups) {
    // Greedy column packing: assign each event to the first column it fits in
    const columns: CalendarEvent[][] = []

    for (const evt of group) {
      const evtStart = getZonedDate(evt.startAt, getEventTimeZone(evt))
      let placed = false

      for (const col of columns) {
        const lastInCol = col[col.length - 1]!
        if (evtStart >= getZonedDate(lastInCol.endAt, getEventTimeZone(lastInCol))) {
          col.push(evt)
          placed = true
          break
        }
      }

      if (!placed) {
        columns.push([evt])
      }
    }

    const colCount = columns.length

    columns.forEach((col, colIndex) => {
      col.forEach(evt => {
        result.push({
          ...evt,
          leftRatio: colIndex / colCount,
          widthRatio: 1 / colCount
        })
      })
    })
  }

  return result
}

export function getCurrentTimePx(): number {
  const now = new Date()
  return ((now.getHours() * 60 + now.getMinutes()) / 60) * HOUR_HEIGHT
}

export function formatHourLabel(hour: number): string {
  if (hour === 0) return ''
  return `${String(hour).padStart(2, '0')}:00`
}

export function snapMinutes(minutes: number, snap = 15): number {
  return Math.round(minutes / snap) * snap
}
