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
  locked: boolean
  isEncrypted: boolean
  contentIv: string | null
  titleIv: string | null
  latitude: number | null
  longitude: number | null
  weatherTempC: number | null
  weatherCode: number | null
}

// ─── PIN lock ─────────────────────────────────────────────────────────────────

export type JournalPinMode = 'module' | 'entries'

export interface JournalLockStatus {
  enabled: boolean
  mode: JournalPinMode | null
}

// ─── Criptografia ponta-a-ponta ────────────────────────────────────────────────
// Ver docs/journal/PLANO_CRIPTOGRAFIA_PONTA_A_PONTA.md — toda cifra/decifra
// roda no cliente (app/utils/journal-crypto.ts); estes tipos só descrevem os
// blobs opacos que o servidor guarda/devolve.

export interface JournalEncryptionStatus {
  enabled: boolean
}

export interface JournalEncryptionKeys {
  dataKeyWrappedPassword: string
  dataKeyWrappedPasswordIv: string
  passwordSalt: string
  dataKeyWrappedRecovery: string
  dataKeyWrappedRecoveryIv: string
  recoverySalt: string
  dataKeyWrappedAdmin: string
  kdfIterations: number
}

export interface SetupEncryptionPayload {
  dataKeyWrappedPassword: string
  dataKeyWrappedPasswordIv: string
  passwordSalt: string
  dataKeyWrappedRecovery: string
  dataKeyWrappedRecoveryIv: string
  recoverySalt: string
  dataKeyWrappedAdmin: string
  kdfIterations: number
}

// ─── Notas periódicas (semana/mês) ─────────────────────────────────────────────
// Ver app/utils/journal-periods.ts — período identificado por period_key
// (Monday da semana em 'YYYY-MM-DD', ou 'YYYY-MM' pro mês), não por número
// ISO de semana.

export interface PeriodicNote {
  id: string
  userId: string
  periodType: 'week' | 'month'
  periodKey: string
  periodStart: string
  periodEnd: string
  title: string | null
  content: string
  createdAt: string
  updatedAt: string
}

export interface PeriodicNoteEntrySummary {
  entryDate: string
  title: string | null
  mood: string | null
  isEncrypted: boolean
}

export interface PeriodicNoteResponse {
  note: PeriodicNote | null
  entries: PeriodicNoteEntrySummary[]
}

export interface UpsertPeriodicNotePayload {
  periodType: 'week' | 'month'
  periodKey: string
  periodStart: string
  periodEnd: string
  title?: string | null
  content: string
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface UpsertEntryPayload {
  entryDate: string
  title?: string | null
  content: string
  mood?: string | null
  isEncrypted?: boolean
  contentIv?: string | null
  titleIv?: string | null
  latitude?: number | null
  longitude?: number | null
  weatherTempC?: number | null
  weatherCode?: number | null
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
