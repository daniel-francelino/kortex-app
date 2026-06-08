-- ═══════════════════════════════════════════════════════════════════════════════
-- Rename knowledge_* tables to notes / note_*
-- ═══════════════════════════════════════════════════════════════════════════════

-- ─── Rename tables ────────────────────────────────────────────────────────────

ALTER TABLE knowledge_notes    RENAME TO notes;
ALTER TABLE knowledge_tags     RENAME TO note_tags;
ALTER TABLE knowledge_folders  RENAME TO note_folders;

-- ─── Rename indexes ───────────────────────────────────────────────────────────

ALTER INDEX idx_knowledge_notes_user          RENAME TO idx_notes_user;
ALTER INDEX idx_knowledge_notes_type          RENAME TO idx_notes_type;
ALTER INDEX idx_knowledge_notes_pinned        RENAME TO idx_notes_pinned;
ALTER INDEX idx_knowledge_notes_title_trgm    RENAME TO idx_notes_title_trgm;
ALTER INDEX idx_knowledge_notes_folder_id     RENAME TO idx_notes_folder_id;
ALTER INDEX idx_knowledge_tags_user           RENAME TO idx_note_tags_user;
ALTER INDEX idx_knowledge_folders_user_id     RENAME TO idx_note_folders_user_id;
ALTER INDEX idx_knowledge_folders_parent_id   RENAME TO idx_note_folders_parent_id;

-- ─── Fix RLS on note_links ────────────────────────────────────────────────────
-- The policy body referenced the old table name "knowledge_notes" as an
-- identifier; after renaming the table that reference breaks, so recreate it.

DROP POLICY "Users can manage own note links" ON note_links;

CREATE POLICY "Users can manage own note links"
  ON note_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_links.source_note_id
        AND notes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_links.source_note_id
        AND notes.user_id = auth.uid()
    )
  );

-- ─── Fix RLS on note_tag_links ────────────────────────────────────────────────

DROP POLICY "Users can manage own note-tag links" ON note_tag_links;

CREATE POLICY "Users can manage own note-tag links"
  ON note_tag_links
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_tag_links.note_id
        AND notes.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM notes
      WHERE notes.id = note_tag_links.note_id
        AND notes.user_id = auth.uid()
    )
  );
