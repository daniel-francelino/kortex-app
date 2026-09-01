-- `timezone` was `not null default 'UTC'`, which made "never chosen" and
-- "explicitly chose UTC" indistinguishable. Making it nullable lets the app
-- populate it from the browser's detected timezone exactly once, the first
-- time it's still null (see docs/timezone/ANALISE_TIMEZONE.md) — after that
-- it's a stable anchor, never overwritten automatically again.
alter table user_preferences
  alter column timezone drop not null,
  alter column timezone drop default;
