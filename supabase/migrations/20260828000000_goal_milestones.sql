-- Item 5 do roadmap de Metas (docs/goals/ANALISE_METAS_MERCADO.md):
-- sub-metas/marcos entre a meta e suas tarefas.

CREATE TABLE goal_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id uuid NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_goal_milestones_goal_id ON goal_milestones(goal_id);

ALTER TABLE goal_tasks ADD COLUMN milestone_id uuid REFERENCES goal_milestones(id) ON DELETE SET NULL;

CREATE INDEX idx_goal_tasks_milestone_id ON goal_tasks(milestone_id);

ALTER TABLE goal_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY goal_milestones_select ON goal_milestones FOR SELECT
  USING (EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_milestones.goal_id AND goals.user_id = auth.uid()));
CREATE POLICY goal_milestones_insert ON goal_milestones FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_milestones.goal_id AND goals.user_id = auth.uid()));
CREATE POLICY goal_milestones_update ON goal_milestones FOR UPDATE
  USING (EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_milestones.goal_id AND goals.user_id = auth.uid()));
CREATE POLICY goal_milestones_delete ON goal_milestones FOR DELETE
  USING (EXISTS (SELECT 1 FROM goals WHERE goals.id = goal_milestones.goal_id AND goals.user_id = auth.uid()));
