-- Add mood column to journal_entries
-- Values: very_bad | bad | neutral | good | very_good

ALTER TABLE journal_entries
  ADD COLUMN IF NOT EXISTS mood TEXT CHECK (mood IN ('very_bad', 'bad', 'neutral', 'good', 'very_good'));
