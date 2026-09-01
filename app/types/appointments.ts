// ─── Enums ────────────────────────────────────────────────────────────────────

export enum CalendarVisibility {
  Private = 'private',
  Shared = 'shared',
  Public = 'public'
}

export enum ExceptionType {
  Cancelled = 'cancelled',
  Modified = 'modified'
}

export enum ReminderType {
  Popup = 'popup',
  Email = 'email',
  Push = 'push'
}

export enum RecurrenceFrequency {
  Daily = 'DAILY',
  Weekly = 'WEEKLY',
  Monthly = 'MONTHLY'
}

export enum RsvpStatus {
  Pending = 'pending',
  Accepted = 'accepted',
  Declined = 'declined',
  Tentative = 'tentative'
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface Calendar {
  id: string
  ownerUserId: string
  name: string
  description: string | null
  color: string | null
  visibility: CalendarVisibility
  subscribeToken: string | null
  subscribeEnabled: boolean
  createdAt: string
  updatedAt: string
  archivedAt: string | null
}

export interface CalendarEvent {
  id: string
  calendarId: string
  ownerUserId: string
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  eventTimezone: string
  allDay: boolean
  rrule: string | null
  exdate: string[] | null
  createdAt: string
  updatedAt: string
  archivedAt: string | null
  calendar?: Calendar
  reminders?: EventReminder[]
  exceptions?: EventException[]
  recurrenceId?: string | null
  isRecurring?: boolean
  isCancelled?: boolean
}

export interface EventException {
  id: string
  eventId: string
  type: ExceptionType
  recurrenceId: string
  overrideTitle: string | null
  overrideDescription: string | null
  overrideLocation: string | null
  overrideStartAt: string | null
  overrideEndAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * The scheduling-link booking behind an event, if the event was created by
 * a guest through /agendar/[token] — see server/api/appointments/events/[id]/booking.get.ts
 * and docs/appointments/AUDITORIA_LINK_AGENDAMENTO_UX.md §1.3 item 1.
 */
export interface EventBookingInfo {
  bookingId: string
  guestName: string
  guestEmail: string
  status: string
  schedulingPageId: string
  schedulingPageTitle: string
  answers: { label: string, value: string }[]
}

export interface CalendarShare {
  id: string
  calendarId: string
  ownerId: string
  invitedUserId: string | null
  invitedEmail: string
  permission: 'view' | 'edit'
  status: 'pending' | 'accepted'
  createdAt: string
  updatedAt: string
}

export interface EventParticipant {
  id: string
  eventId: string
  ownerId: string
  invitedUserId: string | null
  invitedEmail: string
  rsvpStatus: RsvpStatus
  createdAt: string
  updatedAt: string
}

export interface InviteParticipantPayload {
  email: string
}

export interface UpdateRsvpPayload {
  rsvpStatus: RsvpStatus.Accepted | RsvpStatus.Declined | RsvpStatus.Tentative
}

export interface EventReminder {
  id: string
  eventId: string
  userId: string
  type: ReminderType
  minutesBefore: number
  createdAt: string
  updatedAt: string
}

// ─── Expanded Occurrence ──────────────────────────────────────────────────────

export interface EventOccurrence {
  eventId: string
  title: string
  description: string | null
  location: string | null
  startAt: string
  endAt: string
  allDay: boolean
  calendarId: string
  calendarColor: string | null
  calendarName: string
  isRecurring: boolean
  recurrenceId: string | null
  isCancelled: boolean
  isModified: boolean
}

// ─── Payloads ─────────────────────────────────────────────────────────────────

export interface CreateCalendarPayload {
  name: string
  description?: string
  color?: string
  visibility?: CalendarVisibility
}

export interface UpdateCalendarPayload {
  name?: string
  description?: string | null
  color?: string | null
  visibility?: CalendarVisibility
  subscribeEnabled?: boolean
}

export interface CreateEventPayload {
  calendarId: string
  title: string
  description?: string
  location?: string
  startAt: string
  endAt: string
  eventTimezone: string
  allDay?: boolean
  rrule?: string
  reminders?: ReminderInput[]
}

export interface UpdateEventPayload {
  title?: string
  description?: string | null
  location?: string | null
  startAt?: string
  endAt?: string
  eventTimezone?: string
  allDay?: boolean
  rrule?: string | null
  calendarId?: string
}

export interface ReminderInput {
  type: ReminderType
  minutesBefore: number
}

export interface CancelOccurrencePayload {
  recurrenceId: string
}

export interface ModifyOccurrencePayload {
  recurrenceId: string
  title?: string
  description?: string | null
  location?: string | null
  startAt?: string
  endAt?: string
}

export interface SplitSeriesPayload {
  recurrenceId: string
  title?: string
  description?: string | null
  location?: string | null
  startAt?: string
  endAt?: string
}

// ─── Responses ────────────────────────────────────────────────────────────────

export interface EventsListResponse {
  data: CalendarEvent[]
  total: number
  page: number
  pageSize: number
}
