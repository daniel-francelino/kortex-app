import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapHabitList, fetchHabitTagMap, fetchHabitGoalMap } from '../../utils/habits'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
  difficulty: z.enum(['tiny', 'normal', 'hard']).optional(),
  identityId: z.string().uuid().optional(),
  search: z.string().max(200).optional(),
  archived: z
    .preprocess((value) => {
      if (value === undefined) return undefined
      if (typeof value === 'boolean') return value
      if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase()
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true
        if (['false', '0', 'no', 'off'].includes(normalized)) return false
      }
      return value
    }, z.boolean())
    .default(false)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const supabase = getSupabaseAdminClient()

  const from = (params.page - 1) * params.pageSize
  const to = from + params.pageSize - 1

  let qb = supabase
    .from('habits')
    .select('*, identity:identities(*), streak:habit_streaks(*)')
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (params.archived) {
    qb = qb.not('archived_at', 'is', null)
  } else {
    qb = qb.is('archived_at', null)
  }

  if (params.frequency) {
    qb = qb.eq('frequency', params.frequency)
  }

  if (params.difficulty) {
    qb = qb.eq('difficulty', params.difficulty)
  }

  if (params.identityId) {
    qb = qb.eq('identity_id', params.identityId)
  }

  if (params.search) {
    qb = qb.ilike('name', `%${params.search}%`)
  }

  const [{ data, error }, { data: stacksData, error: stacksError }] = await Promise.all([
    qb,
    supabase
      .from('habit_stacks')
      .select('trigger_habit_id, new_habit_id')
      .eq('user_id', user.id)
      .is('archived_at', null)
  ])

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch habits', data: error.message })
  }

  if (stacksError) {
    throw createError({ statusCode: 500, statusMessage: 'Failed to fetch habit stacks', data: stacksError.message })
  }

  const habitIds = (data ?? []).map((h: Record<string, unknown>) => String(h.id))
  const [tagMap, goalMap] = await Promise.all([
    fetchHabitTagMap(supabase, habitIds),
    fetchHabitGoalMap(supabase, habitIds)
  ])

  const habits = mapHabitList((data ?? []) as Record<string, unknown>[], tagMap, goalMap)
  const visibleHabitIds = new Set(habits.map(habit => String(habit.id)))
  const habitsById = new Map(habits.map(habit => [String(habit.id), habit] as const))
  const childrenByParent = new Map<string, string[]>()
  const parentsByChild = new Map<string, string[]>()

  for (const stack of (stacksData ?? []) as Array<Record<string, unknown>>) {
    const parentId = String(stack.trigger_habit_id ?? '')
    const childId = String(stack.new_habit_id ?? '')

    if (!visibleHabitIds.has(parentId) || !visibleHabitIds.has(childId)) {
      continue
    }

    const parentChildren = childrenByParent.get(parentId) ?? []
    if (!parentChildren.includes(childId)) {
      parentChildren.push(childId)
      parentChildren.sort((left, right) => {
        const leftHabit = habitsById.get(left)
        const rightHabit = habitsById.get(right)
        const leftSortOrder = Number(leftHabit?.sortOrder ?? 0)
        const rightSortOrder = Number(rightHabit?.sortOrder ?? 0)

        if (leftSortOrder !== rightSortOrder) {
          return leftSortOrder - rightSortOrder
        }

        return String(leftHabit?.name ?? '').localeCompare(String(rightHabit?.name ?? ''), 'pt-BR')
      })
      childrenByParent.set(parentId, parentChildren)
    }

    const childParents = parentsByChild.get(childId) ?? []
    if (!childParents.includes(parentId)) {
      childParents.push(parentId)
      parentsByChild.set(childId, childParents)
    }
  }

  const rootIds: string[] = []
  const registeredRoots = new Set<string>()

  for (const habit of habits) {
    const habitId = String(habit.id)
    const visibleParents = parentsByChild.get(habitId) ?? []

    if (visibleParents.length === 0 && !registeredRoots.has(habitId)) {
      registeredRoots.add(habitId)
      rootIds.push(habitId)
    }
  }

  for (const habit of habits) {
    const habitId = String(habit.id)
    if (!registeredRoots.has(habitId)) {
      registeredRoots.add(habitId)
      rootIds.push(habitId)
    }
  }

  const pagedRootIds = rootIds.slice(from, to + 1)
  const pageIds: string[] = []
  const visited = new Set<string>()

  function appendBranch(habitId: string) {
    if (visited.has(habitId)) return

    const habit = habitsById.get(habitId)
    if (!habit) return

    visited.add(habitId)
    pageIds.push(habitId)

    for (const childId of childrenByParent.get(habitId) ?? []) {
      appendBranch(childId)
    }
  }

  for (const rootId of pagedRootIds) {
    appendBranch(rootId)
  }

  return {
    data: pageIds
      .map(habitId => habitsById.get(habitId))
      .filter((habit): habit is NonNullable<(typeof habits)[number]> => Boolean(habit)),
    total: rootIds.length,
    page: params.page,
    pageSize: params.pageSize
  }
})
