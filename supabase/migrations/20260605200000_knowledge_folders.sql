CREATE TABLE IF NOT EXISTS knowledge_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) >= 1 AND char_length(name) <= 200),
  parent_id uuid REFERENCES knowledge_folders(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_knowledge_folders_user_id ON knowledge_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_parent_id ON knowledge_folders(parent_id);

ALTER TABLE knowledge_notes ADD COLUMN IF NOT EXISTS folder_id uuid REFERENCES knowledge_folders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_knowledge_notes_folder_id ON knowledge_notes(folder_id);
