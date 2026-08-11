-- ═══════════════════════════════════════════════════════════════════════════════
-- Track when a note was pinned, so pinned notes can be sub-ordered by "pinned
-- first" in custom sort mode (pin priority always outranks manual position).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notes ADD COLUMN IF NOT EXISTS pinned_at timestamptz NULL;

-- Backfill: best guess for already-pinned notes, since we don't know the exact
-- moment they were pinned.
UPDATE notes SET pinned_at = updated_at WHERE pinned = true AND pinned_at IS NULL;
