-- ═══════════════════════════════════════════════════════════════════════════════
-- Calendar shares — grant another user access to an entire calendar, ported
-- from note_shares (supabase/migrations/20260812050000_notes_share_grants.sql).
-- Closer in semantics to note_shares than to event_participants: this is
-- access-granting ("can this person see/edit the calendar"), not RSVP.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS calendar_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  permission text NOT NULL DEFAULT 'view' CHECK (permission IN ('view', 'edit')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, invited_email)
);

CREATE INDEX IF NOT EXISTS idx_calendar_shares_calendar_id ON calendar_shares(calendar_id);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_user_id ON calendar_shares(invited_user_id);
CREATE INDEX IF NOT EXISTS idx_calendar_shares_pending_email ON calendar_shares(invited_email) WHERE status = 'pending';

ALTER TABLE calendar_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage their calendar shares"
  ON calendar_shares
  FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Recipients can see their own calendar share grant"
  ON calendar_shares
  FOR SELECT
  USING (auth.uid() = invited_user_id);

-- Mirrors "Shared recipients can read notes shared with them"
-- (20260812060000_notes_sharing_rls.sql) for calendars and their events.

CREATE POLICY "Shared recipients can read calendars shared with them"
  ON calendars
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM calendar_shares
      WHERE calendar_shares.calendar_id = calendars.id
        AND calendar_shares.invited_user_id = auth.uid()
        AND calendar_shares.status = 'accepted'
    )
  );

CREATE POLICY "Shared recipients can read events in calendars shared with them"
  ON events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM calendar_shares
      WHERE calendar_shares.calendar_id = events.calendar_id
        AND calendar_shares.invited_user_id = auth.uid()
        AND calendar_shares.status = 'accepted'
    )
  );

CREATE POLICY "Shared recipients with edit permission can write events"
  ON events
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM calendar_shares
      WHERE calendar_shares.calendar_id = events.calendar_id
        AND calendar_shares.invited_user_id = auth.uid()
        AND calendar_shares.status = 'accepted'
        AND calendar_shares.permission = 'edit'
    )
  );

CREATE POLICY "Shared recipients with edit permission can update events"
  ON events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM calendar_shares
      WHERE calendar_shares.calendar_id = events.calendar_id
        AND calendar_shares.invited_user_id = auth.uid()
        AND calendar_shares.status = 'accepted'
        AND calendar_shares.permission = 'edit'
    )
  );
