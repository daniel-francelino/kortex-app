<script setup lang="ts">
import type { CalendarEvent, CreateEventPayload } from '~/types/appointments'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Agenda'
})

const {
  calendars,
  calendarsStatus,
  eventsData,
  eventsStatus,
  activeCalendarIds,
  setViewRange,
  fetchEventDetail,
  refreshCalendars,
  refreshEvents,
  createEvent,
  updateEvent,
  archiveEvent
} = useAppointments()

// ─── View mode (Day / Week / Month) ─────────────────────────────────────
type CalendarViewMode = 'day' | 'week' | 'month'

const STORAGE_KEY = 'sb-calendar-view'
const savedView = (typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as CalendarViewMode | null
const activeView = ref<CalendarViewMode>(savedView && ['day', 'week', 'month'].includes(savedView) ? savedView : 'month')

watch(activeView, (v) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, v)
  }
})

const viewModes: { label: string, value: CalendarViewMode, icon: string }[] = [
  { label: 'Dia', value: 'day', icon: 'i-lucide-square' },
  { label: 'Semana', value: 'week', icon: 'i-lucide-columns-3' },
  { label: 'Mês', value: 'month', icon: 'i-lucide-grid-3x3' }
]

useMobileContextNav().registerMobileContextNav('appointments', viewModes, activeView)

// ─── Navigation state ───────────────────────────────────────────────────
const today = new Date()
const viewYear = ref(today.getFullYear())
const viewMonth = ref(today.getMonth())
const viewWeekStart = ref(getWeekStart(today))
const viewDayDate = ref(new Date(today))

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  d.setHours(0, 0, 0, 0)
  return d
}

const headerLabel = computed(() => {
  if (activeView.value === 'month') {
    const d = new Date(viewYear.value, viewMonth.value, 1)
    return d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }
  if (activeView.value === 'week') {
    const start = viewWeekStart.value
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const sStr = start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
    const eStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
    return `${sStr} — ${eStr}`
  }
  return viewDayDate.value.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
})

function goPrev() {
  if (activeView.value === 'month') {
    if (viewMonth.value === 0) {
      viewMonth.value = 11
      viewYear.value--
    } else {
      viewMonth.value--
    }
  } else if (activeView.value === 'week') {
    const d = new Date(viewWeekStart.value)
    d.setDate(d.getDate() - 7)
    viewWeekStart.value = d
  } else {
    const d = new Date(viewDayDate.value)
    d.setDate(d.getDate() - 1)
    viewDayDate.value = d
  }
}

function goNext() {
  if (activeView.value === 'month') {
    if (viewMonth.value === 11) {
      viewMonth.value = 0
      viewYear.value++
    } else {
      viewMonth.value++
    }
  } else if (activeView.value === 'week') {
    const d = new Date(viewWeekStart.value)
    d.setDate(d.getDate() + 7)
    viewWeekStart.value = d
  } else {
    const d = new Date(viewDayDate.value)
    d.setDate(d.getDate() + 1)
    viewDayDate.value = d
  }
}

function goToday() {
  const now = new Date()
  viewYear.value = now.getFullYear()
  viewMonth.value = now.getMonth()
  viewWeekStart.value = getWeekStart(now)
  viewDayDate.value = new Date(now)
}

// ─── Modals / Popovers ─────────────────────────────────────────────────
const calendarCreateOpen = ref(false)
const eventCreateOpen = ref(false)
const eventDetailOpen = ref(false)
const eventDetailLoading = ref(false)
const calendarsExpanded = ref(false)
const selectedEvent = ref<CalendarEvent | null>(null)

// Event popover state
const eventPopoverVisible = ref(false)
const eventPopoverEvent = ref<CalendarEvent | null>(null)
const eventPopoverPosition = ref({ x: 0, y: 0 })

// Quick create popover state
const quickCreateVisible = ref(false)
const quickCreateDate = ref('')
const quickCreatePosition = ref({ x: 0, y: 0 })

const selectedCalendarId = computed(() => activeCalendarIds.value[0] ?? '')

function onSelectEvent(evt: CalendarEvent, mouseEvent: MouseEvent) {
  // Close quick create if open
  quickCreateVisible.value = false

  eventPopoverEvent.value = evt
  eventPopoverPosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  eventPopoverVisible.value = true
}

function onSelectSlot(date: string, mouseEvent: MouseEvent) {
  // Close event popover if open
  eventPopoverVisible.value = false

  quickCreateDate.value = date
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  quickCreateVisible.value = true
}

