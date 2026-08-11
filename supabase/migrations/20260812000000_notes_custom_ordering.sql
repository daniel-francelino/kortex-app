-- ═══════════════════════════════════════════════════════════════════════════════
-- Custom (drag-and-drop) ordering for notes and folders
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notes ADD COLUMN IF NOT EXISTS position double precision;
ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS position double precision;

-- Backfill: seed positions from the current default ordering, with wide spacing
-- so future inserts/reorders can slot in between without renumbering siblings.
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY updated_at DESC) AS rn
  FROM notes
)
UPDATE notes n SET position = ranked.rn * 1000
FROM ranked WHERE ranked.id = n.id;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, parent_id ORDER BY name ASC) AS rn
  FROM note_folders
)
UPDATE note_folders f SET position = ranked.rn * 1000
FROM ranked WHERE ranked.id = f.id;

ALTER TABLE notes ALTER COLUMN position SET NOT NULL;
ALTER TABLE notes ALTER COLUMN position SET DEFAULT 0;
ALTER TABLE note_folders ALTER COLUMN position SET NOT NULL;
ALTER TABLE note_folders ALTER COLUMN position SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_notes_position ON notes(user_id, position);
CREATE INDEX IF NOT EXISTS idx_note_folders_position ON note_folders(user_id, parent_id, position);
