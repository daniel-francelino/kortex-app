-- ═══════════════════════════════════════════════════════════════════════════════
-- Sharing — visibility levels for notes (private / shared / public).
-- share_token is only generated the first time a note becomes public, and is
-- kept around even if the note goes back to private (so re-publishing reuses
-- it) — the public endpoint always revalidates visibility = 'public' before
-- serving anything, so going private cuts off access instantly either way.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared', 'public')),
  ADD COLUMN IF NOT EXISTS share_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS share_token_created_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_notes_share_token ON notes(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notes_visibility ON notes(visibility) WHERE visibility <> 'private';
