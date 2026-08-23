import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { mapSchedulingPage } from '../../../utils/scheduling'

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/)
})

const questionSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'textarea', 'select']).default('text'),
  isRequired: z.boolean().default(false),
  options: z.array(z.string().max(100)).max(20).optional(),
  sortOrder: z.number().int().min(0).default(0)
})

const bodySchema = z.object({
  calendarId: z.string().uuid().optional(),
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  locationType: z.enum(['video_link', 'phone', 'in_person', 'custom']).optional(),
  locationDetails: z.string().max(500).nullable().optional(),
  timezone: z.string().min(1).max(100).optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).optional(),
  bufferAfterMinutes: z.number().int().min(0).max(120).optional(),
  slotIncrementMinutes: z.number().int().min(5).max(120).optional(),
  minNoticeHours: z.number().int().min(0).max(720).optional(),
  maxAdvanceDays: z.number().int().min(1).max(365).optional(),
  maxBookingsPerDay: z.number().int().min(1).max(100).nullable().optional(),
  isActive: z.boolean().optional(),
  availabilityRules: z.array(availabilityRuleSchema).min(1).optional(),
  questions: z.array(questionSchema).max(20).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const id = z.string().uuid().parse(getRouterParam(event, 'id'))
  const body = await readBody(event)
  const payload = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const { data: existing } = await supabase
    .from('scheduling_pages')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Página de agendamento não encontrada' })
  }

  if (payload.calendarId) {
    const { data: calendar } = await supabase
      .from('calendars')
      .select('id')
      .eq('id', payload.calendarId)
      .eq('owner_user_id', user.id)
      .is('archived_at', null)
      .single()

    if (!calendar) {
      throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
    }
  }

  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (payload.calendarId !== undefined) updateData.calendar_id = payload.calendarId
  if (payload.title !== undefined) updateData.title = payload.title
  if (payload.description !== undefined) updateData.description = payload.description
  if (payload.durationMinutes !== undefined) updateData.duration_minutes = payload.durationMinutes
  if (payload.locationType !== undefined) updateData.location_type = payload.locationType
  if (payload.locationDetails !== undefined) updateData.location_details = payload.locationDetails
  if (payload.timezone !== undefined) updateData.timezone = payload.timezone
  if (payload.bufferBeforeMinutes !== undefined) updateData.buffer_before_minutes = payload.bufferBeforeMinutes
  if (payload.bufferAfterMinutes !== undefined) updateData.buffer_after_minutes = payload.bufferAfterMinutes
  if (payload.slotIncrementMinutes !== undefined) updateData.slot_increment_minutes = payload.slotIncrementMinutes
  if (payload.minNoticeHours !== undefined) updateData.min_notice_hours = payload.minNoticeHours
  if (payload.maxAdvanceDays !== undefined) updateData.max_advance_days = payload.maxAdvanceDays
  if (payload.maxBookingsPerDay !== undefined) updateData.max_bookings_per_day = payload.maxBookingsPerDay
  if (payload.isActive !== undefined) updateData.is_active = payload.isActive

  const { data: page, error } = await supabase
    .from('scheduling_pages')
    .update(updateData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error || !page) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar página de agendamento', data: error?.message })
  }

  if (payload.availabilityRules) {
    await supabase.from('scheduling_availability_rules').delete().eq('scheduling_page_id', id)
    const { error: rulesError } = await supabase
      .from('scheduling_availability_rules')
      .insert(payload.availabilityRules.map(rule => ({
        scheduling_page_id: id,
        day_of_week: rule.dayOfWeek,
        start_time: rule.startTime,
        end_time: rule.endTime
      })))

    if (rulesError) {
      throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar disponibilidade', data: rulesError.message })
    }
  }

  if (payload.questions) {
    await supabase.from('scheduling_questions').delete().eq('scheduling_page_id', id)
    if (payload.questions.length > 0) {
      const { error: questionsError } = await supabase
        .from('scheduling_questions')
        .insert(payload.questions.map(q => ({
          scheduling_page_id: id,
          label: q.label,
          type: q.type,
          is_required: q.isRequired,
          options: q.options ?? null,
          sort_order: q.sortOrder
        })))

      if (questionsError) {
        throw createError({ statusCode: 500, statusMessage: 'Falha ao atualizar perguntas', data: questionsError.message })
      }
    }
  }

  return mapSchedulingPage(page as Record<string, unknown>)
})
