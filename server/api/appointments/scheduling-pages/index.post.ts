import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { createShareToken } from '../../../utils/share-token'
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
  calendarId: z.string().uuid(),
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(480),
  locationType: z.enum(['video_link', 'phone', 'in_person', 'custom']).default('video_link'),
  locationDetails: z.string().max(500).optional(),
  timezone: z.string().min(1).max(100),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
  slotIncrementMinutes: z.number().int().min(5).max(120).default(15),
  minNoticeHours: z.number().int().min(0).max(720).default(4),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  maxBookingsPerDay: z.number().int().min(1).max(100).nullable().optional(),
  availabilityRules: z.array(availabilityRuleSchema).min(1, 'Defina ao menos uma janela de disponibilidade'),
  questions: z.array(questionSchema).max(20).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

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

  const { data: page, error } = await supabase
    .from('scheduling_pages')
    .insert({
      user_id: user.id,
      calendar_id: payload.calendarId,
      title: payload.title,
      description: payload.description ?? null,
      duration_minutes: payload.durationMinutes,
      location_type: payload.locationType,
      location_details: payload.locationDetails ?? null,
      timezone: payload.timezone,
      buffer_before_minutes: payload.bufferBeforeMinutes,
      buffer_after_minutes: payload.bufferAfterMinutes,
      slot_increment_minutes: payload.slotIncrementMinutes,
      min_notice_hours: payload.minNoticeHours,
      max_advance_days: payload.maxAdvanceDays,
      max_bookings_per_day: payload.maxBookingsPerDay ?? null,
      share_token: createShareToken()
    })
    .select('*')
    .single()

  if (error || !page) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar página de agendamento', data: error?.message })
  }

  const pageId = page.id as string

  const { error: rulesError } = await supabase
    .from('scheduling_availability_rules')
    .insert(payload.availabilityRules.map(rule => ({
      scheduling_page_id: pageId,
      day_of_week: rule.dayOfWeek,
      start_time: rule.startTime,
      end_time: rule.endTime
    })))

  if (rulesError) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao salvar disponibilidade', data: rulesError.message })
  }

  if (payload.questions && payload.questions.length > 0) {
    const { error: questionsError } = await supabase
      .from('scheduling_questions')
      .insert(payload.questions.map(q => ({
        scheduling_page_id: pageId,
        label: q.label,
        type: q.type,
        is_required: q.isRequired,
        options: q.options ?? null,
        sort_order: q.sortOrder
      })))

    if (questionsError) {
      throw createError({ statusCode: 500, statusMessage: 'Falha ao salvar perguntas', data: questionsError.message })
    }
  }

  setResponseStatus(event, 201)
  return mapSchedulingPage(page as Record<string, unknown>)
})
