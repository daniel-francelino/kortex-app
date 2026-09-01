import { z } from 'zod'
import { isValidTimeZone } from './user-timezone'

export const ONBOARDING_STEPS = [
  'welcome',
  'profile',
  'minimum_setup',
  'product_tour',
  'first_action'
] as const

export const ONBOARDING_STATUSES = [
  'not_started',
  'in_progress',
  'completed'
] as const

export const ONBOARDING_PRIMARY_GOALS = [
  'consistency',
  'productivity',
  'wellbeing',
  'identity'
] as const

export const ONBOARDING_EXPERIENCE_LEVELS = [
  'new',
  'returning',
  'structured'
] as const

export const ONBOARDING_GUIDANCE_STYLES = [
  'guided',
  'flexible'
] as const

export const onboardingProfileSchema = z.object({
  primaryGoal: z.enum(ONBOARDING_PRIMARY_GOALS).nullable().default(null),
  experienceLevel: z.enum(ONBOARDING_EXPERIENCE_LEVELS).nullable().default(null),
  guidanceStyle: z.enum(ONBOARDING_GUIDANCE_STYLES).nullable().default(null)
})

export const onboardingStateSchema = z.object({
  status: z.enum(ONBOARDING_STATUSES).default('not_started'),
  currentStep: z.enum(ONBOARDING_STEPS).default('welcome'),
  startedAt: z.string().datetime().nullable().default(null),
  completedAt: z.string().datetime().nullable().default(null),
  profile: onboardingProfileSchema.default({
    primaryGoal: null,
    experienceLevel: null,
    guidanceStyle: null
  })
})

export const onboardingUpdateSchema = z.object({
  currentStep: z.enum(ONBOARDING_STEPS).optional(),
  profile: onboardingProfileSchema.partial().optional(),
  status: z.enum(ONBOARDING_STATUSES).optional(),
  timezone: z.string().refine(isValidTimeZone, { message: 'Timezone inválido' }).optional(),
  markCompleted: z.boolean().optional()
})

export type StoredOnboardingState = z.output<typeof onboardingStateSchema>
export type OnboardingUpdatePayload = z.output<typeof onboardingUpdateSchema>

export function getDefaultOnboardingState(): StoredOnboardingState {
  return onboardingStateSchema.parse({})
}

export function parseOnboardingState(value: unknown): StoredOnboardingState {
  const parsed = onboardingStateSchema.safeParse(value)
  if (parsed.success)
    return parsed.data

  return getDefaultOnboardingState()
}

export function mergeOnboardingState(
  existing: StoredOnboardingState,
  payload: OnboardingUpdatePayload
): StoredOnboardingState {
  const now = new Date().toISOString()

  const next: StoredOnboardingState = {
    ...existing,
    currentStep: payload.currentStep ?? existing.currentStep,
    profile: {
      ...existing.profile,
      ...(payload.profile ?? {})
    },
    status: payload.status ?? existing.status
  }

  const shouldStart = next.status === 'in_progress'
    || payload.currentStep !== undefined
    || payload.profile !== undefined

  if (shouldStart && !next.startedAt)
    next.startedAt = now

  if (payload.markCompleted) {
    next.status = 'completed'
    next.currentStep = 'first_action'
    next.completedAt = now
    if (!next.startedAt)
      next.startedAt = now
    return next
  }

  if (next.status !== 'completed') {
    next.completedAt = null
    if (shouldStart && next.status === 'not_started')
      next.status = 'in_progress'
  }

  return next
}
