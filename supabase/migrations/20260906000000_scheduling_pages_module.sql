-- ============================================================================
-- Scheduling pages module — public booking link (Calendly-style)
-- Tables: scheduling_pages, scheduling_availability_rules, scheduling_questions, bookings
-- Builds on top of the existing calendars/events + server/utils/recurrence.ts —
-- no destructive change to any existing table.
-- ============================================================================

CREATE TYPE scheduling_location_type AS ENUM ('video_link', 'phone', 'in_person', 'custom');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'rescheduled');
CREATE TYPE scheduling_question_type AS ENUM ('text', 'textarea', 'select');

-- ─── 1. Scheduling pages ("event types" in Calendly's vocabulary) ──────────

CREATE TABLE scheduling_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,

  title text NOT NULL,
  description text,
  duration_minutes int NOT NULL CHECK (duration_minutes >= 5),
  location_type scheduling_location_type NOT NULL DEFAULT 'video_link',
  location_details text,
  timezone text NOT NULL,

  buffer_before_minutes int NOT NULL DEFAULT 0,
  buffer_after_minutes int NOT NULL DEFAULT 0,
  slot_increment_minutes int NOT NULL DEFAULT 15,
  min_notice_hours int NOT NULL DEFAULT 4,
  max_advance_days int NOT NULL DEFAULT 60,
  max_bookings_per_day int,

  share_token text NOT NULL UNIQUE,
  is_active boolean NOT NULL DEFAULT true,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX idx_scheduling_pages_user_id ON scheduling_pages(user_id);
CREATE INDEX idx_scheduling_pages_share_token ON scheduling_pages(share_token);

-- ─── 2. Weekly availability windows (multiple per day allowed) ─────────────

CREATE TABLE scheduling_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time)
);

CREATE INDEX idx_scheduling_availability_page_id ON scheduling_availability_rules(scheduling_page_id);

-- ─── 3. Custom booking-form questions ───────────────────────────────────────

CREATE TABLE scheduling_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  label text NOT NULL,
  type scheduling_question_type NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb,
  sort_order int NOT NULL DEFAULT 0
);

CREATE INDEX idx_scheduling_questions_page_id ON scheduling_questions(scheduling_page_id);

-- ─── 4. Bookings ─────────────────────────────────────────────────────────────

CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_timezone text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}',
  status booking_status NOT NULL DEFAULT 'confirmed',
  manage_token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX idx_bookings_scheduling_page_id ON bookings(scheduling_page_id);
CREATE INDEX idx_bookings_event_id ON bookings(event_id);
CREATE INDEX idx_bookings_manage_token ON bookings(manage_token);

-- ─── RLS ────────────────────────────────────────────────────────────────────
-- Owner-only for authenticated access; the public endpoints (server/api/schedule/)
-- use the service-role client, same pattern as server/api/share/[token].get.ts
-- for public notes — no anonymous-access policy is defined here.

ALTER TABLE scheduling_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_availability_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE scheduling_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY scheduling_pages_select ON scheduling_pages
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY scheduling_pages_insert ON scheduling_pages
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY scheduling_pages_update ON scheduling_pages
  FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY scheduling_pages_delete ON scheduling_pages
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY scheduling_availability_rules_all ON scheduling_availability_rules
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM scheduling_pages
      WHERE scheduling_pages.id = scheduling_availability_rules.scheduling_page_id
        AND scheduling_pages.user_id = auth.uid()
    )
  );

CREATE POLICY scheduling_questions_all ON scheduling_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM scheduling_pages
      WHERE scheduling_pages.id = scheduling_questions.scheduling_page_id
        AND scheduling_pages.user_id = auth.uid()
    )
  );

CREATE POLICY bookings_select ON bookings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM scheduling_pages
      WHERE scheduling_pages.id = bookings.scheduling_page_id
        AND scheduling_pages.user_id = auth.uid()
    )
  );
