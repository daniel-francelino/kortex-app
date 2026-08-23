-- PIN lock for the Diário de Bordo module — a privacy screen (not a second
-- API auth layer): the user is already authenticated before reaching it.
-- Config lives on user_preferences (account-scoped), the per-entry flag
-- lives on journal_entries (only meaningful when journal_pin_mode = 'entries').

alter table public.user_preferences
  add column if not exists journal_pin_hash text,
  add column if not exists journal_pin_salt text,
  add column if not exists journal_pin_mode text check (journal_pin_mode in ('module', 'entries')),
  add column if not exists journal_pin_failed_attempts integer not null default 0,
  add column if not exists journal_pin_locked_until timestamptz;

alter table public.journal_entries
  add column if not exists locked boolean not null default false;
