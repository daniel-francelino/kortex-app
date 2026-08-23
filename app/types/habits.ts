// ─── Enums ────────────────────────────────────────────────────────────────────

export enum HabitFrequency {
  Daily = 'daily',
  Weekly = 'weekly',
  Custom = 'custom'
}

export enum HabitDifficulty {
  Tiny = 'tiny',
  Normal = 'normal',
  Hard = 'hard'
}

export enum HabitType {
  Positive = 'positive',
  Negative = 'negative'
}

export enum HabitLogStatus {
  Done = 'done',
  DoneLater = 'done_later',
  Skipped = 'skipped',
  Frozen = 'frozen'
}

export const LOG_STATUS_META: Record<HabitLogStatus, { label: string, icon: string, color: 'success' | 'warning' | 'error' | 'primary' }> = {
  [HabitLogStatus.Done]: { label: 'Feito', icon: 'i-lucide-check-circle', color: 'success' },
  [HabitLogStatus.DoneLater]: { label: 'Feito mais tarde', icon: 'i-lucide-clock-4', color: 'warning' },
  [HabitLogStatus.Skipped]: { label: 'Não feito', icon: 'i-lucide-x-circle', color: 'error' },
  [HabitLogStatus.Frozen]: { label: 'Congelado', icon: 'i-lucide-snowflake', color: 'primary' }
}

export enum CueType {
  Time = 'time',
  Location = 'location',
  PreviousHabit = 'previous_habit',
  Emotion = 'emotion'
}

export enum RewardType {
  Points = 'points',
  Badge = 'badge',
  Unlockable = 'unlockable'
}

// ─── Icon & Color Mappings ────────────────────────────────────────────────────

export const DIFFICULTY_META: Record<HabitDifficulty, { label: string, icon: string, color: 'success' | 'warning' | 'error' }> = {
  [HabitDifficulty.Tiny]: { label: 'Pequeno', icon: 'i-lucide-feather', color: 'success' },
  [HabitDifficulty.Normal]: { label: 'Normal', icon: 'i-lucide-shield', color: 'warning' },
  [HabitDifficulty.Hard]: { label: 'Difícil', icon: 'i-lucide-mountain', color: 'error' }
}

export const FREQUENCY_META: Record<HabitFrequency, { label: string, icon: string }> = {
  [HabitFrequency.Daily]: { label: 'Diário', icon: 'i-lucide-calendar-days' },
  [HabitFrequency.Weekly]: { label: 'Semanal', icon: 'i-lucide-calendar-range' },
  [HabitFrequency.Custom]: { label: 'Personalizado', icon: 'i-lucide-calendar-cog' }
}

