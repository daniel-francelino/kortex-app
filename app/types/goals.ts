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

export enum GoalProgressType {
  Tasks = 'tasks',
  Numeric = 'numeric',
  Monetary = 'monetary'
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
  progressType: GoalProgressType
  targetValue: number | null
  currentValue: number
  unit: string | null
  coverImageUrl: string | null
  // Populated only in the detail endpoint, when the goal has linked habits
  taskProgress?: number
  habitProgress?: number
  combinedProgress?: number
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  // Populated via joins/extra queries
  tasks?: GoalTask[]
  habitLinks?: GoalHabitLink[]
  milestones?: GoalMilestone[]
}

export interface GoalTask {
  id: string
  goalId: string
  title: string
  description: string | null
  completed: boolean
  sortOrder: number
  milestoneId: string | null
  createdAt: string
  updatedAt: string
}

export interface GoalMilestone {
  id: string
  goalId: string
  title: string
  description: string | null
  sortOrder: number
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface GoalReflection {
  id: string
  userId: string
  goalId: string
  weekKey: string
  stillRelevant: boolean | null
  notes: string | null
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
  habitArchivedAt?: string | null
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateGoalPayload {
  title: string
  description?: string
  emoji?: string | null
  timeCategory: GoalTimeCategory
  lifeCategory: GoalLifeCategory
  progressType?: GoalProgressType
  targetValue?: number | null
  currentValue?: number
  unit?: string | null
}

export interface UpdateGoalPayload {
  title?: string
  description?: string | null
  emoji?: string | null
  timeCategory?: GoalTimeCategory
  lifeCategory?: GoalLifeCategory
  status?: GoalStatus
  progressType?: GoalProgressType
  targetValue?: number | null
  currentValue?: number
  unit?: string | null
  coverImageUrl?: string | null
}

export interface CreateGoalTaskPayload {
  title: string
  description?: string
  milestoneId?: string | null
}

export interface UpdateGoalTaskPayload {
  title?: string
  description?: string | null
  completed?: boolean
  milestoneId?: string | null
}

export interface CreateGoalMilestonePayload {
  title: string
  description?: string
}

export interface UpdateGoalMilestonePayload {
  title?: string
  description?: string | null
  completed?: boolean
  sortOrder?: number
}

export interface LinkHabitPayload {
  habitId: string
}

export interface UpsertGoalReflectionPayload {
  weekKey: string
  stillRelevant?: boolean
  notes?: string
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
