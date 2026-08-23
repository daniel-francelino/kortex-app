-- ============================================================================
-- Habits Module — Emergency/minimum version of a habit for hard days
-- ============================================================================

ALTER TABLE habits
  ADD COLUMN IF NOT EXISTS emergency_version text;

ALTER TABLE habit_versions
  ADD COLUMN IF NOT EXISTS emergency_version text;

UPDATE habit_versions hv
SET emergency_version = h.emergency_version
FROM habits h
WHERE hv.habit_id = h.id
AND hv.emergency_version IS NULL;
