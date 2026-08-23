import * as chrono from 'chrono-node'

export interface QuickAddParseResult {
  title: string
  startAt: Date | null
  location: string | null
}

/**
 * Best-effort, deterministic parsing of free text into event fields — no
 * AI/LLM call. Always meant to pre-fill a form the user still reviews before
 * saving (same principle already used by the goal/habit template pickers),
 * since chrono-node's pt-BR locale doesn't reliably catch every Brazilian
 * time notation ("15h", "12h30") — it's a head start, not an oracle.
 */
export function parseQuickAddText(text: string, referenceDate: Date = new Date()): QuickAddParseResult {
  const trimmed = text.trim()
  if (!trimmed) return { title: '', startAt: null, location: null }

  let results = chrono.pt.parse(trimmed, referenceDate)
  if (results.length === 0) {
    results = chrono.parse(trimmed, referenceDate)
  }

  const dateResult = results[0] ?? null
  const startAt = dateResult ? dateResult.start.date() : null

  let remaining = dateResult
    ? trimmed.slice(0, dateResult.index) + trimmed.slice(dateResult.index + dateResult.text.length)
    : trimmed
  remaining = remaining.replace(/\s{2,}/g, ' ').trim()

  let location: string | null = null
  const locationMatch = remaining.match(/\b(?:no|na)\s+(.+)$/i)
  if (locationMatch?.[1] && locationMatch.index !== undefined) {
    location = locationMatch[1].trim()
    remaining = remaining.slice(0, locationMatch.index).trim()
  }

  const title = remaining.replace(/[,;–-]+$/, '').trim() || trimmed

  return { title, startAt, location }
}
