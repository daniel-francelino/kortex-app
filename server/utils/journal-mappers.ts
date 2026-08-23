// Maps raw snake_case Supabase rows from the journal module to the
// camelCase shape declared in app/types/journal.ts — Postgrest returns
// columns as-is, so every journal endpoint must go through this before
// sending a response to the client.

type Row = Record<string, unknown>

export function mapJournalEntry(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    entryDate: row.entry_date,
    title: row.title,
    content: row.content,
    mood: row.mood,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    locked: row.locked ?? false,
    isEncrypted: row.is_encrypted ?? false,
    contentIv: row.content_iv ?? null,
    titleIv: row.title_iv ?? null,
    latitude: row.latitude ?? null,
    longitude: row.longitude ?? null,
    weatherTempC: row.weather_temp_c ?? null,
    weatherCode: row.weather_code ?? null
  }
}

export function mapPeriodicNote(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    periodType: row.period_type,
    periodKey: row.period_key,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapJournalEncryption(row: Row) {
  return {
    dataKeyWrappedPassword: row.data_key_wrapped_password,
    dataKeyWrappedPasswordIv: row.data_key_wrapped_password_iv,
    passwordSalt: row.password_salt,
    dataKeyWrappedRecovery: row.data_key_wrapped_recovery,
    dataKeyWrappedRecoveryIv: row.data_key_wrapped_recovery_iv,
    recoverySalt: row.recovery_salt,
    dataKeyWrappedAdmin: row.data_key_wrapped_admin,
    kdfIterations: row.kdf_iterations
  }
}
