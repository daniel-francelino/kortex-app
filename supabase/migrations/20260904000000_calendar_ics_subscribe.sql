-- ═══════════════════════════════════════════════════════════════════════════════
-- ICS subscription — a token-authenticated feed URL external calendar apps can
-- subscribe to (they can't do cookie auth), same pattern as
-- habit_user_settings.share_token (server/api/habits/share.get.ts).
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE calendars
  ADD COLUMN IF NOT EXISTS subscribe_token text UNIQUE,
  ADD COLUMN IF NOT EXISTS subscribe_enabled boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_calendars_subscribe_token ON calendars(subscribe_token) WHERE subscribe_token IS NOT NULL;
