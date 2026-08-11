-- ═══════════════════════════════════════════════════════════════════════════════
-- Persist each folder's expanded/collapsed state so it stays consistent across
-- devices, instead of living only in the browser's localStorage.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS is_expanded boolean NOT NULL DEFAULT true;
