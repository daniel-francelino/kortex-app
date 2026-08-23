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
    locked: row.locked ?? false
  }
}
