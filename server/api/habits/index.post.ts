import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { sanitizeRichTextHtml } from '../../utils/rich-text'
import { mapHabit, fetchHabitTagMap } from '../../utils/habits'
import { createInitialHabitVersion } from '../../utils/habit-versions'
import { syncHabitLinkedEvent } from '../../utils/habit-event-sync'

const bodySchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  avatarEmoji: z.string().max(16).optional(),
  description: z.string().max(5000).optional(),
  obviousStrategy: z.string().max(5000).optional(),
  attractiveStrategy: z.string().max(5000).optional(),
  easyStrategy: z.string().max(5000).optional(),
  satisfyingStrategy: z.string().max(5000).optional(),
  emergencyVersion: z.string().max(500).optional(),
  frequency: z.enum(['daily', 'weekly', 'custom']).default('daily'),
  difficulty: z.enum(['tiny', 'normal', 'hard']).default('normal'),
  habitType: z.enum(['positive', 'negative']).default('positive'),
  identityId: z.string().uuid().optional(),
  calendarId: z.string().uuid().optional(),
  customDays: z.array(z.number().int().min(0).max(6)).optional(),
  scheduledTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm').optional(),
  scheduledEndTime: z.string().regex(/^\d{2}:\d{2}$/, 'Horário deve estar no formato HH:mm').optional(),
  tagIds: z.array(z.string().uuid()).optional()
}).refine(
  data => data.frequency !== 'custom' || (data.customDays && data.customDays.length > 0),
  { message: 'Selecione ao menos um dia para frequência personalizada', path: ['customDays'] }
)

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
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

  // Create the habit
  const { data: habit, error } = await supabase
    .from('habits')
    .insert({
      user_id: user.id,
      name: parsed.name,
      avatar_emoji: parsed.avatarEmoji ?? null,
      description: sanitizeRichTextHtml(parsed.description),
      obvious_strategy: sanitizeRichTextHtml(parsed.obviousStrategy),
      attractive_strategy: sanitizeRichTextHtml(parsed.attractiveStrategy),
      easy_strategy: sanitizeRichTextHtml(parsed.easyStrategy),
      satisfying_strategy: sanitizeRichTextHtml(parsed.satisfyingStrategy),
      emergency_version: parsed.emergencyVersion?.trim() || null,
      frequency: parsed.frequency,
      difficulty: parsed.difficulty,
      habit_type: parsed.habitType,
      identity_id: parsed.identityId ?? null,
      calendar_id: parsed.calendarId ?? null,
      custom_days: parsed.customDays ?? null,
      scheduled_time: parsed.scheduledTime ?? null,
      scheduled_end_time: parsed.scheduledEndTime ?? null
    })
    .select('*')
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar hábito', data: error.message })
  }

  await createInitialHabitVersion(supabase, habit as Record<string, unknown>)

  // Initialize streak cache
  await supabase.from('habit_streaks').insert({
    habit_id: habit.id,
    user_id: user.id,
    current_streak: 0,
    longest_streak: 0,
    last_completed_date: null
  })

  // Link tags
  if (parsed.tagIds?.length) {
    await supabase.from('habit_tag_links').insert(
      parsed.tagIds.map(tagId => ({ habit_id: habit.id, tag_id: tagId }))
    )
  }

  await syncHabitLinkedEvent(supabase, user.id, habit as Record<string, unknown>)

  const tagMap = await fetchHabitTagMap(supabase, [habit.id as string])

  return mapHabit(habit as Record<string, unknown>, tagMap.get(habit.id as string))
})
