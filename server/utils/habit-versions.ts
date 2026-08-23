import type { SupabaseClient } from '@supabase/supabase-js'

type HabitVersionShape = {
  habit_id: string
  user_id: string
  identity_id: string | null
  name: string
  avatar_emoji: string | null
  description: string | null
  obvious_strategy: string | null
  attractive_strategy: string | null
  easy_strategy: string | null
  satisfying_strategy: string | null
  frequency: string
  difficulty: string
  habit_type: string
  custom_days: number[] | null
  sort_order: number
  timezone: string | null
  calendar_id: string | null
  scheduled_time: string | null
  scheduled_end_time: string | null
  emergency_version: string | null
}

type HabitVersionRow = HabitVersionShape & {
  id: string
  valid_from: string
  valid_to: string | null
}

function getDateOnly(date: Date = new Date()): string {
  return date.toISOString().split('T')[0] as string
}

function getPreviousDate(date: string): string {
  const current = new Date(`${date}T12:00:00Z`)
  current.setUTCDate(current.getUTCDate() - 1)
  return getDateOnly(current)
}

function normalizeCustomDays(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) return null
  return value.map(day => Number(day))
}

function areArraysEqual(left: number[] | null, right: number[] | null): boolean {
  if (left === null && right === null) return true
  if (left === null || right === null) return false
  if (left.length !== right.length) return false
  return left.every((value, index) => value === right[index])
}

export function toHabitVersionShape(row: Record<string, unknown>): HabitVersionShape {
  return {
    habit_id: String(row.id),
    user_id: String(row.user_id ?? row.userId),
    identity_id: (row.identity_id ?? row.identityId ?? null) as string | null,
    name: String(row.name ?? ''),
    avatar_emoji: (row.avatar_emoji ?? row.avatarEmoji ?? null) as string | null,
    description: (row.description ?? null) as string | null,
    obvious_strategy: (row.obvious_strategy ?? row.obviousStrategy ?? null) as string | null,
    attractive_strategy: (row.attractive_strategy ?? row.attractiveStrategy ?? null) as string | null,
    easy_strategy: (row.easy_strategy ?? row.easyStrategy ?? null) as string | null,
    satisfying_strategy: (row.satisfying_strategy ?? row.satisfyingStrategy ?? null) as string | null,
    frequency: String(row.frequency ?? 'daily'),
    difficulty: String(row.difficulty ?? 'normal'),
    habit_type: String(row.habit_type ?? row.habitType ?? 'positive'),
    custom_days: normalizeCustomDays(row.custom_days ?? row.customDays ?? null),
    sort_order: Number(row.sort_order ?? row.sortOrder ?? 0),
    timezone: (row.timezone ?? null) as string | null,
    calendar_id: (row.calendar_id ?? row.calendarId ?? null) as string | null,
    scheduled_time: (row.scheduled_time ?? row.scheduledTime ?? null) as string | null,
    scheduled_end_time: (row.scheduled_end_time ?? row.scheduledEndTime ?? null) as string | null,
    emergency_version: (row.emergency_version ?? row.emergencyVersion ?? null) as string | null
  }
}

export function hasVersionedHabitChanges(current: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const currentVersion = toHabitVersionShape(current)
  const nextVersion = toHabitVersionShape(next)

  return currentVersion.identity_id !== nextVersion.identity_id
    || currentVersion.name !== nextVersion.name
    || currentVersion.avatar_emoji !== nextVersion.avatar_emoji
    || currentVersion.description !== nextVersion.description
    || currentVersion.obvious_strategy !== nextVersion.obvious_strategy
    || currentVersion.attractive_strategy !== nextVersion.attractive_strategy
    || currentVersion.easy_strategy !== nextVersion.easy_strategy
    || currentVersion.satisfying_strategy !== nextVersion.satisfying_strategy
    || currentVersion.frequency !== nextVersion.frequency
    || currentVersion.difficulty !== nextVersion.difficulty
    || currentVersion.habit_type !== nextVersion.habit_type
    || !areArraysEqual(currentVersion.custom_days, nextVersion.custom_days)
    || currentVersion.sort_order !== nextVersion.sort_order
    || currentVersion.timezone !== nextVersion.timezone
    || currentVersion.calendar_id !== nextVersion.calendar_id
    || currentVersion.scheduled_time !== nextVersion.scheduled_time
    || currentVersion.scheduled_end_time !== nextVersion.scheduled_end_time
    || currentVersion.emergency_version !== nextVersion.emergency_version
}

export async function createInitialHabitVersion(
  supabase: SupabaseClient,
  habit: Record<string, unknown>,
  effectiveDate: string = getDateOnly()
): Promise<void> {
  const version = {
    ...toHabitVersionShape(habit),
    valid_from: effectiveDate,
    valid_to: null,
    updated_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('habit_versions')
    .upsert(version, { onConflict: 'habit_id,valid_from' })

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar versão inicial do hábito', data: error.message })
  }
}