function onDaySlotSelect(_date: string, time: string, mouseEvent: MouseEvent) {
  eventPopoverVisible.value = false
  quickCreateDate.value = _date
  quickCreatePosition.value = { x: mouseEvent.clientX, y: mouseEvent.clientY }
  quickCreateVisible.value = true
}

function closeEventPopover() {
  eventPopoverVisible.value = false
  eventPopoverEvent.value = null
}

function closeQuickCreate() {
  quickCreateVisible.value = false
}

async function onPopoverEdit(evt: CalendarEvent) {
  closeEventPopover()
  selectedEvent.value = evt
  eventDetailOpen.value = true
  eventDetailLoading.value = true

  try {
    const detail = await fetchEventDetail(evt.id)
    if (detail && selectedEvent.value?.id === evt.id) {
      selectedEvent.value = {
        ...detail,
        recurrenceId: evt.recurrenceId ?? detail.recurrenceId ?? null,
        isRecurring: evt.isRecurring ?? detail.isRecurring,
        isCancelled: evt.isCancelled ?? detail.isCancelled
      }
    }
  } finally {
    eventDetailLoading.value = false
  }
}

async function onPopoverArchive(evt: CalendarEvent) {
  closeEventPopover()
  const success = await archiveEvent(evt.id)
  if (success) {
    refreshEvents()
  }
}

async function onPopoverDuplicate(evt: CalendarEvent) {
  closeEventPopover()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  const payload: CreateEventPayload = {
    calendarId: evt.calendarId,
    title: `${evt.title} (cópia)`,
    description: evt.description ?? undefined,
    location: evt.location ?? undefined,
    startAt: evt.startAt,
    endAt: evt.endAt,
    eventTimezone: evt.eventTimezone || timezone,
    allDay: evt.allDay,
    rrule: evt.rrule ?? undefined
  }

  const result = await createEvent(payload)
  if (result) {
    refreshEvents()
  }
}

async function onQuickCreate(data: { title: string, date: string, calendarId: string }) {
  closeQuickCreate()
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone
  const startAt = `${data.date}T09:00:00`
  const endAt = `${data.date}T10:00:00`

  const payload: CreateEventPayload = {
    calendarId: data.calendarId,
    title: data.title,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    eventTimezone: timezone
  }

  const result = await createEvent(payload)
  if (result) {
    refreshEvents()
  }
}

function onQuickCreateMoreOptions(_date: string) {
  closeQuickCreate()
  eventCreateOpen.value = true
}

function onMonthChange(from: string, to: string) {
  setViewRange(from, to)
}

function onWeekChange(from: string, to: string) {
  setViewRange(from, to)
}

function onDayChange(from: string, to: string) {
  setViewRange(from, to)
}

function toggleCalendarsPanel() {
  calendarsExpanded.value = !calendarsExpanded.value
}

function onToggleCalendar(calendarId: string) {
  activeCalendarIds.value = selectedCalendarId.value === calendarId ? [] : [calendarId]
}

const eventsList = computed(() => eventsData.value?.data ?? [])

async function onEventDrop(eventId: string, newStartAt: string, newEndAt: string) {
  const success = await updateEvent(eventId, { startAt: newStartAt, endAt: newEndAt })
  if (success) refreshEvents()
}

async function onMonthEventDrop(eventId: string, newDate: string) {
  const event = eventsList.value.find(e => e.id === eventId)
  if (!event) return
  const origStart = new Date(event.startAt)
  const origEnd = new Date(event.endAt)
  const durationMs = origEnd.getTime() - origStart.getTime()
  const [y, m, d] = newDate.split('-').map(Number)
  const newStart = new Date(y!, m! - 1, d!, origStart.getHours(), origStart.getMinutes(), origStart.getSeconds())
  const newEnd = new Date(newStart.getTime() + durationMs)
  const success = await updateEvent(eventId, { startAt: newStart.toISOString(), endAt: newEnd.toISOString() })
  if (success) refreshEvents()
}

onMounted(() => {
  refreshCalendars()
})
</script>

