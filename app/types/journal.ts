// ─── Mood ─────────────────────────────────────────────────────────────────────

export type MoodValue = 'very_bad' | 'bad' | 'neutral' | 'good' | 'very_good'

export const MOOD_OPTIONS: { value: MoodValue; emoji: string; label: string; color: string }[] = [
  { value: 'very_bad', emoji: '😞', label: 'Muito mal', color: '#ef4444' },
  { value: 'bad', emoji: '😕', label: 'Mal', color: '#f97316' },
  { value: 'neutral', emoji: '😐', label: 'Neutro', color: '#94a3b8' },
  { value: 'good', emoji: '🙂', label: 'Bem', color: '#22c55e' },
  { value: 'very_good', emoji: '😄', label: 'Muito bem', color: '#10b981' }
]

export function getMoodOption(mood: MoodValue | string | null | undefined) {
  return MOOD_OPTIONS.find(m => m.value === mood) ?? null
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface JournalEntry {
  id: string
  userId: string
  entryDate: string
  title: string | null
  content: string
  mood: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface UpsertEntryPayload {
  entryDate: string
  title?: string | null
  content: string
  mood?: string | null
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface JournalListResponse {
  data: JournalEntry[]
  total: number
  page: number
  pageSize: number
}

export interface JournalInsights {
  range: string
  totalEntries: number
  entriesByDayOfWeek: { day: string, count: number }[]
}