export async function syncHabitVersion(
  supabase: SupabaseClient,
  habit: Record<string, unknown>,
  effectiveDate: string = getDateOnly()
): Promise<void> {
  const { data: activeVersion, error: versionError } = await supabase
    .from('habit_versions')
    .select('id, valid_from, valid_to')
    .eq('habit_id', habit.id)
    .eq('user_id', habit.user_id ?? habit.userId)
    .is('valid_to', null)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle<HabitVersionRow>()

  if (versionError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar versão ativa do hábito', data: versionError.message })
  }

  const versionPayload = {
    ...toHabitVersionShape(habit),
    updated_at: new Date().toISOString()
  }

  if (!activeVersion) {
    await createInitialHabitVersion(supabase, habit, effectiveDate)
    return
  }

  if (activeVersion.valid_from === effectiveDate) {
    const { error: updateError } = await supabase
      .from('habit_versions')
      .update(versionPayload)
      .eq('id', activeVersion.id)

    if (updateError) {
      throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar versão do hábito', data: updateError.message })
    }

    return
  }

  const previousDate = getPreviousDate(effectiveDate)

  const { error: closeError } = await supabase
    .from('habit_versions')
    .update({ valid_to: previousDate, updated_at: new Date().toISOString() })
    .eq('id', activeVersion.id)

  if (closeError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao encerrar versão anterior do hábito', data: closeError.message })
  }

  const { error: insertError } = await supabase
    .from('habit_versions')
    .upsert({
      ...versionPayload,
      valid_from: effectiveDate,
      valid_to: null
    }, { onConflict: 'habit_id,valid_from' })

  if (insertError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar nova versão do hábito', data: insertError.message })
  }
}

export async function resolveHabitVersionIdForDate(
  supabase: SupabaseClient,
  habitId: string,
  userId: string,
  logDate: string
): Promise<string> {
  const { data, error } = await supabase
    .from('habit_versions')
    .select('id')
    .eq('habit_id', habitId)
    .eq('user_id', userId)
    .lte('valid_from', logDate)
    .or(`valid_to.is.null,valid_to.gte.${logDate}`)
    .order('valid_from', { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao resolver versão do hábito para o registro', data: error.message })
  }

  if (!data?.id) {
    throw createError({ statusCode: 409, statusMessage: 'Nenhuma versão do hábito encontrada para a data do registro' })
  }

  return data.id
}

export type ResolvedVersionedHabit = {
  version: Record<string, unknown>
  identity: Record<string, unknown> | null
  streak: Record<string, unknown> | null
  archivedAt: string | null
}

/**
 * Resolves all habits that were valid for a user on a specific date,
 * using habit_versions for historical accuracy. Includes identity and streak data.
 * Excludes habits that were already archived before the requested date.
 */
export async function resolveHabitsForDate(
  supabase: SupabaseClient,
  userId: string,
  date: string
): Promise<ResolvedVersionedHabit[]> {
  // 1. Get all versions valid for the date
  const { data: versions, error: versionsError } = await supabase
    .from('habit_versions')
    .select('*')
    .eq('user_id', userId)
    .lte('valid_from', date)
    .or(`valid_to.is.null,valid_to.gte.${date}`)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (versionsError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar versões de hábitos', data: versionsError.message })
  }

  if (!versions || versions.length === 0) return []

  const habitIds = [...new Set(versions.map((v: Record<string, unknown>) => v.habit_id as string))]

  // 2. Get habits for archived_at + streaks
  const { data: habitsData, error: habitsError } = await supabase
    .from('habits')
    .select('id, archived_at, streak:habit_streaks(*)')
    .in('id', habitIds)
    .eq('user_id', userId)

  if (habitsError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao buscar dados dos hábitos', data: habitsError.message })
  }

  const habitsLookup: Record<string, Record<string, unknown>> = Object.fromEntries(
    (habitsData ?? []).map((h: Record<string, unknown>) => [h.id as string, h])
  )

  // 3. Get identities
  const identityIds = [...new Set(
    versions
      .map((v: Record<string, unknown>) => v.identity_id as string | null)
      .filter(Boolean)
  )]

  let identitiesLookup: Record<string, Record<string, unknown>> = {}

  if (identityIds.length > 0) {
    const { data: identities } = await supabase
      .from('identities')
      .select('*')
      .in('id', identityIds)

    identitiesLookup = Object.fromEntries(
      (identities ?? []).map((i: Record<string, unknown>) => [i.id as string, i])
    )
  }

  // 4. Build result, filtering out habits archived before the date
  const result: ResolvedVersionedHabit[] = []

  for (const version of versions as Record<string, unknown>[]) {
    const habitId = version.habit_id as string
    const habit = habitsLookup[habitId]
    if (!habit) continue

    const archivedAt = (habit.archived_at as string | null) ?? null
    if (archivedAt) {
      const archivedDate = archivedAt.split('T')[0]!
      if (archivedDate <= date) continue
    }

    const identityId = version.identity_id as string | null
    const identity = identityId ? (identitiesLookup[identityId] ?? null) : null

    const streakRaw = habit.streak as Record<string, unknown> | Record<string, unknown>[] | null
    const streak = Array.isArray(streakRaw) ? (streakRaw[0] as Record<string, unknown> ?? null) : streakRaw

    result.push({ version, identity, streak, archivedAt })
  }

  return result
}
