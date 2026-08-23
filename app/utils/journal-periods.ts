// Date helpers for the Diário de Bordo's periodic notes (weekly/monthly).
// Weeks are keyed by their Monday's date instead of ISO week numbers —
// simpler, no year-boundary edge cases, at the cost of not showing a
// "Semana 34" label (shows a date range instead, see formatPeriodLabel).

export type PeriodType = 'week' | 'month'

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function parseDateOnly(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}

export function weekStart(date: Date): Date {
  const day = (date.getDay() + 6) % 7 // Monday = 0
  const monday = new Date(date)
  monday.setDate(date.getDate() - day)
  monday.setHours(0, 0, 0, 0)
  return monday
}

export function periodKeyFor(type: PeriodType, date: Date): string {
  if (type === 'week') return toDateOnly(weekStart(date))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function periodRangeFor(type: PeriodType, key: string): { start: string, end: string } {
  if (type === 'week') {
    const start = parseDateOnly(key)
    const end = new Date(start)
    end.setDate(start.getDate() + 6)
    return { start: toDateOnly(start), end: toDateOnly(end) }
  }
  const [y, m] = key.split('-').map(Number)
  const start = new Date(y!, (m ?? 1) - 1, 1)
  const end = new Date(y!, m ?? 1, 0)
  return { start: toDateOnly(start), end: toDateOnly(end) }
}

// Deslocamento em semanas/meses a partir de uma chave — usado pelo
// navegador anterior/próximo do PeriodicNotesView.
export function shiftPeriodKey(type: PeriodType, key: string, delta: number): string {
  if (type === 'week') {
    const start = parseDateOnly(key)
    start.setDate(start.getDate() + delta * 7)
    return periodKeyFor('week', start)
  }
  const [y, m] = key.split('-').map(Number)
  const date = new Date(y!, (m ?? 1) - 1 + delta, 1)
  return periodKeyFor('month', date)
}

const MONTH_NAMES = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'
]

export function formatPeriodLabel(type: PeriodType, key: string): string {
  if (type === 'month') {
    const [y, m] = key.split('-').map(Number)
    return `${MONTH_NAMES[(m ?? 1) - 1]} de ${y}`
  }
  const { start, end } = periodRangeFor('week', key)
  const s = parseDateOnly(start)
  const e = parseDateOnly(end)
  const sameMonth = s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()
  if (sameMonth) {
    return `${s.getDate()}–${e.getDate()} de ${MONTH_NAMES[s.getMonth()]} de ${s.getFullYear()}`
  }
  return `${s.getDate()} de ${MONTH_NAMES[s.getMonth()]} – ${e.getDate()} de ${MONTH_NAMES[e.getMonth()]} de ${e.getFullYear()}`
}
