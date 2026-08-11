-- ═══════════════════════════════════════════════════════════════════════════════
-- Deleting a folder must delete every note nested inside it (not just orphan them)
-- ═══════════════════════════════════════════════════════════════════════════════
-- notes.folder_id was created while the table was still named "knowledge_notes",
-- so its FK constraint name doesn't follow the current "notes" table name. Look
-- it up dynamically instead of assuming a fixed name.

DO $$
DECLARE
  fk_name text;
BEGIN
  SELECT tc.constraint_name INTO fk_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
   AND tc.table_schema = kcu.table_schema
  WHERE tc.table_schema = 'public'
    AND tc.table_name = 'notes'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'folder_id'
  LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE notes DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE notes
    ADD CONSTRAINT notes_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE CASCADE;
END $$;
