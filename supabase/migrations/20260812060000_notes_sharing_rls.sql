-- ═══════════════════════════════════════════════════════════════════════════════
-- Sharing — grant read (and, with 'edit' permission, write) access to notes for
-- people they've been explicitly shared with. These are additional permissive
-- policies alongside the existing owner policy on `notes` (Postgres RLS ORs
-- permissive policies together), so the owner's access is unaffected.
--
-- Public ("visibility = 'public'") access is intentionally NOT modeled here —
-- it's served by a dedicated unauthenticated endpoint (GET /api/share/[token])
-- using the service-role client, since there is no auth.uid() for anonymous
-- visitors. See docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md (A.6) for the
-- reasoning.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE POLICY "Shared recipients can read notes shared with them"
  ON notes
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM note_shares
      WHERE note_shares.note_id = notes.id
        AND note_shares.shared_with_user_id = auth.uid()
    )
  );

CREATE POLICY "Shared recipients with edit permission can update notes"
  ON notes
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM note_shares
      WHERE note_shares.note_id = notes.id
        AND note_shares.shared_with_user_id = auth.uid()
        AND note_shares.permission = 'edit'
    )
  );
