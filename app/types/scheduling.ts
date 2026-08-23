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
  Rescheduled = 'rescheduled'
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
  bufferBeforeMinutes: number
  bufferAfterMinutes: number
  slotIncrementMinutes: number
  minNoticeHours: number
  maxAdvanceDays: number
  maxBookingsPerDay: number | null
  shareToken: string
  isActive: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  availabilityRules?: AvailabilityRule[]
  questions?: SchedulingQuestion[]
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
  createdAt: string
  updatedAt: string
  cancelledAt: string | null
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
  bufferBeforeMinutes?: number
  bufferAfterMinutes?: number
  slotIncrementMinutes?: number
  minNoticeHours?: number
  maxAdvanceDays?: number
  maxBookingsPerDay?: number | null
  availabilityRules: AvailabilityRuleInput[]
  questions?: SchedulingQuestionInput[]
}

export type UpdateSchedulingPagePayload = Partial<CreateSchedulingPagePayload>

// ─── Public-facing shapes ───────────────────────────────────────────────────

export interface PublicSchedulingPage {
  title: string
  description: string | null
  durationMinutes: number
  locationType: SchedulingLocationType
  locationDetails: string | null
  hostName: string
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
}