<template>
  <UDashboardPanel id="appointments">
    <template #header>
      <UDashboardNavbar title="Agenda">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #default>
          <!-- Navigation: today + arrows + period label -->
          <div class="flex items-center gap-1">
            <UButton
              label="Hoje"
              variant="outline"
              size="sm"
              class="hidden sm:flex"
              @click="goToday"
            />
            <UButton
              icon="i-lucide-chevron-left"
              variant="ghost"
              size="sm"
              @click="goPrev"
            />
            <UButton
              icon="i-lucide-chevron-right"
              variant="ghost"
              size="sm"
              @click="goNext"
            />
            <h2 class="ml-1 min-w-36 text-sm font-semibold capitalize text-highlighted">
              {{ headerLabel }}
            </h2>
          </div>
        </template>

        <template #right>
          <!-- View mode (icon + tooltip) -->
          <div class="hidden items-center gap-0.5 rounded-lg border border-default p-0.5 lg:flex">
            <UTooltip
              v-for="mode in viewModes"
              :key="mode.value"
              :text="mode.label"
            >
              <UButton
                square
                :color="activeView === mode.value ? 'primary' : 'neutral'"
                :variant="activeView === mode.value ? 'soft' : 'ghost'"
                @click="activeView = mode.value"
              >
                <UIcon :name="mode.icon" class="size-5 shrink-0" />
              </UButton>
            </UTooltip>
          </div>

          <!-- Calendar sidebar toggle -->
          <UTooltip text="Calendários">
            <UButton
              color="neutral"
              variant="ghost"
              square
              :class="calendarsExpanded ? 'text-primary' : ''"
              @click="toggleCalendarsPanel"
            >
              <UIcon name="i-lucide-calendar-range" class="size-5 shrink-0" />
            </UButton>
          </UTooltip>

          <!-- New event -->
          <UTooltip text="Novo evento">
            <UButton
              square
              @click="eventCreateOpen = true"
            >
              <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
            </UButton>
          </UTooltip>

          <!-- Notifications always last -->
          <NotificationsButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-full">
        <!-- Sidebar: Calendar list -->
        <div
          v-if="calendarsExpanded"
          class="w-56 shrink-0 border-r border-default p-3 overflow-y-auto"
        >
          <AppointmentsCalendarList
            :calendars="calendars"
            :loading="calendarsStatus === 'pending'"
            :active-calendar-id="selectedCalendarId"
            @create="calendarCreateOpen = true"
            @toggle="onToggleCalendar"
            @archive="() => {}"
            @edit="() => {}"
          />
        </div>

        <!-- Main calendar area -->
        <div class="min-w-0 flex-1 overflow-auto p-2">
          <!-- Month view -->
          <AppointmentsMonthView
            v-if="activeView === 'month'"
            :events="eventsList"
            :loading="eventsStatus === 'pending'"
            :current-date="new Date()"
            :view-year="viewYear"
            :view-month="viewMonth"
            @select-event="onSelectEvent"
            @select-slot="onSelectSlot"
            @month-change="onMonthChange"
            @drop-event="onMonthEventDrop"
          />

          <!-- Week view -->
          <AppointmentsWeekView
            v-if="activeView === 'week'"
            :events="eventsList"
            :loading="eventsStatus === 'pending'"
            :week-start-date="viewWeekStart"
            @select-event="onSelectEvent"
            @select-slot="onSelectSlot"
            @week-change="onWeekChange"
            @drop-event="onEventDrop"
          />

          <!-- Day view -->
          <AppointmentsDayView
            v-if="activeView === 'day'"
            :events="eventsList"
            :loading="eventsStatus === 'pending'"
            :current-date="viewDayDate"
            @select-event="onSelectEvent"
            @select-slot="onDaySlotSelect"
            @day-change="onDayChange"
            @drop-event="onEventDrop"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Event popover (Google Calendar style) -->
  <AppointmentsEventPopover
    :event="eventPopoverEvent"
    :position="eventPopoverPosition"
    :visible="eventPopoverVisible"
    @close="closeEventPopover"
    @edit="onPopoverEdit"
    @archive="onPopoverArchive"
    @duplicate="onPopoverDuplicate"
  />

  <!-- Quick create popover -->
  <AppointmentsQuickCreatePopover
    :visible="quickCreateVisible"
    :position="quickCreatePosition"
    :date="quickCreateDate"
    :calendars="calendars"
    @close="closeQuickCreate"
    @create="onQuickCreate"
    @more-options="onQuickCreateMoreOptions"
  />

  <!-- Modals -->
  <AppointmentsCalendarCreateModal
    :open="calendarCreateOpen"
    :calendars="calendars"
    @update:open="calendarCreateOpen = $event"
    @created="refreshCalendars"
  />

  <AppointmentsEventCreateModal
    :open="eventCreateOpen"
    :calendars="calendars"
    @update:open="eventCreateOpen = $event"
    @created="refreshEvents"
  />

  <AppointmentsEventDetailSlideover
    :open="eventDetailOpen"
    :event="selectedEvent"
    :loading="eventDetailLoading"
    :calendars="calendars"
    @update:open="eventDetailOpen = $event"
    @updated="refreshEvents"
    @archived="refreshEvents"
  />
