-- ═══════════════════════════════════════════════════════════════════════════════
-- Event participants — invite + RSVP, ported from the note_shares pattern
-- (supabase/migrations/20260812050000_notes_share_grants.sql). invited_email is
-- always set (what the owner typed); invited_user_id is filled in when that
-- email already has an account, or later via reconcilePendingShares once the
-- invited person signs up/logs in with a matching email.
--
-- Distinct from note_shares' "status" (which means "has access"): here,
-- invited_user_id being set only means the invite is usable — rsvp_status is
-- the separate, actual "did they confirm attendance" answer and stays
-- 'pending' until the invitee responds.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS event_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  rsvp_status text NOT NULL DEFAULT 'pending' CHECK (rsvp_status IN ('pending', 'accepted', 'declined', 'tentative')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_event_participants_event_id ON event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_user_id ON event_participants(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_event_participants_pending_email ON event_participants(invited_email) WHERE invited_user_id IS NULL;

ALTER TABLE event_participants ENABLE ROW LEVEL SECURITY;

-- Owner manages the invite list on their own events (add/remove people, list).
CREATE POLICY "Owners manage their event participants"
  ON event_participants
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Invited person can see their own row and update only their RSVP.
CREATE POLICY "Invitees can see their own participant row"
  ON event_participants
  FOR SELECT
  USING (auth.uid() = invited_user_id);

CREATE POLICY "Invitees can update their own RSVP"
  ON event_participants
  FOR UPDATE
  USING (auth.uid() = invited_user_id)
  WITH CHECK (auth.uid() = invited_user_id);

-- Let invitees read the event itself (mirrors "Shared recipients can read
-- notes shared with them" in 20260812060000_notes_sharing_rls.sql). Read-only —
-- editing an event stays restricted to its owner.
CREATE POLICY "Invited participants can read the event"
  ON events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM event_participants
      WHERE event_participants.event_id = events.id
        AND event_participants.invited_user_id = auth.uid()
    )
  );
