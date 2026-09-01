-- Tracks how many times each timezone has been active for the user (via the
-- one-time browser auto-fill or an explicit change in Configurações) so the
-- timezone picker can surface the most-used ones first — see
-- docs/timezone/ANALISE_TIMEZONE.md, seção 7.
alter table user_preferences
  add column if not exists timezone_usage jsonb not null default '{}';
