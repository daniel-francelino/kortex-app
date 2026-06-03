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

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum MetricType {
  Number = 'number',
  Scale = 'scale',
  Boolean = 'boolean',
  Select = 'select',
  Text = 'text'
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
  tags?: JournalTag[]
  metrics?: MetricValueWithDefinition[]
}

export interface JournalTag {
  id: string
  userId: string
  name: string
  createdAt: string
}

export interface MetricDefinition {
  id: string
  userId: string
  key: string
  name: string
  description: string | null
  type: MetricType
  unit: string | null
  minValue: number | null
  maxValue: number | null
  step: number | null
  options: string[] | null
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface MetricValue {
  id: string
  userId: string
  entryDate: string
  metricDefinitionId: string
  numberValue: number | null
  booleanValue: boolean | null
  textValue: string | null
  selectValue: string | null
  createdAt: string
  updatedAt: string
}

export interface MetricValueWithDefinition extends MetricValue {
  definition?: MetricDefinition
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface UpsertEntryPayload {
  entryDate: string
  title?: string | null
  content: string
  mood?: string | null
  tags?: string[]
}

export interface CreateJournalTagPayload {
  name: string
}

export interface CreateMetricDefinitionPayload {
  key: string
  name: string
  description?: string | null
  type: MetricType
  unit?: string | null
  minValue?: number | null
  maxValue?: number | null
  step?: number | null
  options?: string[] | null
}

export interface UpdateMetricDefinitionPayload {
  name?: string
  description?: string | null
  isActive?: boolean
  minValue?: number | null
  maxValue?: number | null
  step?: number | null
  options?: string[] | null
}

export interface MetricValueInput {
  metricKey: string
  numberValue?: number | null
  booleanValue?: boolean | null
  textValue?: string | null
  selectValue?: string | null
}

export interface UpsertMetricValuesPayload {
  entryDate: string
  values: MetricValueInput[]
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface JournalListResponse {
  data: JournalEntry[]
  total: number
  page: number
  pageSize: number
}

export interface JournalInsightMetric {
  key: string
  name: string
  avg: number
  min: number
  max: number
  count: number
}

export interface JournalInsights {
  range: string
  totalEntries: number
  metrics: JournalInsightMetric[]
  entriesByDayOfWeek: { day: string, count: number }[]
}