</template>

<!--
  TO DO

  ========================
  ⚡ Performance
  ========================

  - Ao abrir a página estão sendo disparados múltiplos requests desnecessários.
    É necessário otimizar o carregamento inicial para evitar requisições repetidas.

  ========================
  📅 Calendário / Eventos
  ========================

  - Na tab de Agenda:
    - Deve ser possível editar completamente um evento ao clicar nele.
    - Todas as informações do evento devem ser exibidas corretamente.

  - Corrigir erro de "Invalid Date" na visualização da Agenda.

  - Na visualização de Mês:
    - Os dados estão sendo retornados pela API, porém os eventos não estão sendo renderizados.

  - Na visualização de Semana:
    - Os dados estão sendo retornados pela API, porém os eventos não estão sendo renderizados.

  - Quando alterar o dia selecionado, os eventos não estão sendo atualizados corretamente.

  - Corrigir erro 500 ao tentar duplicar um evento.

  - Implementar suporte a arrastar e soltar (drag and drop) para alterar data ou horário dos eventos.

  - Ao clicar em um evento:
    - Deve abrir um **HoverCard** semelhante ao Google Calendar.
    - O card deve conter:
      - Informações do evento
      - Botões de **editar**, **remover** e **duplicar**.

  - Ao clicar em um espaço vazio do calendário:
    - Deve abrir um **HoverCard para criação de evento**.
    - A data (e horário, quando aplicável) deve ser preenchida automaticamente.

  - No modo **Dia**, ao clicar em um espaço vazio:
    - O horário correspondente ao local clicado deve ser utilizado para criar o evento.

  - A seleção de data deve ser facilitada nos modos **Semana** e **Mês**, onde há muitos dias visíveis.

  - O layout da visualização **Semana** deve seguir o padrão do Google Calendar,
    exibindo a grade de horários na lateral esquerda, semelhante ao modo Dia.

  - Não é necessário manter três abas separadas (Agenda, Semana, Mês).
    O gerenciamento deve ser centralizado em um único calendário com alternância de visualização.

  - O usuário deve poder alternar entre **Dia / Semana / Mês**, e essa preferência deve ser persistida
    para melhorar a experiência na próxima visita.

  - O sistema deve seguir padrões de interação semelhantes ao **Google Calendar**,
    já que a maioria dos usuários está familiarizada com esse modelo.

  - O histórico dos eventos deve ser preservado para permitir visualização correta de dados passados,
    mesmo após alterações.

  ========================
  🗂️ Calendários / Filtros
  ========================

  - A seção de calendários está ocupando muito espaço.
    Deve ser **colapsada por padrão** e expandida apenas quando o usuário desejar.

  - Ao clicar em um calendário:
    - Ele deve ficar ativo e exibir apenas os eventos relacionados a ele.

  - Deve ser possível selecionar **apenas um calendário por vez**.

  - Ao remover a seleção:
    - Todos os calendários devem voltar a ser exibidos.

  - Hábitos devem ser considerados um **tipo de calendário**.
    Assim, deve ser possível filtrar eventos apenas de hábitos.

  - Os hábitos devem possuir **uma cor específica reservada**,
    que não pode ser utilizada por calendários comuns,
    facilitando a identificação visual.

  ========================
  🧠 Integração com Hábitos
  ========================

  - Hábitos com horário definido devem aparecer na agenda.

  - Deve ser possível marcar diretamente no calendário se o hábito foi:
    - Concluído
    - Não concluído

  - Deve ser possível alterar o horário de um hábito em um dia específico.

  - Hábitos sem horário definido devem aparecer no topo do dia,
    semelhante ao comportamento de **tarefas no Google Calendar**.

  - Se um hábito fizer parte de um **empilhamento (habit stacking)**:
    - Caso o primeiro hábito tenha horário definido,
    - os demais hábitos devem aparecer empilhados abaixo dele,
      utilizando o mesmo horário como referência visual.

  ========================
  🧭 Navegação / Layout
  ========================

  - A sidebar lateral de navegação deve iniciar **colapsada por padrão**.

  - A sidebar deve expandir:
    - ao passar o mouse sobre ela
    - ou quando o usuário clicar para expandir manualmente.

  ---

  - Deve ser possível selecionar um icon como se fosse uma avatar para o Evento.

-->
