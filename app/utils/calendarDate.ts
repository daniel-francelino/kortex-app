import { parseDate, parseTime, CalendarDate, Time } from '@internationalized/date'

export type CalendarDateValue = InstanceType<typeof CalendarDate>
export type TimeValue = InstanceType<typeof Time>

export function strToDateValue(str: string): CalendarDateValue | undefined {
  if (!str) return undefined
  try { return parseDate(str) as CalendarDateValue } catch { return undefined }
}

export function dateValueToStr(d: CalendarDateValue | null | undefined): string {
  return d ? d.toString() : ''
}

export function strToTimeValue(str: string): TimeValue | undefined {
  if (!str) return undefined
  try {
    return parseTime(str.length === 5 ? str + ':00' : str) as TimeValue
  } catch { return undefined }
}

export function timeValueToStr(t: TimeValue | null | undefined): string {
  if (!t) return ''
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}
