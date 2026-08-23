// ─── Enums ────────────────────────────────────────────────────────────────────

export enum EntityType {
  Habit = 'habit',
  Goal = 'goal',
  Task = 'task',
  Event = 'event',
  JournalEntry = 'journal_entry'
}

export enum DefaultLifeArea {
  Health = 'Saúde',
  Career = 'Carreira',
  Finance = 'Finanças',
  Learning = 'Aprendizado',
  Relationships = 'Relacionamentos',
  Spiritual = 'Espiritual',
  Lifestyle = 'Estilo de vida'
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface LifeArea {
  id: string
  userId: string
  name: string
  createdAt: string
  updatedAt: string
}

export interface EntityLink {
  id: string
  userId: string
  sourceType: EntityType
  sourceId: string
  targetType: EntityType
  targetId: string
  createdAt: string
  // Populated labels (resolved server-side)
  sourceLabel?: string | null
  targetLabel?: string | null
}

// ─── Dashboard Aggregate ──────────────────────────────────────────────────────

export interface DashboardHabit {
  id: string
  name: string
  frequency: string
  difficulty: string
  completed: boolean
  streakCurrent: number
}

export interface DashboardTask {
  id: string
  title: string
  priority: string
  status: string
  dueDate: string | null
  listName: string | null
}

export interface DashboardEvent {
  id: string
  title: string
  startAt: string
  endAt: string
  allDay: boolean
  calendarName: string
  calendarColor: string | null
}

export interface DashboardJournal {
  id: string | null
  entryDate: string
  title: string | null
  contentPreview: string | null
  exists: boolean
  locked: boolean
  encrypted: boolean
}

export interface DailyDashboardResponse {
  date: string
  habits: {
    items: DashboardHabit[]
    completedCount: number
    totalCount: number
  }
  tasks: {
    items: DashboardTask[]
    pendingCount: number
    overdueCount: number
  }
  events: {
    items: DashboardEvent[]
    totalCount: number
  }
  journal: DashboardJournal
}

// ─── Insights ─────────────────────────────────────────────────────────────────

export interface LifeInsights {
  period: string
  habits: {
    completionRate7d: number
    completionRate30d: number
    averageStreak: number
    totalActive: number
  }
  tasks: {
    completedLast7d: number
    completedLast30d: number
    pendingCount: number
    overdueCount: number
  }
  goals: {
    totalActive: number
    averageProgress: number
    completedCount: number
  }
  journal: {
    entriesLast7d: number
    entriesLast30d: number
    currentStreak: number
  }
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateEntityLinkPayload {
  sourceType: EntityType
  sourceId: string
  targetType: EntityType
  targetId: string
}

export interface CreateLifeAreaPayload {
  name: string
}

export interface UpdateLifeAreaPayload {
  name: string
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface LifeAreaListResponse {
  data: LifeArea[]
  total: number
}

export interface EntityLinkListResponse {
  data: EntityLink[]
  total: number
  page: number
  pageSize: number
}
