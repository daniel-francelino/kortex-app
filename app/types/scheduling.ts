// ─── Enums ────────────────────────────────────────────────────────────────────

export enum SchedulingLocationType {
  VideoLink = 'video_link',
  Phone = 'phone',
  InPerson = 'in_person',
  Custom = 'custom'
}

export enum BookingStatus {
  Confirmed = 'confirmed',
  Cancelled = 'cancelled',
  Rescheduled = 'rescheduled',
  Pending = 'pending'
}

export enum SchedulingQuestionType {
  Text = 'text',
  Textarea = 'textarea',
  Select = 'select'
}

export const LOCATION_TYPE_META: Record<SchedulingLocationType, { label: string, icon: string }> = {
  [SchedulingLocationType.VideoLink]: { label: 'Link de vídeo', icon: 'i-lucide-video' },
  [SchedulingLocationType.Phone]: { label: 'Telefone', icon: 'i-lucide-phone' },
  [SchedulingLocationType.InPerson]: { label: 'Presencial', icon: 'i-lucide-map-pin' },
  [SchedulingLocationType.Custom]: { label: 'Outro', icon: 'i-lucide-ellipsis' }
}

// ─── Entities ─────────────────────────────────────────────────────────────────

export interface AvailabilityRule {
  id: string
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface SchedulingQuestion {
  id: string
  label: string
  type: SchedulingQuestionType
  isRequired: boolean
  isHidden: boolean
  options: string[] | null
  sortOrder: number
}

export interface SchedulingPage {
  id: string
  userId: string
  calendarId: string
  title: string
  description: string | null
  durationMinutes: number
  locationType: SchedulingLocationType
  locationDetails: string | null
  timezone: string
  color: string | null
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  slotIncrementMinutes: number
  minNoticeHours: number
  maxAdvanceDays: number
  maxBookingsPerDay: number | null
  calendarEventTitleTemplate: string | null
  cancellationEnabled: boolean
  rescheduleEnabled: boolean
  cancellationMinNoticeHours: number | null
  cancellationReasonRequired: boolean
  hideDetailsOnManagePage: boolean
  requiresConfirmation: boolean
  shareToken: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  availabilityRules?: AvailabilityRule[]
  questions?: SchedulingQuestion[]
  bookingsCount?: number
}

export interface Booking {
  id: string
  schedulingPageId: string
  eventId: string
  guestName: string
  guestEmail: string
  guestTimezone: string
  answers: Record<string, string>
  status: BookingStatus
  manageToken: string
  cancellationReason: string | null
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
  /** Real appointment time, joined from `events` — null only if the join failed to resolve. */
  startAt: string | null
  endAt: string | null
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface AvailabilityRuleInput {
  dayOfWeek: number
  startTime: string
  endTime: string
}

export interface SchedulingQuestionInput {
  label: string
  type: SchedulingQuestionType
  isRequired?: boolean
  isHidden?: boolean
  options?: string[]
  sortOrder?: number
}

export interface CreateSchedulingPagePayload {
  calendarId: string
  title: string
  description?: string
  durationMinutes: number
  locationType?: SchedulingLocationType
  locationDetails?: string
  timezone: string
  color?: string | null
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
  slotIncrementMinutes?: number
  minNoticeHours?: number
  maxAdvanceDays?: number
  maxBookingsPerDay?: number | null
  calendarEventTitleTemplate?: string | null
  cancellationEnabled?: boolean
  rescheduleEnabled?: boolean
  cancellationMinNoticeHours?: number | null
  cancellationReasonRequired?: boolean
  hideDetailsOnManagePage?: boolean
  requiresConfirmation?: boolean
  availabilityRules: AvailabilityRuleInput[]
  questions?: SchedulingQuestionInput[]
}

export type UpdateSchedulingPagePayload = Partial<CreateSchedulingPagePayload> & { isActive?: boolean }

// ─── Public-facing shapes ───────────────────────────────────────────────────

export interface PublicSchedulingPage {
  title: string
  description: string | null
  durationMinutes: number
  locationType: SchedulingLocationType
  locationDetails: string | null
  hostName: string
  hostAvatarUrl: string | null
  maxAdvanceDays: number
  requiresConfirmation: boolean
  questions: SchedulingQuestion[]
}

export interface AvailabilitySlot {
  startAt: string
  endAt: string
}

export interface CreateBookingPayload {
  startAt: string
  guestName: string
  guestEmail: string
  guestTimezone: string
  answers?: Record<string, string>
}

export interface BookingConfirmation {
  booking: Booking
  manageUrl: string
}

export interface PublicBookingDetail {
  guestName: string
  guestEmail: string
  guestTimezone: string
  status: BookingStatus
  startAt: string
  endAt: string
  pageTitle: string
  hostName: string
  locationType: SchedulingLocationType
  locationDetails: string | null
  schedulingPageToken: string
  cancellationEnabled: boolean
  rescheduleEnabled: boolean
  cancellationMinNoticeHours: number | null
  cancellationReasonRequired: boolean
  hideDetailsOnManagePage: boolean
}
