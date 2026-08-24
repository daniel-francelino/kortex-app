-- Marca-d'água de execução dos jobs de cron do kortex-api.
-- Permite que cada scan calcule sua janela como [max(last_run_at, agora − 24h), agora + lead],
-- em vez de uma janela cega para frente — sobrevive a downtime sem perder nem duplicar lembretes
-- (dedupe fica a cargo do external_id único de `notifications`).

create table if not exists public.cron_job_runs (
  job_name text primary key,
  last_run_at timestamptz not null
);

alter table public.cron_job_runs enable row level security;
-- Sem policies: só service role acessa (bypassa RLS). Isso bloqueia anon/authenticated
-- por padrão, em vez de deixar a tabela exposta via REST com RLS desligada.
