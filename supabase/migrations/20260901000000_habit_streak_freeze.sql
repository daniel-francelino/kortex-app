-- ============================================================================
-- Habits Module — Streak freeze (forgive a missed day without breaking streak)
-- ============================================================================

-- 1. Allow logging a day as 'frozen' (forgiven, doesn't break the streak but
--    doesn't count as a real completion either).
ALTER TYPE habit_log_status ADD VALUE IF NOT EXISTS 'frozen';

-- 2. Cache the streak's current status on habit_streaks so the client doesn't
--    need to re-derive it from raw logs (mirrors current_streak/longest_streak
--    being a cache of the same underlying habit_logs data).
ALTER TABLE habit_streaks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'frozen', 'broken'));
