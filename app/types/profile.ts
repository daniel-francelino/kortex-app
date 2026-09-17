import type { SchedulingLocationType } from './scheduling'

/** One card in the public profile's event-type list — a narrow, public-safe
 * projection of SchedulingPage (never exposes id/calendarId/shareToken). */
export interface PublicEventTypeSummary {
  slug: string
  title: string
  description: string | null
  durationMinutes: number
  locationType: SchedulingLocationType
  color: string | null
  coverImageUrl: string | null
  requiresConfirmation: boolean
}

export interface PublicProfile {
  username: string
  name: string
  avatarUrl: string | null
  bio: string | null
  eventTypes: PublicEventTypeSummary[]
}

export interface UsernameCheckResult {
  available: boolean
  reason?: 'format' | 'reserved' | 'taken'
}
