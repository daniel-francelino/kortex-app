import type { SupabaseClient } from '@supabase/supabase-js'
import { todayInZone } from '#shared/utils/dateTime'

const HABIT_STACK_SELECT = '*, triggerHabit:habits!trigger_habit_id(id, name), newHabit:habits!new_habit_id(id, name)'

function mapStackHabit(row: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!row) return null

  return {
    id: row.id,
    name: row.name
  }
}

export function mapHabitStack(row: Record<string, unknown>): Record<string, unknown> {
  return {
    id: row.id,
    userId: row.userId ?? row.user_id,
    triggerHabitId: row.triggerHabitId ?? row.trigger_habit_id,
    newHabitId: row.newHabitId ?? row.new_habit_id,
    createdAt: row.createdAt ?? row.created_at,
    archivedAt: row.archivedAt ?? row.archived_at ?? null,
    triggerHabit: mapStackHabit((row.triggerHabit ?? null) as Record<string, unknown> | null),
    newHabit: mapStackHabit((row.newHabit ?? null) as Record<string, unknown> | null)
  }
}

export function mapHabitStacks(rows: Record<string, unknown>[] | null | undefined): Record<string, unknown>[] {
  return (rows ?? []).map(mapHabitStack)
}

function getEndOfDayIso(date: string): string {
  return `${date}T23:59:59.999Z`
}

async function fetchHabitStacksRows(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
  date?: string
): Promise<Record<string, unknown>[]> {
  const isCurrentDate = !date || date === todayInZone(timezone)

  let query = supabase
    .from('habit_stacks')
    .select(HABIT_STACK_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (isCurrentDate) {
    query = query.is('archived_at', null)
  } else {
    const endOfDay = getEndOfDayIso(date)
    query = query
      .lte('created_at', endOfDay)
      .or(`archived_at.is.null,archived_at.gt.${endOfDay}`)
  }

  const { data, error } = await query

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Falha ao buscar empilhamentos',
      data: error.message
    })
  }

  return (data ?? []) as Record<string, unknown>[]
}

export async function resolveHabitStacksForDate(
  supabase: SupabaseClient,
  userId: string,
  timezone: string,
  date?: string
): Promise<Record<string, unknown>[]> {
  const rows = await fetchHabitStacksRows(supabase, userId, timezone, date)
  return mapHabitStacks(rows)
}
