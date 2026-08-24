<script setup lang="ts">
import type { SchedulingQuestion } from '~/types/scheduling'
import { SchedulingLocationType, LOCATION_TYPE_META } from '~/types/scheduling'

definePageMeta({ layout: 'app' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const pageId = route.params.id as string

const { calendars, calendarsStatus, refreshCalendars } = useAppointments()
const {
  fetchSchedulingPage,
  updateSchedulingPage,
  archiveSchedulingPage,
  regenerateShareToken,
  duplicateSchedulingPage
} = useSchedulingPages()

onMounted(() => {
  if (calendarsStatus.value === 'idle') refreshCalendars()
})

// ─── Load ────────────────────────────────────────────────────────────────────
const loading = ref(true)
const notFound = ref(false)
const saving = ref(false)
const shareToken = ref('')
const isActive = ref(true)

interface DayWindow {
  startTime: string
  endTime: string
}

const dayLabels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const weekdayIndexes = [1, 2, 3, 4, 5]

const state = reactive({
  title: '',
  description: '',
  calendarId: '',
  durationMinutes: 30,
  locationType: SchedulingLocationType.VideoLink,
  locationDetails: '',
  color: null as string | null,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  bufferBeforeMinutes: 0,
  bufferAfterMinutes: 0,
  slotIncrementMinutes: 15,
  minNoticeHours: 4,
  maxAdvanceDays: 60,
  maxBookingsPerDayEnabled: false,
  maxBookingsPerDay: 5,
  calendarEventTitleTemplate: '',
  cancellationEnabled: true,
  rescheduleEnabled: true,
  cancellationMinNoticeEnabled: false,
  cancellationMinNoticeHours: 24,
  cancellationReasonRequired: false,
  hideDetailsOnManagePage: false
})

const dayWindows = reactive<Record<number, DayWindow[]>>({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] })
const questions = ref<Array<Omit<SchedulingQuestion, 'id'>>>([])

function applyPageToState(page: NonNullable<Awaited<ReturnType<typeof fetchSchedulingPage>>>) {
  state.title = page.title
  state.description = page.description ?? ''
  state.calendarId = page.calendarId
  state.durationMinutes = page.durationMinutes
  state.locationType = page.locationType
  state.locationDetails = page.locationDetails ?? ''
  state.color = page.color
  state.timezone = page.timezone
  state.bufferBeforeMinutes = page.bufferBeforeMinutes
  state.bufferAfterMinutes = page.bufferAfterMinutes
  state.slotIncrementMinutes = page.slotIncrementMinutes
  state.minNoticeHours = page.minNoticeHours
  state.maxAdvanceDays = page.maxAdvanceDays
  state.maxBookingsPerDayEnabled = page.maxBookingsPerDay !== null
  state.maxBookingsPerDay = page.maxBookingsPerDay ?? 5
  state.calendarEventTitleTemplate = page.calendarEventTitleTemplate ?? ''
  state.cancellationEnabled = page.cancellationEnabled
  state.rescheduleEnabled = page.rescheduleEnabled
  state.cancellationMinNoticeEnabled = page.cancellationMinNoticeHours !== null
  state.cancellationMinNoticeHours = page.cancellationMinNoticeHours ?? 24
  state.cancellationReasonRequired = page.cancellationReasonRequired
  state.hideDetailsOnManagePage = page.hideDetailsOnManagePage

  shareToken.value = page.shareToken
  isActive.value = page.isActive

  for (let d = 0; d <= 6; d++) dayWindows[d] = []
  for (const rule of page.availabilityRules ?? []) {
    dayWindows[rule.dayOfWeek]!.push({ startTime: rule.startTime, endTime: rule.endTime })
  }

  questions.value = (page.questions ?? [])
    .slice()
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map(q => ({
      label: q.label,
      type: q.type,
      isRequired: q.isRequired,
      isHidden: q.isHidden,
      options: q.options,
      sortOrder: q.sortOrder
    }))
}

function serializeState(): string {
  const sortedWindows = Object.keys(dayWindows)
    .map(Number)
    .sort((a, b) => a - b)
    .map(day => ({ day, windows: dayWindows[day] }))

  return JSON.stringify({ state, sortedWindows, questions: questions.value })
}

const snapshot = ref('')
const isDirty = computed(() => snapshot.value !== '' && snapshot.value !== serializeState())

async function load() {
  loading.value = true
  const page = await fetchSchedulingPage(pageId)
  if (!page) {
    notFound.value = true
    loading.value = false
    return
  }
  applyPageToState(page)
  await nextTick()
  snapshot.value = serializeState()
  loading.value = false
}

load()

// ─── Tabs ────────────────────────────────────────────────────────────────────
const tabs = [
  { label: 'Evento', value: 'evento', icon: 'i-lucide-calendar' },
  { label: 'Disponibilidade', value: 'disponibilidade', icon: 'i-lucide-clock' },
  { label: 'Formulário', value: 'formulario', icon: 'i-lucide-list-checks' },
  { label: 'Limites', value: 'limites', icon: 'i-lucide-shield' },
  { label: 'Políticas', value: 'politicas', icon: 'i-lucide-repeat' },
  { label: 'Privacidade', value: 'privacidade', icon: 'i-lucide-lock' }
]
const activeTab = ref((typeof route.query.tab === 'string' && tabs.some(t => t.value === route.query.tab)) ? route.query.tab : 'evento')
watch(activeTab, (v) => {
  router.replace({ query: { ...route.query, tab: v } })
})

// ─── Evento ──────────────────────────────────────────────────────────────────
const calendarOptions = computed(() => (calendars.value ?? []).map(c => ({ label: c.name, value: c.id })))
const locationOptions = Object.values(SchedulingLocationType).map(value => ({ label: LOCATION_TYPE_META[value].label, value }))
const locationDetailMeta: Record<SchedulingLocationType, { label: string, placeholder: string }> = {
  [SchedulingLocationType.VideoLink]: { label: 'Link da chamada', placeholder: 'https://meet.google.com/…' },
  [SchedulingLocationType.Phone]: { label: 'Número de telefone', placeholder: '+55 11 90000-0000' },
  [SchedulingLocationType.InPerson]: { label: 'Endereço', placeholder: 'Rua Exemplo, 123' },
  [SchedulingLocationType.Custom]: { label: 'Instruções para o convidado', placeholder: 'Ex.: aguarde na recepção' }
}
const colorOptions = [
  { label: 'Verde', value: '#10b981' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Amarelo', value: '#f59e0b' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' }
]

const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone
const timezoneOptions = (typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [detectedTimezone])
  .map(tz => ({ label: tz, value: tz }))

// ─── Disponibilidade ─────────────────────────────────────────────────────────
function addWindow(day: number) {
  dayWindows[day]!.push({ startTime: '09:00', endTime: '18:00' })
}
function removeWindow(day: number, index: number) {
  dayWindows[day]!.splice(index, 1)
}
function toggleDay(day: number) {
  dayWindows[day] = dayWindows[day]!.length > 0 ? [] : [{ startTime: '09:00', endTime: '18:00' }]
}
function copyToWeekdays(day: number) {
  const source = dayWindows[day]!.map(w => ({ ...w }))
  for (const target of weekdayIndexes) {
    if (target === day) continue
    dayWindows[target] = source.map(w => ({ ...w }))
  }
  toast.add({ title: 'Horários copiados para os dias úteis', color: 'success' })
}

// ─── Formulário ──────────────────────────────────────────────────────────────
const questionSlideoverOpen = ref(false)
const editingQuestionIndex = ref<number | null>(null)
const editingQuestion = computed(() => editingQuestionIndex.value === null ? null : questions.value[editingQuestionIndex.value] ?? null)

function openNewQuestion() {
  editingQuestionIndex.value = null
  questionSlideoverOpen.value = true
}
function openEditQuestion(index: number) {
  editingQuestionIndex.value = index
  questionSlideoverOpen.value = true
}
function onSaveQuestion(value: Omit<SchedulingQuestion, 'id'>) {
  if (editingQuestionIndex.value === null) {
    questions.value.push({ ...value, sortOrder: questions.value.length })
  } else {
    const existing = questions.value[editingQuestionIndex.value]!
    questions.value[editingQuestionIndex.value] = { ...value, isHidden: existing.isHidden, sortOrder: existing.sortOrder }
  }
  questionSlideoverOpen.value = false
}
function onRemoveQuestion() {
  if (editingQuestionIndex.value === null) return
  questions.value.splice(editingQuestionIndex.value, 1)
  questionSlideoverOpen.value = false
}
function toggleQuestionHidden(index: number) {
  const q = questions.value[index]!
  questions.value[index] = { ...q, isHidden: !q.isHidden }
}
function moveQuestion(index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= questions.value.length) return
  const list = questions.value
  ;[list[index], list[target]] = [list[target]!, list[index]!]
}
function questionTypeLabel(q: Omit<SchedulingQuestion, 'id'>): string {
  if (q.type === 'select') return `Seleção · ${q.options?.length ?? 0} opções`
  if (q.type === 'textarea') return 'Texto longo'
  return 'Texto curto'
}

// ─── Header actions ──────────────────────────────────────────────────────────
const shareUrl = computed(() => {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/agendar/${shareToken.value}`
})

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value)
    toast.add({ title: 'Link copiado!', color: 'success' })
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível copiar o link.', color: 'error' })
  }
}

async function onToggleActive(value: boolean) {
  isActive.value = value
  await updateSchedulingPage(pageId, { isActive: value })
}

const duplicating = ref(false)
async function onDuplicate() {
  if (duplicating.value) return
  duplicating.value = true
  const created = await duplicateSchedulingPage(pageId)
  duplicating.value = false
  if (created) router.push(`/app/scheduling/${created.id}`)
}

const regenerateConfirmOpen = ref(false)
const regenerating = ref(false)
async function onRegenerateToken() {
  regenerating.value = true
  const updated = await regenerateShareToken(pageId)
  regenerating.value = false
  if (updated) {
    shareToken.value = updated.shareToken
    regenerateConfirmOpen.value = false
  }
}

const archiveConfirmOpen = ref(false)
const archiving = ref(false)
async function onArchive() {
  archiving.value = true
  const success = await archiveSchedulingPage(pageId)
  archiving.value = false
  if (success) router.push('/app/scheduling')
}

function onPreview() {
  window.open(shareUrl.value, '_blank')
}

// ─── Save ────────────────────────────────────────────────────────────────────
function buildPayload() {
  const availabilityRules = Object.entries(dayWindows).flatMap(([day, windows]) =>
    windows.map(w => ({ dayOfWeek: Number(day), startTime: w.startTime, endTime: w.endTime }))
  )

  return {
    calendarId: state.calendarId,
    title: state.title,
    description: state.description || undefined,
    durationMinutes: state.durationMinutes,
    locationType: state.locationType,
    locationDetails: state.locationDetails || undefined,
    timezone: state.timezone,
    color: state.color,
    bufferBeforeMinutes: state.bufferBeforeMinutes,
    bufferAfterMinutes: state.bufferAfterMinutes,
    slotIncrementMinutes: state.slotIncrementMinutes,
    minNoticeHours: state.minNoticeHours,
    maxAdvanceDays: state.maxAdvanceDays,
    maxBookingsPerDay: state.maxBookingsPerDayEnabled ? state.maxBookingsPerDay : null,
    calendarEventTitleTemplate: state.calendarEventTitleTemplate || null,
    cancellationEnabled: state.cancellationEnabled,
    rescheduleEnabled: state.rescheduleEnabled,
    cancellationMinNoticeHours: state.cancellationMinNoticeEnabled ? state.cancellationMinNoticeHours : null,
    cancellationReasonRequired: state.cancellationReasonRequired,
    hideDetailsOnManagePage: state.hideDetailsOnManagePage,
    availabilityRules,
    questions: questions.value.map((q, i) => ({ ...q, options: q.options ?? undefined, sortOrder: i }))
  }
}

const invalidTab = ref<string | null>(null)

async function onSave() {
  if (saving.value) return

  const availabilityRules = Object.values(dayWindows).flat()
  if (availabilityRules.length === 0) {
    toast.add({ title: 'Erro', description: 'Defina ao menos uma janela de disponibilidade.', color: 'error' })
    invalidTab.value = 'disponibilidade'
    return
  }
  const badSelect = questions.value.find(q => q.type === 'select' && (q.options?.length ?? 0) < 2)
  if (badSelect) {
    toast.add({ title: 'Erro', description: `A pergunta "${badSelect.label}" precisa de ao menos 2 opções.`, color: 'error' })
    invalidTab.value = 'formulario'
    return
  }
  if (!state.title.trim() || !state.calendarId) {
    toast.add({ title: 'Erro', description: 'Preencha título e calendário.', color: 'error' })
    invalidTab.value = 'evento'
    return
  }

  invalidTab.value = null
  saving.value = true
  try {
    const updated = await updateSchedulingPage(pageId, buildPayload())
    if (updated) {
      applyPageToState(updated)
      await nextTick()
      snapshot.value = serializeState()
    }
  } finally {
    saving.value = false
  }
}

// ─── Leave guard ─────────────────────────────────────────────────────────────
onBeforeRouteLeave(() => {
  if (!isDirty.value) return true
  return window.confirm('Você tem alterações não salvas. Sair mesmo assim?')
})

if (import.meta.client) {
  useEventListener(window, 'beforeunload', (e: BeforeUnloadEvent) => {
    if (!isDirty.value) return
    e.preventDefault()
  })
}
</script>

<template>
  <UDashboardPanel id="scheduling-editor">
    <template #header>
      <UDashboardNavbar :title="loading ? 'Carregando…' : state.title || 'Página de agendamento'">
        <template #leading>
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            square
            to="/app/scheduling"
          />
        </template>

        <template #right>
          <div class="hidden items-center gap-2 sm:flex">
            <UInput
              :model-value="shareUrl"
              readonly
              size="sm"
              class="w-64"
            />
            <UButton
              icon="i-lucide-copy"
              size="sm"
              color="neutral"
              variant="subtle"
              @click="copyLink"
            />
          </div>

          <USwitch :model-value="isActive" @update:model-value="onToggleActive" />

          <UDropdownMenu
            :items="[[
              { label: 'Pré-visualizar', icon: 'i-lucide-external-link', onSelect: onPreview },
              { label: 'Copiar link', icon: 'i-lucide-copy', onSelect: copyLink },
              { label: 'Duplicar página', icon: 'i-lucide-copy-plus', onSelect: onDuplicate }
            ], [
              { label: 'Regenerar link', icon: 'i-lucide-refresh-cw', onSelect: () => { regenerateConfirmOpen = true } }
            ], [
              { label: 'Arquivar', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => { archiveConfirmOpen = true } }
            ]]"
            :content="{ align: 'end' }"
          >
            <UButton
              icon="i-lucide-ellipsis-vertical"
              color="neutral"
              variant="ghost"
              square
              aria-label="Mais opções"
            />
          </UDropdownMenu>

          <UButton
            label="Salvar"
            :loading="saving"
            :disabled="!isDirty || saving || loading"
            @click="onSave"
          />
        </template>
      </UDashboardNavbar>

      <div class="border-b border-default px-4 py-1">
        <UTabs :items="tabs" :model-value="activeTab" @update:model-value="activeTab = $event as string" />
      </div>
    </template>

    <template #body>
      <div v-if="loading" class="mx-auto max-w-2xl space-y-4 p-4">
        <USkeleton class="h-8 w-1/2" />
        <USkeleton class="h-32 w-full" />
        <USkeleton class="h-32 w-full" />
      </div>

      <div v-else-if="notFound" class="flex flex-col items-center gap-3 py-16 text-center">
        <UIcon name="i-lucide-calendar-x" class="size-10 text-dimmed" />
        <p class="text-sm text-muted">
          Página de agendamento não encontrada.
        </p>
        <UButton label="Voltar" to="/app/scheduling" />
      </div>

      <div v-else class="mx-auto max-w-2xl space-y-5 p-4">
        <!-- EVENTO -->
        <div v-if="activeTab === 'evento'" class="space-y-5">
          <UCard v-if="invalidTab === 'evento'" :ui="{ root: 'ring-error' }">
            <p class="text-sm text-error">
              Corrija os campos abaixo antes de salvar.
            </p>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Detalhes
              </p>
            </template>
            <div class="space-y-4">
              <UFormField label="Título">
                <UInput v-model="state.title" class="w-full" />
              </UFormField>
              <UFormField label="Descrição" description="Aparece para o convidado no topo da página.">
                <UTextarea v-model="state.description" :rows="3" class="w-full" />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Agendamento
              </p>
            </template>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Calendário">
                <USelect
                  v-model="state.calendarId"
                  :items="calendarOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Duração (min)">
                <UInputNumber
                  v-model="state.durationMinutes"
                  :min="5"
                  :max="480"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Local
              </p>
            </template>
            <div class="grid gap-4 sm:grid-cols-2">
              <UFormField label="Tipo">
                <USelect
                  v-model="state.locationType"
                  :items="locationOptions"
                  value-key="value"
                  class="w-full"
                />
              </UFormField>
              <UFormField :label="locationDetailMeta[state.locationType].label">
                <UInput v-model="state.locationDetails" :placeholder="locationDetailMeta[state.locationType].placeholder" class="w-full" />
              </UFormField>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Cor
              </p>
            </template>
            <div class="space-y-2">
              <div class="flex gap-2">
                <button
                  v-for="opt in colorOptions"
                  :key="opt.value"
                  type="button"
                  class="size-8 rounded-full ring-2 ring-offset-2 ring-offset-default transition-all"
                  :class="state.color === opt.value ? 'ring-primary' : 'ring-transparent'"
                  :style="{ backgroundColor: opt.value }"
                  :title="opt.label"
                  @click="state.color = state.color === opt.value ? null : opt.value"
                />
              </div>
              <p class="text-xs text-muted">
                Usada só para diferenciar suas páginas na lista. O convidado não vê.
              </p>
            </div>
          </UCard>
        </div>

        <!-- DISPONIBILIDADE -->
        <div v-if="activeTab === 'disponibilidade'" class="space-y-5">
          <UCard v-if="invalidTab === 'disponibilidade'" :ui="{ root: 'ring-error' }">
            <p class="text-sm text-error">
              Defina ao menos uma janela de disponibilidade.
            </p>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Grade semanal
              </p>
            </template>
            <div class="space-y-3">
              <UFormField label="Fuso horário">
                <USelect
                  v-model="state.timezone"
                  :items="timezoneOptions"
                  value-key="value"
                  searchable
                  class="w-full sm:w-72"
                />
              </UFormField>

              <div class="space-y-2">
                <div v-for="day in 7" :key="day - 1" class="rounded-lg border border-default/60 p-2.5">
                  <div class="flex items-center gap-2">
                    <UCheckbox
                      :model-value="dayWindows[day - 1]!.length > 0"
                      :label="dayLabels[day - 1]"
                      @update:model-value="toggleDay(day - 1)"
                    />
                    <div v-if="dayWindows[day - 1]!.length > 0" class="ml-auto flex items-center gap-1">
                      <UTooltip text="Copiar para os dias úteis">
                        <UButton
                          icon="i-lucide-copy"
                          size="xs"
                          color="neutral"
                          variant="ghost"
                          @click="copyToWeekdays(day - 1)"
                        />
                      </UTooltip>
                      <UButton
                        icon="i-lucide-plus"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        @click="addWindow(day - 1)"
                      />
                    </div>
                  </div>
                  <div v-if="dayWindows[day - 1]!.length > 0" class="mt-2 space-y-1.5 pl-6">
                    <div v-for="(w, wi) in dayWindows[day - 1]" :key="wi" class="flex items-center gap-2">
                      <UInput
                        v-model="w.startTime"
                        type="time"
                        size="sm"
                        class="w-28"
                      />
                      <span class="text-xs text-muted">até</span>
                      <UInput
                        v-model="w.endTime"
                        type="time"
                        size="sm"
                        class="w-28"
                      />
                      <UButton
                        icon="i-lucide-x"
                        size="xs"
                        color="neutral"
                        variant="ghost"
                        @click="removeWindow(day - 1, wi)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Janela de reserva
              </p>
            </template>
            <div class="space-y-4">
              <UFormField label="Antecedência mínima (horas)" description="Impede reservas de última hora.">
                <UInputNumber
                  v-model="state.minNoticeHours"
                  :min="0"
                  :max="720"
                  class="w-full sm:w-40"
                />
              </UFormField>
              <UFormField label="Reservas até quantos dias no futuro">
                <UInputNumber
                  v-model="state.maxAdvanceDays"
                  :min="1"
                  :max="365"
                  class="w-full sm:w-40"
                />
              </UFormField>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Máximo de reservas por dia
                  </p>
                  <p class="text-xs text-muted">
                    Limita quantos horários podem ser preenchidos no mesmo dia.
                  </p>
                </div>
                <USwitch v-model="state.maxBookingsPerDayEnabled" />
              </div>
              <UInputNumber
                v-if="state.maxBookingsPerDayEnabled"
                v-model="state.maxBookingsPerDay"
                :min="1"
                :max="100"
                class="w-full sm:w-40"
              />
            </div>
          </UCard>
        </div>

        <!-- FORMULÁRIO -->
        <div v-if="activeTab === 'formulario'" class="space-y-5">
          <UCard v-if="invalidTab === 'formulario'" :ui="{ root: 'ring-error' }">
            <p class="text-sm text-error">
              Alguma pergunta de seleção está sem opções suficientes.
            </p>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Perguntas da reserva
              </p>
            </template>
            <div class="divide-y divide-default">
              <div class="flex items-center justify-between py-2.5">
                <div>
                  <p class="text-sm text-highlighted">
                    Seu nome
                  </p>
                  <p class="text-xs text-muted">
                    Name
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle" size="sm">
                  Obrigatório
                </UBadge>
              </div>
              <div class="flex items-center justify-between py-2.5">
                <div>
                  <p class="text-sm text-highlighted">
                    Endereço de e-mail
                  </p>
                  <p class="text-xs text-muted">
                    Email
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle" size="sm">
                  Obrigatório
                </UBadge>
              </div>

              <div v-for="(q, i) in questions" :key="i" class="flex items-center gap-2 py-2.5">
                <div class="flex flex-col">
                  <UButton
                    icon="i-lucide-chevron-up"
                    size="2xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="i === 0"
                    @click="moveQuestion(i, -1)"
                  />
                  <UButton
                    icon="i-lucide-chevron-down"
                    size="2xs"
                    color="neutral"
                    variant="ghost"
                    :disabled="i === questions.length - 1"
                    @click="moveQuestion(i, 1)"
                  />
                </div>
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm text-highlighted">
                    {{ q.label || '(sem rótulo)' }}
                  </p>
                  <p class="text-xs text-muted">
                    {{ questionTypeLabel(q) }}
                  </p>
                </div>
                <UBadge color="neutral" variant="subtle" size="sm">
                  {{ q.isRequired ? 'Obrigatória' : 'Opcional' }}
                </UBadge>
                <USwitch :model-value="!q.isHidden" @update:model-value="toggleQuestionHidden(i)" />
                <UButton
                  label="Editar"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  @click="openEditQuestion(i)"
                />
              </div>
            </div>
            <UButton
              label="Adicionar pergunta"
              icon="i-lucide-plus"
              variant="subtle"
              size="sm"
              class="mt-3"
              @click="openNewQuestion"
            />
          </UCard>
        </div>

        <!-- LIMITES -->
        <div v-if="activeTab === 'limites'" class="space-y-5">
          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Buffers e intervalos
              </p>
            </template>
            <div class="grid gap-4 sm:grid-cols-3">
              <UFormField label="Antes do evento (min)">
                <UInputNumber
                  v-model="state.bufferBeforeMinutes"
                  :min="0"
                  :max="120"
                  :step="5"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Após o evento (min)">
                <UInputNumber
                  v-model="state.bufferAfterMinutes"
                  :min="0"
                  :max="120"
                  :step="5"
                  class="w-full"
                />
              </UFormField>
              <UFormField label="Intervalo entre horários (min)" description="Ex.: 30 = oferece 9:00, 9:30, 10:00…">
                <UInputNumber
                  v-model="state.slotIncrementMinutes"
                  :min="5"
                  :max="120"
                  :step="5"
                  class="w-full"
                />
              </UFormField>
            </div>
          </UCard>
        </div>

        <!-- POLÍTICAS -->
        <div v-if="activeTab === 'politicas'" class="space-y-5">
          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Nome do evento na agenda
              </p>
            </template>
            <UFormField description="Como a reserva aparece no seu calendário. Variáveis: {titulo}, {convidado}, {email}.">
              <UInput v-model="state.calendarEventTitleTemplate" placeholder="{titulo} com {convidado}" class="w-full" />
            </UFormField>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Reagendar e cancelar
              </p>
            </template>
            <div class="space-y-4">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm font-medium text-highlighted">
                    Permitir cancelamento pelo convidado
                  </p>
                </div>
                <USwitch v-model="state.cancellationEnabled" />
              </div>
              <div v-if="state.cancellationEnabled" class="space-y-3 border-l-2 border-default/60 pl-4">
                <div class="flex items-center justify-between">
                  <p class="text-sm text-highlighted">
                    Exigir antecedência mínima
                  </p>
                  <USwitch v-model="state.cancellationMinNoticeEnabled" />
                </div>
                <UInputNumber
                  v-if="state.cancellationMinNoticeEnabled"
                  v-model="state.cancellationMinNoticeHours"
                  :min="1"
                  :max="720"
                  class="w-full sm:w-40"
                />
                <div class="flex items-center justify-between">
                  <p class="text-sm text-highlighted">
                    Exigir motivo do cancelamento
                  </p>
                  <USwitch v-model="state.cancellationReasonRequired" />
                </div>
              </div>

              <div class="flex items-center justify-between">
                <p class="text-sm font-medium text-highlighted">
                  Permitir reagendamento pelo convidado
                </p>
                <USwitch v-model="state.rescheduleEnabled" />
              </div>
            </div>
          </UCard>
        </div>

        <!-- PRIVACIDADE -->
        <div v-if="activeTab === 'privacidade'" class="space-y-5">
          <UCard>
            <template #header>
              <p class="text-sm font-medium text-highlighted">
                Privacidade
              </p>
            </template>
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium text-highlighted">
                  Ocultar detalhes na página de gerenciamento
                </p>
                <p class="text-xs text-muted">
                  O convidado vê só data, hora e status — sem local — ao abrir o link de gerenciamento.
                </p>
              </div>
              <USwitch v-model="state.hideDetailsOnManagePage" />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <p class="text-sm font-medium text-error">
                Zona de perigo
              </p>
            </template>
            <div class="space-y-3">
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-highlighted">
                    Regenerar link público
                  </p>
                  <p class="text-xs text-muted">
                    O link atual deixa de funcionar na hora.
                  </p>
                </div>
                <UButton
                  label="Regenerar"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  @click="regenerateConfirmOpen = true"
                />
              </div>
              <div class="flex items-center justify-between">
                <div>
                  <p class="text-sm text-highlighted">
                    Arquivar página
                  </p>
                  <p class="text-xs text-muted">
                    Remove a página da sua lista e desativa o link.
                  </p>
                </div>
                <UButton
                  label="Arquivar"
                  color="error"
                  variant="outline"
                  size="sm"
                  @click="archiveConfirmOpen = true"
                />
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <AppointmentsSchedulingQuestionEditSlideover
    :open="questionSlideoverOpen"
    :question="editingQuestion"
    @update:open="questionSlideoverOpen = $event"
    @save="onSaveQuestion"
    @remove="onRemoveQuestion"
  />

  <UModal v-model:open="regenerateConfirmOpen" title="Regenerar link?">
    <template #body>
      <p class="text-sm text-muted">
        O link atual ({{ shareUrl }}) deixará de funcionar imediatamente. Qualquer pessoa que já tenha esse link não conseguirá mais acessá-lo.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          @click="regenerateConfirmOpen = false"
        />
        <UButton
          label="Regenerar"
          color="error"
          :loading="regenerating"
          @click="onRegenerateToken"
        />
      </div>
    </template>
  </UModal>

  <UModal v-model:open="archiveConfirmOpen" title="Arquivar página?">
    <template #body>
      <p class="text-sm text-muted">
        A página some da sua lista e o link público deixa de funcionar. Reservas já feitas continuam na sua Agenda.
      </p>
    </template>
    <template #footer>
      <div class="flex w-full justify-end gap-2">
        <UButton
          label="Cancelar"
          color="neutral"
          variant="outline"
          @click="archiveConfirmOpen = false"
        />
        <UButton
          label="Arquivar"
          color="error"
          :loading="archiving"
          @click="onArchive"
        />
      </div>
    </template>
  </UModal>
</template>
