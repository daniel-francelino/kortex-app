-- End-to-end encryption for the Diário de Bordo
-- (docs/journal/PLANO_CRIPTOGRAFIA_PONTA_A_PONTA.md). The server only ever
-- stores opaque ciphertext/salts here — every encrypt/decrypt/derive
-- operation happens client-side (app/utils/journal-crypto.ts).

create table if not exists public.journal_encryption (
  user_id uuid primary key references auth.users(id) on delete cascade,

  -- Cópia 1: Data Key embrulhada pela chave derivada da frase-secreta da pessoa
  data_key_wrapped_password text not null,
  data_key_wrapped_password_iv text not null,
  password_salt text not null,

  -- Cópia 2: Data Key embrulhada pela chave derivada do código de recuperação pessoal
  data_key_wrapped_recovery text not null,
  data_key_wrapped_recovery_iv text not null,
  recovery_salt text not null,

  -- Cópia 3: Data Key cifrada com RSA-OAEP pela chave pública de recuperação
  -- do Kortex (a privada correspondente nunca toca este banco nem o app em
  -- produção — ver seção "O que eu NÃO vou fazer" do plano)
  data_key_wrapped_admin text not null,

  kdf_iterations integer not null default 600000,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.journal_encryption enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_encryption'
      and policyname = 'Users can view own encryption keys'
  ) then
    create policy "Users can view own encryption keys"
      on public.journal_encryption for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_encryption'
      and policyname = 'Users can insert own encryption keys'
  ) then
    create policy "Users can insert own encryption keys"
      on public.journal_encryption for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_encryption'
      and policyname = 'Users can update own encryption keys'
  ) then
    create policy "Users can update own encryption keys"
      on public.journal_encryption for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'journal_encryption'
      and policyname = 'Users can delete own encryption keys'
  ) then
    create policy "Users can delete own encryption keys"
      on public.journal_encryption for delete
      using (auth.uid() = user_id);
  end if;
end $$;

drop trigger if exists set_journal_encryption_updated_at on public.journal_encryption;

create trigger set_journal_encryption_updated_at
  before update on public.journal_encryption
  for each row
  execute function public.set_updated_at();

-- Per-entry: whether content/title hold ciphertext (base64) instead of the
-- plain Tiptap JSON, and the IVs used to decrypt each field. Coexists with
-- plaintext entries during/before migration to E2EE (server/api/journal/
-- entries.post.ts doesn't care either way — it just stores what it's given).
alter table public.journal_entries
  add column if not exists is_encrypted boolean not null default false,
  add column if not exists content_iv text,
  add column if not exists title_iv text;
