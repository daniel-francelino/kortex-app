import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { sanitizeRichTextHtml } from '../../utils/rich-text'
import { mapHabit, fetchHabitTagMap } from '../../utils/habits'
import { hasVersionedHabitChanges, syncHabitVersion, toHabitVersionShape } from '../../utils/habit-versions'
import { syncHabitLinkedEvent } from '../../utils/habit-event-sync'

const paramsSchema = z.object({
  id: z.string().uuid()
})

const bodySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  avatarEmoji: z.string().max(16).nullable().optional(),
  description: z.string().max(5000).nullable().optional(),
  obviousStrategy: z.string().max(5000).nullable().optional(),
  attractiveStrategy: z.string().max(5000).nullable().optional(),
  easyStrategy: z.string().max(5000).nullable().optional(),
  satisfyingStrategy: z.string().max(5000).nullable().optional(),
  emergencyVersion: z.string().max(500).nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'custom']).optional(),
  difficulty: z.enum(['tiny', 'normal', 'hard']).optional(),
  habitType: z.enum(['positive', 'negative']).optional(),
  identityId: z.string().uuid().nullable().optional(),
  calendarId: z.string().uuid().nullable().optional(),
  customDays: z.array(z.number().int().min(0).max(6)).optional(),
  sortOrder: z.number().int().min(0).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm').nullable().optional(),
  scheduledEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm').nullable().optional(),
  tagIds: z.array(z.string().uuid()).optional()
})

/** Fields to track in change history */
const TRACKED_FIELDS = ['difficulty', 'frequency', 'identityId', 'habitType'] as const

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const { id } = paramsSchema.parse(getRouterParams(event))
  const body = await readBody(event)
  const parsed = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  if (parsed.calendarId) {
    const { data: calendar, error: calendarError } = await supabase
      .from('calendars')
      .select('id')
      .eq('id', parsed.calendarId)
      .eq('owner_user_id', user.id)
      .is('archived_at', null)
      .single()

    if (calendarError || !calendar) {
      throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
    }
  }

  // Fetch current habit to compare tracked fields
  const { data: current, error: fetchError } = await supabase
    .from('habits')
    .select('id, user_id, identity_id, name, avatar_emoji, description, obvious_strategy, attractive_strategy, easy_strategy, satisfying_strategy, emergency_version, frequency, difficulty, habit_type, custom_days, sort_order, timezone, calendar_id, scheduled_time, scheduled_end_time')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchError || !current) {
    throw createError({ statusCode: 404, statusMessage: 'Hábito não encontrado' })
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (parsed.name !== undefined) updateData.name = parsed.name
  if (parsed.avatarEmoji !== undefined) updateData.avatar_emoji = parsed.avatarEmoji
  if (parsed.description !== undefined) updateData.description = sanitizeRichTextHtml(parsed.description)
  if (parsed.obviousStrategy !== undefined) updateData.obvious_strategy = sanitizeRichTextHtml(parsed.obviousStrategy)
  if (parsed.attractiveStrategy !== undefined) updateData.attractive_strategy = sanitizeRichTextHtml(parsed.attractiveStrategy)
  if (parsed.easyStrategy !== undefined) updateData.easy_strategy = sanitizeRichTextHtml(parsed.easyStrategy)
  if (parsed.satisfyingStrategy !== undefined) updateData.satisfying_strategy = sanitizeRichTextHtml(parsed.satisfyingStrategy)
  if (parsed.emergencyVersion !== undefined) updateData.emergency_version = parsed.emergencyVersion?.trim() || null
  if (parsed.frequency !== undefined) updateData.frequency = parsed.frequency
  if (parsed.difficulty !== undefined) updateData.difficulty = parsed.difficulty
  if (parsed.habitType !== undefined) updateData.habit_type = parsed.habitType
  if (parsed.identityId !== undefined) updateData.identity_id = parsed.identityId
  if (parsed.calendarId !== undefined) updateData.calendar_id = parsed.calendarId
  if (parsed.customDays !== undefined) updateData.custom_days = parsed.customDays
  if (parsed.sortOrder !== undefined) updateData.sort_order = parsed.sortOrder
  if (parsed.scheduledTime !== undefined) updateData.scheduled_time = parsed.scheduledTime
  if (parsed.scheduledEndTime !== undefined) updateData.scheduled_end_time = parsed.scheduledEndTime

  const nextVersionCandidate = {
    ...(current as Record<string, unknown>),
    ...toHabitVersionShape(current as Record<string, unknown>),
    ...updateData,
    id,
    user_id: user.id
  }

  const shouldRotateVersion = hasVersionedHabitChanges(current as Record<string, unknown>, nextVersionCandidate)

  // Record change history for tracked fields
  const fieldToColumn: Record<string, string> = {
    difficulty: 'difficulty',
    frequency: 'frequency',
    identityId: 'identity_id',
    habitType: 'habit_type'
  }

  const historyRows: Array<{
    habit_id: string
    user_id: string
    field: string
    old_value: string | null
    new_value: string | null
  }> = []

  for (const field of TRACKED_FIELDS) {
    const newVal = parsed[field]
    if (newVal === undefined) continue
    const colName = fieldToColumn[field]!
    const oldVal = (current as Record<string, unknown>)[colName]
    if (String(newVal ?? '') !== String(oldVal ?? '')) {
      historyRows.push({
        habit_id: id,
        user_id: user.id,
        field,
        old_value: oldVal != null ? String(oldVal) : null,
        new_value: newVal != null ? String(newVal) : null
      })
    }
  }

  if (historyRows.length > 0) {
    await supabase.from('habit_change_history').insert(historyRows)
  }

  const { data, error } = await supabase
    .from('habits')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*, identity:identities(*), streak:habit_streaks(*)')
    .single()

  if (error || !data) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar hábito', data: error?.message })
  }

  if (shouldRotateVersion) {
    await syncHabitVersion(supabase, data as Record<string, unknown>)
  }

  // Sync tag links
  if (parsed.tagIds !== undefined) {
    await supabase.from('habit_tag_links').delete().eq('habit_id', id)
    if (parsed.tagIds.length > 0) {
      await supabase.from('habit_tag_links').insert(
        parsed.tagIds.map(tagId => ({ habit_id: id, tag_id: tagId }))
      )
    }
  }

  await syncHabitLinkedEvent(supabase, user.id, data as Record<string, unknown>)

  const tagMap = await fetchHabitTagMap(supabase, [id])

  return mapHabit(data as Record<string, unknown>, tagMap.get(id))
})
