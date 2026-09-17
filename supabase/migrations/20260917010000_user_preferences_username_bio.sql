-- ============================================================================
-- Perfil público: username + bio, no lar já existente de "dados de perfil
-- além do user_metadata do Supabase Auth". Additive only. Ver
-- docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md seção 4.
-- ============================================================================

ALTER TABLE public.user_preferences
  ADD COLUMN username text,
  ADD COLUMN bio text;

-- Unicidade case-insensitive — "MichaelNorris" e "michaelnorris" são o mesmo
-- username. A aplicação sempre grava em minúsculas (server/utils/username.ts),
-- este índice é a garantia de verdade contra corrida entre checagem e update.
-- Parcial (WHERE username IS NOT NULL) porque a maioria das contas existentes
-- fica sem username até escolher um em Configurações.
CREATE UNIQUE INDEX idx_user_preferences_username_lower
  ON public.user_preferences (lower(username))
  WHERE username IS NOT NULL;
