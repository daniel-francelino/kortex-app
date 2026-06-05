function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

export function mapGoalTask(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    goalId: row.goalId ?? row.goal_id,
    title: row.title,
    description: row.description ?? null,
    completed: Boolean(row.completed),
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  }
}

export function mapGoalTasks(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoalTask)
}

export function mapGoalHabitLink(row: Record<string, unknown>): Record<string, unknown> {
  const habit = (row.habit ?? null) as Record<string, unknown> | null

  return {
    id: row.id,
    goalId: row.goalId ?? row.goal_id,
    habitId: row.habitId ?? row.habit_id,
    createdAt: row.createdAt ?? row.created_at,
    habitName: row.habitName ?? habit?.name ?? null
  }
}

export function mapGoalHabitLinks(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoalHabitLink)
}

export function mapGoal(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    title: row.title,
    description: row.description ?? null,
    emoji: row.emoji ?? null,
    timeCategory: row.timeCategory ?? row.time_category,
    lifeCategory: row.lifeCategory ?? row.life_category,
    status: row.status,
    progress: toNumber(row.progress),
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    archivedAt: row.archivedAt ?? row.archived_at ?? null,
    tasks: mapGoalTasks((row.tasks ?? null) as Record<string, unknown>[] | null | undefined),
    habitLinks: mapGoalHabitLinks((row.habitLinks ?? null) as Record<string, unknown>[] | null | undefined)
  }
}

export function mapGoals(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoal)
}
