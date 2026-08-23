-- Item 8 do roadmap de Metas (docs/goals/ANALISE_METAS_MERCADO.md):
-- revisão periódica dedicada a cada meta.

CREATE TABLE goal_reflections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  week_key text NOT NULL, -- e.g. '2026-W10'
  still_relevant boolean,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, goal_id, week_key)
);

CREATE INDEX idx_goal_reflections_goal_id ON goal_reflections(goal_id);
CREATE INDEX idx_goal_reflections_user_id ON goal_reflections(user_id);

ALTER TABLE goal_reflections ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_reflections_select ON goal_reflections FOR SELECT USING (user_id = auth.uid());
CREATE POLICY goal_reflections_insert ON goal_reflections FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY goal_reflections_update ON goal_reflections FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY goal_reflections_delete ON goal_reflections FOR DELETE USING (user_id = auth.uid());
