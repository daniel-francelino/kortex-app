-- Item 6 do roadmap de Metas (docs/goals/ANALISE_METAS_MERCADO.md):
-- tipos de progresso numérico/monetário, além do padrão por tarefas.

ALTER TABLE goals ADD COLUMN progress_type text NOT NULL DEFAULT 'tasks'
  CHECK (progress_type IN ('tasks', 'numeric', 'monetary'));
ALTER TABLE goals ADD COLUMN target_value numeric;
ALTER TABLE goals ADD COLUMN current_value numeric NOT NULL DEFAULT 0;
ALTER TABLE goals ADD COLUMN unit text;

-- O trigger de progresso por tarefas só deve rodar para metas com progress_type = 'tasks'
-- — para 'numeric'/'monetary', o progresso é calculado e gravado pela aplicação.
CREATE OR REPLACE FUNCTION recalculate_goal_progress()
RETURNS trigger AS $$
DECLARE
  v_goal_id uuid;
  v_total int;
  v_completed int;
  v_progress numeric;
  v_progress_type text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_goal_id := OLD.goal_id;
  ELSE
    v_goal_id := NEW.goal_id;
  END IF;

  SELECT progress_type INTO v_progress_type FROM goals WHERE id = v_goal_id;

  IF v_progress_type IS DISTINCT FROM 'tasks' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT count(*), count(*) FILTER (WHERE completed = true)
  INTO v_total, v_completed
  FROM goal_tasks
  WHERE goal_id = v_goal_id;

  IF v_total > 0 THEN
    v_progress := round((v_completed::numeric / v_total::numeric) * 100, 1);
  ELSE
    v_progress := 0;
  END IF;

  UPDATE goals SET progress = v_progress, updated_at = now()
  WHERE id = v_goal_id;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
