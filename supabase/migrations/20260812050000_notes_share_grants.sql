-- ═══════════════════════════════════════════════════════════════════════════════
-- Sharing — per-person access grants ("shared" visibility level).
-- shared_with_email is always set (what the owner typed); shared_with_user_id
-- is filled in when that email already has an account, or later via the login
-- reconciliation step (see server/utils/reconcile-pending-shares.ts) once the
-- invited person signs up/logs in with a matching email.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS note_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  shared_with_email text NOT NULL,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (note_id, shared_with_email)
);

CREATE INDEX IF NOT EXISTS idx_note_shares_note_id ON note_shares(note_id);
CREATE INDEX IF NOT EXISTS idx_note_shares_user_id ON note_shares(shared_with_user_id);
CREATE INDEX IF NOT EXISTS idx_note_shares_pending_email ON note_shares(shared_with_email) WHERE status = 'pending';

ALTER TABLE note_shares ENABLE ROW LEVEL SECURITY;

-- Owner manages the grants on their own notes (add/update/remove people, list access).
CREATE POLICY "Owners manage their note shares"
  ON note_shares
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Invited person can see their own grant row (e.g. to know their permission level).
CREATE POLICY "Recipients can see their own share grant"
  ON note_shares
  FOR SELECT
  USING (auth.uid() = shared_with_user_id);
