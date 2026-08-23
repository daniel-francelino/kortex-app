-- Weekly/monthly "periodic notes" for the Diário de Bordo (Obsidian-style
-- Periodic Notes) — a free-text note per week or month, independent from
-- daily entries. `period_key` doubles as a stable, human-derivable id:
-- weeks are keyed by their Monday's date ('YYYY-MM-DD'), months by
-- 'YYYY-MM' — simpler than ISO week numbers and avoids year-boundary edge
-- cases, at the cost of not showing a "Week 34" label (shows a date range
-- instead).

create table if not exists public.journal_periodic_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_type text not null check (period_type in ('week', 'month')),
  period_key text not null,
  period_start date not null,
  period_end date not null,
  title text,
  content text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (user_id, period_type, period_key)
);

alter table public.journal_periodic_notes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_periodic_notes'
      and policyname = 'Users can view own periodic notes'
  ) then
    create policy "Users can view own periodic notes"
      on public.journal_periodic_notes for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_periodic_notes'
      and policyname = 'Users can insert own periodic notes'
  ) then
    create policy "Users can insert own periodic notes"
      on public.journal_periodic_notes for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_periodic_notes'
      and policyname = 'Users can update own periodic notes'
  ) then
    create policy "Users can update own periodic notes"
      on public.journal_periodic_notes for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_journal_periodic_notes_updated_at on public.journal_periodic_notes;

create trigger set_journal_periodic_notes_updated_at
  before update on public.journal_periodic_notes
  for each row
  execute function public.set_updated_at();

create index if not exists idx_journal_periodic_notes_user_type
  on public.journal_periodic_notes(user_id, period_type);
