import { parseDate, parseTime } from '@internationalized/date'
import type { DateValue, TimeValue } from '@internationalized/date'

export function strToDateValue(str: string): DateValue | undefined {
  if (!str) return undefined
  try { return parseDate(str) } catch { return undefined }
}

export function dateValueToStr(d: DateValue | null | undefined): string {
  return d ? d.toString() : ''
}

export function strToTimeValue(str: string): TimeValue | undefined {
  if (!str) return undefined
  try {
    return parseTime(str.length === 5 ? str + ':00' : str)
  } catch { return undefined }
}

export function timeValueToStr(t: TimeValue | null | undefined): string {
  if (!t) return ''
  return `${String(t.hour).padStart(2, '0')}:${String(t.minute).padStart(2, '0')}`
}
