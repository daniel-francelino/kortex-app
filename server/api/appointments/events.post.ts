import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { createEventInternal } from '../../utils/appointments-events'
import { resolveCalendarForWrite } from '../../utils/calendar-access'

const reminderSchema = z.object({
  type: z.enum(['popup', 'email', 'push']).default('popup'),
  minutesBefore: z.number().int().min(0).max(10080) // max 1 week
})

const bodySchema = z.object({
  id: z.string().uuid().optional(),
  calendarId: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  location: z.string().max(500).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  eventTimezone: z.string().min(1).max(100),
  allDay: z.boolean().default(false),
  rrule: z.string().max(500).optional(),
  reminders: z.array(reminderSchema).max(5).optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)

  const supabase = getSupabaseAdminClient()

  const access = await resolveCalendarForWrite(supabase, payload.calendarId, user.id)
  if (!access) {
    throw createError({ statusCode: 404, statusMessage: 'Calendário não encontrado' })
  }

  const newEvent = await createEventInternal(supabase, access.ownerId, payload)

  setResponseStatus(event, 201)
  return newEvent
})
