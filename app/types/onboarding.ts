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

export type OnboardingStep = typeof ONBOARDING_STEPS[number]
export type OnboardingStatus = typeof ONBOARDING_STATUSES[number]
export type OnboardingPrimaryGoal = typeof ONBOARDING_PRIMARY_GOALS[number]
export type OnboardingExperienceLevel = typeof ONBOARDING_EXPERIENCE_LEVELS[number]
export type OnboardingGuidanceStyle = typeof ONBOARDING_GUIDANCE_STYLES[number]

export interface OnboardingProfile {
  primaryGoal: OnboardingPrimaryGoal | null
  experienceLevel: OnboardingExperienceLevel | null
  guidanceStyle: OnboardingGuidanceStyle | null
}

export interface OnboardingState {
  status: OnboardingStatus
  currentStep: OnboardingStep
  startedAt: string | null
  completedAt: string | null
  profile: OnboardingProfile
}

export interface OnboardingResponse {
  onboarding: OnboardingState
  // `null` = never explicitly chosen yet (docs/timezone/ANALISE_TIMEZONE.md,
  // Regra 2) — distinct from an explicit 'UTC' choice.
  timezone: string | null
}
