-- Fase 1.1 do plano Metas x Hábitos (docs/goals/PLANO_METAS_HABITOS.md):
-- um hábito passa a poder sustentar no máximo uma meta por vez.

-- 1. Deduplicar: para cada habit_id vinculado a mais de uma meta, manter só o vínculo mais recente
DELETE FROM goal_habits gh
USING (
  SELECT id,
         row_number() OVER (PARTITION BY habit_id ORDER BY created_at DESC) AS rn
  FROM goal_habits
) ranked
WHERE gh.id = ranked.id AND ranked.rn > 1;

-- 2. Aplicar a restrição de unicidade em habit_id sozinho
ALTER TABLE goal_habits ADD CONSTRAINT goal_habits_habit_id_unique UNIQUE (habit_id);
