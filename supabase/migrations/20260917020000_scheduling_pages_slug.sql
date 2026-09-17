-- ============================================================================
-- Scheduling pages — slug (evento acessível em kortex.app/{username}/{slug})
-- + show_on_profile (oculta do perfil público sem desativar a página). Ver
-- docs/appointments/PLANO_USERNAME_PERFIL_PUBLICO.md seção 6.
--
-- Backfill inline em SQL (em vez do script Node descrito no documento) —
-- roda dentro da mesma transação da migration, então não depende de uma
-- segunda etapa manual: acentos removidos via `unaccent`, colisões dentro do
-- mesmo usuário desempatadas com `-2`, `-3`... via row_number().
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent;

ALTER TABLE scheduling_pages
  ADD COLUMN slug text,
  ADD COLUMN show_on_profile boolean NOT NULL DEFAULT true;

WITH base AS (
  SELECT
    id,
    user_id,
    created_at,
    NULLIF(
      regexp_replace(
        regexp_replace(lower(unaccent(trim(title))), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      ''
    ) AS base_slug
  FROM scheduling_pages
),
numbered AS (
  SELECT
    id,
    COALESCE(base_slug, 'evento') AS base_slug,
    row_number() OVER (PARTITION BY user_id, COALESCE(base_slug, 'evento') ORDER BY created_at, id) AS rn
  FROM base
)
UPDATE scheduling_pages sp
SET slug = CASE WHEN n.rn = 1 THEN n.base_slug ELSE n.base_slug || '-' || n.rn END
FROM numbered n
WHERE n.id = sp.id;

ALTER TABLE scheduling_pages
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE scheduling_pages
  ADD CONSTRAINT uq_scheduling_pages_user_slug UNIQUE (user_id, slug);
