// ─── Enums ────────────────────────────────────────────────────────────────────

export enum GoalTimeCategory {
  Daily = 'daily',
  Weekly = 'weekly',
  Monthly = 'monthly',
  Quarterly = 'quarterly',
  Yearly = 'yearly',
  LongTerm = 'long_term'
}

export enum GoalLifeCategory {
  Personal = 'personal',
  Career = 'career',
  Health = 'health',
  Finance = 'finance',
  Spiritual = 'spiritual',
  Learning = 'learning',
  Relationships = 'relationships',
  Lifestyle = 'lifestyle'
}

export enum GoalStatus {
  Active = 'active',
  Completed = 'completed',
  Archived = 'archived'
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface Goal {
  id: string
  userId: string
  title: string
  description: string | null
  emoji: string | null
  timeCategory: GoalTimeCategory
  lifeCategory: GoalLifeCategory
  status: GoalStatus
  progress: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  // Populated via joins/extra queries
  tasks?: GoalTask[]
  habitLinks?: GoalHabitLink[]
}

export interface GoalTask {
  id: string
  goalId: string
  title: string
  description: string | null
  completed: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface GoalHabitLink {
  id: string
  goalId: string
  habitId: string
  createdAt: string
  // Populated
  habitName?: string | null
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateGoalPayload {
  title: string
  description?: string
  emoji?: string | null
  timeCategory: GoalTimeCategory
  lifeCategory: GoalLifeCategory
}

export interface UpdateGoalPayload {
  title?: string
  description?: string | null
  emoji?: string | null
  timeCategory?: GoalTimeCategory
  lifeCategory?: GoalLifeCategory
  status?: GoalStatus
}

export interface CreateGoalTaskPayload {
  title: string
  description?: string
}

export interface UpdateGoalTaskPayload {
  title?: string
  description?: string | null
  completed?: boolean
}

export interface LinkHabitPayload {
  habitId: string
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface GoalListResponse {
  data: Goal[]
  total: number
  page: number
  pageSize: number
}

export interface GoalProgressResponse {
  totalTasks: number
  completedTasks: number
  progress: number
}

export interface GoalInsights {
  totalGoals: number
  completedGoals: number
  activeGoals: number
  averageProgress: number
  byLifeCategory: GoalCategoryStat[]
  byTimeCategory: GoalCategoryStat[]
}

export interface GoalCategoryStat {
  category: string
  label: string
  count: number
  avgProgress: number
}
