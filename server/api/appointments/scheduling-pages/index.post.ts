import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'
import { createShareToken } from '../../../utils/share-token'
import { mapSchedulingPage } from '../../../utils/scheduling'
import { parseOrThrow } from '../../../utils/validation'

const availabilityRuleSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/)
})

const questionSchema = z.object({
  label: z.string().min(1).max(200),
  type: z.enum(['text', 'textarea', 'select']).default('text'),
  isRequired: z.boolean().default(false),
  isHidden: z.boolean().default(false),
  options: z.array(z.string().max(100)).max(20).optional(),
  sortOrder: z.number().int().min(0).default(0)
}).refine(
  q => q.type !== 'select' || (q.options?.length ?? 0) >= 2,
  { message: 'Perguntas de seleção precisam de ao menos 2 opções', path: ['options'] }
)

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  calendarId: z.string().uuid(),
  title: z.string().min(1, 'Título é obrigatório').max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(5).max(480),
  locationType: z.enum(['video_link', 'phone', 'in_person', 'custom']).default('video_link'),
  locationDetails: z.string().max(500).optional(),
  timezone: z.string().min(1).max(100),
  color: z.string().max(20).nullable().optional(),
  bufferBeforeMinutes: z.number().int().min(0).max(120).default(0),
  bufferAfterMinutes: z.number().int().min(0).max(120).default(0),
  slotIncrementMinutes: z.number().int().min(5).max(120).default(15),
  minNoticeHours: z.number().int().min(0).max(720).default(4),
  maxAdvanceDays: z.number().int().min(1).max(365).default(60),
  maxBookingsPerDay: z.number().int().min(1).max(100).nullable().optional(),
  calendarEventTitleTemplate: z.string().max(300).nullable().optional(),
  cancellationEnabled: z.boolean().default(true),
  rescheduleEnabled: z.boolean().default(true),
  cancellationMinNoticeHours: z.number().int().min(0).max(720).nullable().optional(),
  cancellationReasonRequired: z.boolean().default(false),
  hideDetailsOnManagePage: z.boolean().default(false),
  availabilityRules: z.array(availabilityRuleSchema).min(1, 'Defina ao menos uma janela de disponibilidade'),
  questions: z.array(questionSchema).max(20).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = parseOrThrow(bodySchema, body)

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

  const insertRow: Record<string, unknown> = {
    user_id: user.id,
    calendar_id: payload.calendarId,
    title: payload.title,
    description: payload.description ?? null,
    duration_minutes: payload.durationMinutes,
    location_type: payload.locationType,
    location_details: payload.locationDetails ?? null,
    timezone: payload.timezone,
    color: payload.color ?? null,
    buffer_before_minutes: payload.bufferBeforeMinutes,
    buffer_after_minutes: payload.bufferAfterMinutes,
    slot_increment_minutes: payload.slotIncrementMinutes,
    min_notice_hours: payload.minNoticeHours,
    max_advance_days: payload.maxAdvanceDays,
    max_bookings_per_day: payload.maxBookingsPerDay ?? null,
    calendar_event_title_template: payload.calendarEventTitleTemplate ?? null,
    cancellation_enabled: payload.cancellationEnabled,
    reschedule_enabled: payload.rescheduleEnabled,
    cancellation_min_notice_hours: payload.cancellationMinNoticeHours ?? null,
    cancellation_reason_required: payload.cancellationReasonRequired,
    hide_details_on_manage_page: payload.hideDetailsOnManagePage,
    share_token: createShareToken()
  }
  if (payload.id) insertRow.id = payload.id

  const { data: insertedPage, error } = await supabase
    .from('scheduling_pages')
    .insert(insertRow)
    .select('*')
    .single()

  let page = insertedPage as Record<string, unknown> | null

  // Same replay-safety as events/calendars: a retried offline-queued create
  // with the same client-supplied id lands on the row that's already there
  // instead of erroring. The rule/question inserts below always run as
  // delete-then-reinsert, so re-running them against that existing page is
  // safe too — this is what makes the whole 3-way create idempotent, not
  // just the page row itself.
  if (error?.code === '23505' && payload.id) {
    const { data: existing, error: fetchError } = await supabase
      .from('scheduling_pages')
      .select('*')
      .eq('id', payload.id)
      .eq('user_id', user.id)
      .single()

    if (existing) page = existing as Record<string, unknown>
    else if (fetchError) throw createError({ statusCode: 500, statusMessage: fetchError.message })
  }

  if (error && !page) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar página de agendamento', data: error.message })
  }
  if (!page) {
    throw createError({ statusCode: 500, statusMessage: 'Falha ao criar página de agendamento' })
  }

  const pageId = page.id as string

  await supabase.from('scheduling_availability_rules').delete().eq('scheduling_page_id', pageId)
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

  await supabase.from('scheduling_questions').delete().eq('scheduling_page_id', pageId)
  if (payload.questions && payload.questions.length > 0) {
    const { error: questionsError } = await supabase
      .from('scheduling_questions')
      .insert(payload.questions.map(q => ({
        scheduling_page_id: pageId,
        label: q.label,
        type: q.type,
        is_required: q.isRequired,
        is_hidden: q.isHidden,
        options: q.options ?? null,
        sort_order: q.sortOrder
      })))

    if (questionsError) {
      throw createError({ statusCode: 500, statusMessage: 'Falha ao salvar perguntas', data: questionsError.message })
    }
  }

  setResponseStatus(event, 201)
  return mapSchedulingPage(page)
})
