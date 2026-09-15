export enum FeedbackType {
  Bug = 'bug',
  Suggestion = 'suggestion',
  Improvement = 'improvement',
  Praise = 'praise'
}

export enum FeedbackStatus {
  Submitted = 'submitted',
  InReview = 'in_review',
  Resolved = 'resolved',
  Closed = 'closed'
}

export enum FeedbackPriority {
  Low = 'low',
  Medium = 'medium',
  High = 'high',
  Critical = 'critical'
}

export interface TechContext {
  route: string
  userAgent: string
  appVersion: string
  screenResolution: string
  timestamp: string
}

export interface FeedbackAttachment {
  id: string
  feedbackId: string
  fileName: string
  fileUrl: string
  fileType: string
  fileSize?: number
  createdAt: string
}

export interface FeedbackResponse {
  id: string
  feedbackId: string
  userId: string
  content: string
  isAdmin: boolean
  createdAt: string
}

export interface FeedbackEntityLink {
  id: string
  feedbackId: string
  entityType: string
  entityId: string
  externalUrl: string | null
  createdAt: string
}

export interface Feedback {
  id: string
  userId: string
  type: FeedbackType
  title: string
  description: string
  techContext: TechContext | null
  status: FeedbackStatus
  priority: FeedbackPriority
  createdAt: string
  updatedAt: string
  attachments?: FeedbackAttachment[]
  responses?: FeedbackResponse[]
  entityLinks?: FeedbackEntityLink[]
}

export interface CreateFeedbackPayload {
  type: FeedbackType
  title: string
  description: string
  techContext?: TechContext | null
}

export interface UpdateFeedbackPayload {
  title?: string
  description?: string
}

export interface AdminUpdateFeedbackPayload {
  status?: FeedbackStatus
  priority?: FeedbackPriority
}

export interface CreateFeedbackResponsePayload {
  content: string
}

export interface CreateEntityLinkPayload {
  entityType: string
  entityId?: string
  externalUrl?: string
}

export interface FeedbackListResponse {
  data: Feedback[]
  total: number
  page: number
  pageSize: number
}

export interface FeedbackInsights {
  total: number
  byType: Record<string, number>
  byStatus: Record<string, number>
  byPriority: Record<string, number>
}

export const feedbackTypeLabels: Record<FeedbackType, string> = {
  [FeedbackType.Bug]: 'Bug',
  [FeedbackType.Suggestion]: 'Sugestão',
  [FeedbackType.Improvement]: 'Melhoria',
  [FeedbackType.Praise]: 'Elogio'
}

export const feedbackTypeIcons: Record<FeedbackType, string> = {
  [FeedbackType.Bug]: 'i-lucide-bug',
  [FeedbackType.Suggestion]: 'i-lucide-lightbulb',
  [FeedbackType.Improvement]: 'i-lucide-trending-up',
  [FeedbackType.Praise]: 'i-lucide-heart'
}

export type BadgeColor = 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral'

export const feedbackTypeColors: Record<FeedbackType, BadgeColor> = {
  [FeedbackType.Bug]: 'error',
  [FeedbackType.Suggestion]: 'info',
  [FeedbackType.Improvement]: 'warning',
  [FeedbackType.Praise]: 'success'
}

export const feedbackStatusLabels: Record<FeedbackStatus, string> = {
  [FeedbackStatus.Submitted]: 'Enviado',
  [FeedbackStatus.InReview]: 'Em análise',
  [FeedbackStatus.Resolved]: 'Resolvido',
  [FeedbackStatus.Closed]: 'Fechado'
}

export const feedbackStatusColors: Record<FeedbackStatus, BadgeColor> = {
  [FeedbackStatus.Submitted]: 'info',
  [FeedbackStatus.InReview]: 'warning',
  [FeedbackStatus.Resolved]: 'success',
  [FeedbackStatus.Closed]: 'neutral'
}

export const feedbackPriorityLabels: Record<FeedbackPriority, string> = {
  [FeedbackPriority.Low]: 'Baixa',
  [FeedbackPriority.Medium]: 'Média',
  [FeedbackPriority.High]: 'Alta',
  [FeedbackPriority.Critical]: 'Crítica'
}

export const feedbackPriorityColors: Record<FeedbackPriority, BadgeColor> = {
  [FeedbackPriority.Low]: 'neutral',
  [FeedbackPriority.Medium]: 'info',
  [FeedbackPriority.High]: 'warning',
  [FeedbackPriority.Critical]: 'error'
}
