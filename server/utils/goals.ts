function toNumber(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value ?? 0)
  return Number.isFinite(parsed) ? parsed : 0
}

/**
 * Progress percentage for 'numeric'/'monetary' goals — clamped 0-100,
 * 0 when there's no target to measure against.
 */
export function calculateNumericProgress(currentValue: number, targetValue: number | null | undefined): number {
  if (!targetValue || targetValue <= 0) return 0
  const ratio = (currentValue / targetValue) * 100
  return Math.min(100, Math.max(0, Math.round(ratio * 10) / 10))
}

export function mapGoalTask(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    goalId: row.goalId ?? row.goal_id,
    title: row.title,
    description: row.description ?? null,
    completed: Boolean(row.completed),
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    milestoneId: row.milestoneId ?? row.milestone_id ?? null,
    dueDate: row.dueDate ?? row.due_date ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  }
}

export function mapGoalTasks(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoalTask)
}

export function mapGoalMilestone(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    goalId: row.goalId ?? row.goal_id,
    title: row.title,
    description: row.description ?? null,
    sortOrder: row.sortOrder ?? row.sort_order ?? 0,
    completed: Boolean(row.completed),
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  }
}

export function mapGoalMilestones(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoalMilestone)
}

export function mapGoalReflection(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null

  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    goalId: row.goalId ?? row.goal_id,
    weekKey: row.weekKey ?? row.week_key,
    stillRelevant: row.stillRelevant ?? row.still_relevant ?? null,
    notes: row.notes ?? null,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at
  }
}

export function mapGoalHabitLink(row: Record<string, unknown>): Record<string, unknown> {
  const habit = (row.habit ?? null) as Record<string, unknown> | null

  return {
    id: row.id,
    goalId: row.goalId ?? row.goal_id,
    habitId: row.habitId ?? row.habit_id,
    createdAt: row.createdAt ?? row.created_at,
    habitName: row.habitName ?? habit?.name ?? null,
    habitArchivedAt: row.habitArchivedAt ?? habit?.archived_at ?? null
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
    progressType: row.progressType ?? row.progress_type ?? 'tasks',
    targetValue: row.targetValue ?? row.target_value ?? null,
    currentValue: toNumber(row.currentValue ?? row.current_value),
    unit: row.unit ?? null,
    coverImageUrl: row.coverImageUrl ?? row.cover_image_url ?? null,
    taskProgress: row.taskProgress !== undefined ? toNumber(row.taskProgress) : undefined,
    habitProgress: row.habitProgress !== undefined ? toNumber(row.habitProgress) : undefined,
    combinedProgress: row.combinedProgress !== undefined ? toNumber(row.combinedProgress) : undefined,
    createdAt: row.createdAt ?? row.created_at,
    updatedAt: row.updatedAt ?? row.updated_at,
    archivedAt: row.archivedAt ?? row.archived_at ?? null,
    tasks: mapGoalTasks((row.tasks ?? null) as Record<string, unknown>[] | null | undefined),
    habitLinks: mapGoalHabitLinks((row.habitLinks ?? null) as Record<string, unknown>[] | null | undefined),
    milestones: mapGoalMilestones((row.milestones ?? null) as Record<string, unknown>[] | null | undefined)
  }
}

export function mapGoals(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapGoal)
}