export const HABIT_TYPE_META: Record<HabitType, { label: string, icon: string, color: 'success' | 'error' }> = {
  [HabitType.Positive]: { label: 'Positivo', icon: 'i-lucide-thumbs-up', color: 'success' },
  [HabitType.Negative]: { label: 'Negativo', icon: 'i-lucide-thumbs-down', color: 'error' }
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface HabitTag {
  id: string
  userId: string
  name: string
  color: string
  createdAt: string
  updatedAt: string
}

export interface CreateHabitTagPayload {
  name: string
  color?: string
}

export interface Identity {
  id: string
  userId: string
  name: string
  description: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface Habit {
  id: string
  userId: string
  identityId: string | null
  name: string
  avatarEmoji: string | null
  description: string | null
  obviousStrategy: string | null
  attractiveStrategy: string | null
  easyStrategy: string | null
  satisfyingStrategy: string | null
  emergencyVersion: string | null
  frequency: HabitFrequency
  difficulty: HabitDifficulty
  habitType: HabitType
  customDays: number[] | null
  sortOrder: number
  timezone: string | null
  calendarId: string | null
  scheduledTime: string | null
  scheduledEndTime: string | null
  archivedAt: string | null
  createdAt: string
  updatedAt: string
  // Populated via joins
  identity?: Identity | null
  streak?: HabitStreak | null
  tags?: HabitTag[]
  goalLinkId?: string | null
  goalId?: string | null
  goalTitle?: string | null
}

export interface HabitChangeHistory {
  id: string
  habitId: string
  userId: string
  field: string
  oldValue: string | null
  newValue: string | null
  createdAt: string
}

export interface HabitCue {
  id: string
  userId: string
  type: CueType
  timeOfDay: string | null
  location: string | null
  previousHabitId: string | null
  description: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface HabitReward {
  id: string
  userId: string
  type: RewardType
  points: number | null
  badgeKey: string | null
  unlockKey: string | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface HabitSettings {
  habitId: string
  cueId: string | null
  rewardId: string | null
  updatedAt: string
  cue?: HabitCue | null
  reward?: HabitReward | null
}

export interface HabitStack {
  id: string
  userId: string
  triggerHabitId: string
  newHabitId: string
  createdAt: string
  archivedAt: string | null
  triggerHabit?: Habit | null
  newHabit?: Habit | null
}

export interface HabitLog {
  id: string
  userId: string
  habitId: string
  habitVersionId: string
  logDate: string
  completed: boolean
  status: HabitLogStatus
  note: string | null
  createdAt: string
  updatedAt: string
}

export interface HabitVersion {
  id: string
  habitId: string
  userId: string
  identityId: string | null
  name: string
  description: string | null
  obviousStrategy: string | null
  attractiveStrategy: string | null
  easyStrategy: string | null
  satisfyingStrategy: string | null
  frequency: HabitFrequency
  difficulty: HabitDifficulty
  habitType: HabitType
  customDays: number[] | null
  sortOrder: number
  timezone: string | null
  calendarId: string | null
  scheduledTime: string | null
  scheduledEndTime: string | null
  validFrom: string
  validTo: string | null
  createdAt: string
  updatedAt: string
}

export interface HabitStreak {
  habitId: string
  userId: string
  status?: HabitStreakStatus
  currentStreak: number
  longestStreak: number
  lastCompletedDate: string | null
  updatedAt: string
}

export enum HabitStreakStatus {
  Active = 'active',
  Frozen = 'frozen',
  Broken = 'broken'
}

export const HABIT_STREAK_STATUS_META: Record<HabitStreakStatus, { label: string, icon: string, color: 'primary' | 'neutral' | 'warning' | 'error' }> = {
  [HabitStreakStatus.Active]: { label: 'Em dia', icon: 'i-lucide-flame', color: 'warning' },
  [HabitStreakStatus.Frozen]: { label: 'Congelado', icon: 'i-lucide-snowflake', color: 'primary' },
  [HabitStreakStatus.Broken]: { label: 'Quebrado', icon: 'i-lucide-circle-off', color: 'neutral' }
}

export interface HabitReflection {
  id: string
  userId: string
  weekKey: string
  wins: string | null
  improvements: string | null
  createdAt: string
  updatedAt: string
}

// ─── API Payloads ─────────────────────────────────────────────────────────────

export interface CreateHabitPayload {
  name: string
  avatarEmoji?: string
  description?: string
  obviousStrategy?: string
  attractiveStrategy?: string
  easyStrategy?: string
  satisfyingStrategy?: string
  emergencyVersion?: string
  frequency: HabitFrequency
  difficulty: HabitDifficulty
  habitType?: HabitType
  identityId?: string
  calendarId?: string
  customDays?: number[]
  scheduledTime?: string
  scheduledEndTime?: string
  tagIds?: string[]
}

export interface UpdateHabitPayload {
  name?: string
  avatarEmoji?: string | null
  description?: string | null
  obviousStrategy?: string | null
  attractiveStrategy?: string | null
  easyStrategy?: string | null
  satisfyingStrategy?: string | null
  emergencyVersion?: string | null
  frequency?: HabitFrequency
  difficulty?: HabitDifficulty
  habitType?: HabitType
  identityId?: string | null
  calendarId?: string | null
  customDays?: number[]
  sortOrder?: number
  scheduledTime?: string | null
  scheduledEndTime?: string | null
  tagIds?: string[]
}

export interface LogHabitPayload {
  habitId: string
  logDate: string
  completed: boolean
  status?: HabitLogStatus
  note?: string
}

export interface CreateIdentityPayload {
  name: string
  description?: string
}

export interface UpdateIdentityPayload {
  name?: string
  description?: string | null
}

export interface CreateReflectionPayload {
  weekKey: string
  wins?: string
  improvements?: string
}

export interface CreateHabitStackPayload {
  triggerHabitId: string
  newHabitId: string
}

export interface HabitUserSettings {
  userId: string
  reviewDay: number
  reviewReminderEnabled: boolean
  reviewReminderTime: string
  shareToken: string | null
  shareEnabled: boolean
  createdAt: string
  updatedAt: string
}

export interface UpdateHabitUserSettingsPayload {
  reviewDay?: number
  reviewReminderEnabled?: boolean
  reviewReminderTime?: string
  shareEnabled?: boolean
}

export interface SharedHabitsProgress {
  habits: { name: string, frequency: string, difficulty: string, streakCurrent: number }[]
  completionRate7d: number
  completionRate30d: number
  totalHabits: number
}

export interface SharedHabitCardData {
  habit: {
    id: string
    name: string
    avatarEmoji: string | null
    description: string | null
    frequency: string
    difficulty: string
    habitType: string
    scheduledTime: string | null
    createdAt: string
    identityName: string | null
    streakCurrent: number
  }
  completionRate7d: number
  completionRate30d: number
  totalCompletions30d: number
}

// ─── API Responses ────────────────────────────────────────────────────────────

export interface HabitListResponse {
  data: Habit[]
  total: number
  page: number
  pageSize: number
}

export interface TodayHabit extends Habit {
  log?: HabitLog | null
}

export interface TodayHabitTreeNode {
  habit: TodayHabit
  children: TodayHabitTreeNode[]
}

export interface HabitTreeNode {
  habit: Habit
  children: HabitTreeNode[]
}

export interface HabitTreeSyncNode {
  habitId: string
  children: HabitTreeSyncNode[]
}

export interface TodayHabitsResponse {
  habits: TodayHabit[]
  stacks: HabitStack[]
  completedCount: number
  totalCount: number
}

export interface HabitInsights {
  completionRate7d: number
  completionRate30d: number
  averageStreak: number
  bestDay: string | null
  identityProgress: IdentityProgress[]
}

export interface IdentityProgress {
  identity: Identity
  score: number
  totalHabits: number
  completedLogs: number
  scheduledLogs: number
}

export interface CalendarDay {
  date: string
  completed: boolean
  note: string | null
}

export interface HeatmapDay {
  date: string
  count: number
  total: number
  level: number
}

export interface WeeklyRate {
  week: string
  rate: number
}

export interface HeatmapData {
  days: HeatmapDay[]
  weeklyRates: WeeklyRate[]
  totalHabits: number
  selectedYear: number
  availableYears: number[]
}

export interface MoodCorrelationBucket {
  mood: string
  avgCompletionRate: number
  sampleDays: number
}

export interface MoodCorrelationData {
  buckets: MoodCorrelationBucket[]
  insufficientData: boolean
}
