// Maps raw snake_case Supabase rows from the journal module to the
// camelCase shape declared in app/types/journal.ts — Postgrest returns
// columns as-is, so every journal endpoint must go through these before
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
    archivedAt: row.archived_at
  }
}

export function mapJournalTag(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    createdAt: row.created_at
  }
}

export function mapMetricDefinition(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    key: row.key,
    name: row.name,
    description: row.description,
    type: row.type,
    unit: row.unit,
    minValue: row.min_value,
    maxValue: row.max_value,
    step: row.step,
    options: row.options,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }
}

export function mapMetricValue(row: Row) {
  return {
    id: row.id,
    userId: row.user_id,
    entryDate: row.entry_date,
    metricDefinitionId: row.metric_definition_id,
    numberValue: row.number_value,
    booleanValue: row.boolean_value,
    textValue: row.text_value,
    selectValue: row.select_value,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    definition: row.definition ? mapMetricDefinition(row.definition as Row) : undefined
  }
}
