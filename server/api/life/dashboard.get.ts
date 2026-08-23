import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { resolveHabitsForDate } from '../../utils/habit-versions'

const querySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data deve estar no formato YYYY-MM-DD').optional()
})

function isDueOnDay(frequency: unknown, customDays: unknown, dayOfWeek: number): boolean {
  if (frequency === 'daily') return true
  if (frequency === 'weekly') return dayOfWeek === 1
  if (frequency === 'custom' && Array.isArray(customDays)) {
    return (customDays as number[]).includes(dayOfWeek)
  }
  return false
}

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)

  const todayStr = new Date().toISOString().split('T')[0]!
  const date = params.date ?? todayStr
  const dayOfWeek = new Date(`${date}T12:00:00Z`).getUTCDay()
  const isCurrentDay = date === todayStr

  const supabase = getSupabaseAdminClient()

  // ─── Habits ───────────────────────────────────────────────────────────────
  type DashboardHabitItem = { id: string, name: string, frequency: string, difficulty: string, completed: boolean, streakCurrent: number }

  let dashboardHabits: DashboardHabitItem[]

  if (isCurrentDay) {
    const { data: habits } = await supabase
      .from('habits')
      .select('id, name, frequency, difficulty, custom_days, streak:habit_streaks(current_streak)')
      .eq('user_id', user.id)
      .is('archived_at', null)
      .order('created_at', { ascending: true })

    const todayHabits = (habits ?? []).filter((h: Record<string, unknown>) =>
      isDueOnDay(h.frequency, h.custom_days, dayOfWeek)
    )

    const habitIds = todayHabits.map((h: Record<string, unknown>) => h.id as string)
    let habitLogs: Record<string, boolean> = {}

    if (habitIds.length > 0) {
      const { data: logsData } = await supabase
        .from('habit_logs')
        .select('habit_id, completed')
        .eq('user_id', user.id)
        .eq('log_date', date)
        .in('habit_id', habitIds)

      if (logsData) {
        habitLogs = Object.fromEntries(
          logsData.map((l: Record<string, unknown>) => [l.habit_id, l.completed as boolean])
        )
      }
    }

    dashboardHabits = todayHabits.map((h: Record<string, unknown>) => {
      const streak = h.streak as Record<string, unknown> | Record<string, unknown>[] | null
      const streakVal = Array.isArray(streak) ? streak[0] : streak
      return {
        id: h.id as string,
        name: h.name as string,
        frequency: h.frequency as string,
        difficulty: h.difficulty as string,
        completed: habitLogs[h.id as string] ?? false,
        streakCurrent: (streakVal?.current_streak as number) ?? 0
      }
    })
  } else {
    // Past/future date — use habit_versions for historical accuracy
    const resolved = await resolveHabitsForDate(supabase, user.id, date)

    const filteredVersions = resolved.filter(({ version }) =>
      isDueOnDay(version.frequency, version.custom_days, dayOfWeek)
    )

    const habitIds = filteredVersions.map(({ version }) => version.habit_id as string)
    let habitLogs: Record<string, boolean> = {}

    if (habitIds.length > 0) {
      const { data: logsData } = await supabase
        .from('habit_logs')
        .select('habit_id, completed')
        .eq('user_id', user.id)
        .eq('log_date', date)
        .in('habit_id', habitIds)

      if (logsData) {
        habitLogs = Object.fromEntries(
          logsData.map((l: Record<string, unknown>) => [l.habit_id, l.completed as boolean])
        )
      }
    }

    dashboardHabits = filteredVersions.map(({ version, streak: streakRaw }) => {
      const streak = streakRaw as Record<string, unknown> | null
      return {
        id: version.habit_id as string,
        name: version.name as string,
        frequency: version.frequency as string,
        difficulty: version.difficulty as string,
        completed: habitLogs[version.habit_id as string] ?? false,
        streakCurrent: (streak?.current_streak as number) ?? 0
      }
    })
  }

  const habitsCompleted = dashboardHabits.filter(h => h.completed).length

  // ─── Tasks ────────────────────────────────────────────────────────────────
  const { data: tasks } = await supabase
    .from('tasks')
    .select('id, title, priority, status, due_date, list:task_lists(name)')
    .eq('user_id', user.id)
    .in('status', ['pending', 'in_progress'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(20)

  const dashboardTasks = (tasks ?? []).map((t: Record<string, unknown>) => {
    const list = t.list as Record<string, unknown> | Record<string, unknown>[] | null
    const listVal = Array.isArray(list) ? list[0] : list
    return {
      id: t.id as string,
      title: t.title as string,
      priority: t.priority as string,
      status: t.status as string,
      dueDate: (t.due_date as string) ?? null,
      listName: (listVal?.name as string) ?? null
    }
  })

  const overdueCount = dashboardTasks.filter(t => t.dueDate && t.dueDate < date).length
  const pendingCount = dashboardTasks.length

  // ─── Events ───────────────────────────────────────────────────────────────
  const dayStart = `${date}T00:00:00Z`
  const dayEnd = `${date}T23:59:59Z`

  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_at, end_at, all_day, calendar:calendars(name, color)')
    .eq('owner_user_id', user.id)
    .is('archived_at', null)
    .lte('start_at', dayEnd)
    .gte('end_at', dayStart)
    .order('start_at', { ascending: true })
    .limit(20)

  const dashboardEvents = (events ?? []).map((e: Record<string, unknown>) => {
    const cal = e.calendar as Record<string, unknown> | Record<string, unknown>[] | null
    const calVal = Array.isArray(cal) ? cal[0] : cal
    return {
      id: e.id as string,
      title: e.title as string,
      startAt: e.start_at as string,
      endAt: e.end_at as string,
      allDay: e.all_day as boolean,
      calendarName: (calVal?.name as string) ?? 'Calendário',
      calendarColor: (calVal?.color as string) ?? null
    }
  })

  // ─── Journal ──────────────────────────────────────────────────────────────
  const { data: journalEntries } = await supabase
    .from('journal_entries')
    .select('id, entry_date, title, content, locked, is_encrypted')
    .eq('user_id', user.id)
    .eq('entry_date', date)
    .limit(1)

  const journalRow = journalEntries && journalEntries.length > 0
    ? journalEntries[0] as unknown as Record<string, unknown>
    : null

  // A PIN lock on the journal ("módulo inteiro", ou esta entrada específica
  // no modo "entradas específicas") — e, agora, uma entrada cifrada por E2EE
  // — precisam esconder o preview aqui também. Este widget lê
  // journal_entries direto, fora da API /api/journal/* que a tela de
  // bloqueio normalmente cobre, e o servidor não consegue decifrar conteúdo
  // E2EE de qualquer forma (só o cliente, com a Data Key, consegue).
  const { data: prefsRow } = await supabase
    .from('user_preferences')
    .select('journal_pin_hash, journal_pin_mode')
    .eq('user_id', user.id)
    .single()

  const prefs = prefsRow as { journal_pin_hash: string | null, journal_pin_mode: string | null } | null
  const pinMode = prefs?.journal_pin_hash ? prefs.journal_pin_mode : null
  const isPinLocked = pinMode === 'module' || (pinMode === 'entries' && journalRow?.locked === true)
  const isEncrypted = journalRow?.is_encrypted === true
  const isProtected = isPinLocked || isEncrypted

  const journal = {
    id: journalRow ? (journalRow.id as string) : null,
    entryDate: date,
    title: isProtected ? null : journalRow ? (journalRow.title as string | null) : null,
    contentPreview: isProtected || !journalRow
      ? null
      : ((journalRow.content as string) ?? '').substring(0, 120),
    exists: !!journalRow,
    locked: isPinLocked,
    encrypted: isEncrypted
  }

  return {
    date: date,
    habits: {
      items: dashboardHabits,
      completedCount: habitsCompleted,
      totalCount: dashboardHabits.length
    },
    tasks: {
      items: dashboardTasks,
      pendingCount,
      overdueCount
    },
    events: {
      items: dashboardEvents,
      totalCount: dashboardEvents.length
    },
    journal
  }
})
