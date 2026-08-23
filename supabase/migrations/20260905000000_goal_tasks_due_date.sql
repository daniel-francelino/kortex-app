-- ============================================================================
-- Goal tasks — optional due date, synced onto the Agenda as an all-day event
-- (same pattern as habits' scheduled_time -> calendar event sync).
-- ============================================================================

ALTER TABLE goal_tasks
  ADD COLUMN IF NOT EXISTS due_date date;
