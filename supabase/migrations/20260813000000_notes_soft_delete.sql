-- ═══════════════════════════════════════════════════════════════════════════════
-- Soft delete for notes and folders — deleting now sets deleted_at instead of
-- removing the row, so it can be restored from a "Lixeira" (trash) view.
-- Permanent deletion (and the cascade that already exists via ON DELETE CASCADE
-- on notes.folder_id / note_folders.parent_id) still happens for real, but only
-- from the trash, never from the normal delete action.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_folders_deleted_at ON note_folders(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
