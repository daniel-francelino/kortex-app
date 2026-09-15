<script setup lang="ts">
import { z } from 'zod'
import type { Calendar, CalendarShare, CalendarVisibility } from '~/types/appointments'

const props = defineProps<{
  open: boolean
  calendars: Calendar[] | null | undefined
  calendar?: Calendar | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'created': []
  'updated': []
}>()

const {
  createCalendar,
  updateCalendar,
  toggleCalendarSubscribe,
  fetchCalendarShares,
  shareCalendar,
  updateCalendarSharePermission,
  removeCalendarShare
} = useAppointments()
const toast = useToast()
const isMobile = useMediaQuery('(max-width: 1023px)')
const subscribeToggling = ref(false)
const localCalendar = ref<Calendar | null>(null)

// ─── Tabs (only relevant once editing — a new calendar has no export/share
// state yet) — keeps Geral/Exportar/Compartilhar from being stacked into one
// long, mixed-together form. ──────────────────────────────────────────────
type ModalTab = 'general' | 'export' | 'share'
const modalTab = ref<ModalTab>('general')
const modalTabItems = [
  { label: 'Geral', value: 'general' },
  { label: 'Exportar', value: 'export' },
  { label: 'Compartilhar', value: 'share' }
]

// ─── Sharing ─────────────────────────────────────────────────────────────────
const shares = ref<CalendarShare[]>([])
const sharesLoading = ref(false)
const newShareEmail = ref('')
const newSharePermission = ref<'view' | 'edit'>('view')
const addingShare = ref(false)

async function loadShares() {
  if (!props.calendar) return
  sharesLoading.value = true
  shares.value = await fetchCalendarShares(props.calendar.id)
  sharesLoading.value = false
}

async function onAddShare() {
  const email = newShareEmail.value.trim()
  if (!email || !props.calendar) return
  addingShare.value = true
  const created = await shareCalendar(props.calendar.id, email, newSharePermission.value)
  addingShare.value = false
  if (created) {
    shares.value = [...shares.value, created]
    newShareEmail.value = ''
    newSharePermission.value = 'view'
  }
}

async function onChangeSharePermission(share: CalendarShare, permission: 'view' | 'edit') {
  if (!props.calendar) return
  const updated = await updateCalendarSharePermission(props.calendar.id, share.id, permission)
  if (updated) {
    shares.value = shares.value.map(s => s.id === share.id ? updated : s)
  }
}

async function onRemoveShare(share: CalendarShare) {
  if (!props.calendar) return
  const ok = await removeCalendarShare(props.calendar.id, share.id)
  if (ok) {
    shares.value = shares.value.filter(s => s.id !== share.id)
  }
}

const subscribeUrl = computed(() => {
  if (!localCalendar.value?.subscribeToken || !localCalendar.value.subscribeEnabled) return null
  const base = window.location.origin.replace(/^https?:/, 'webcal:')
  return `${base}/api/appointments/calendars/${localCalendar.value.id}/subscribe.ics?token=${encodeURIComponent(localCalendar.value.subscribeToken)}`
})

const exportUrl = computed(() => {
  if (!localCalendar.value) return null
  return `/api/appointments/calendars/${localCalendar.value.id}/export.ics`
})

async function onToggleSubscribe(enabled: boolean) {
  if (!localCalendar.value) return
  subscribeToggling.value = true
  const updated = await toggleCalendarSubscribe(localCalendar.value.id, enabled)
  if (updated) localCalendar.value = updated
  subscribeToggling.value = false
}

function onExportIcs() {
  if (!exportUrl.value) return
  window.open(exportUrl.value, '_blank')
}

async function copySubscribeUrl() {
  if (!subscribeUrl.value) return
  try {
    await navigator.clipboard.writeText(subscribeUrl.value)
    toast.add({ title: 'Link copiado!', color: 'success' })
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível copiar o link.', color: 'error' })
  }
}

const schema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(100),
  description: z.string().max(500).optional(),
  color: z.string().max(20).optional(),
  visibility: z.enum(['private', 'shared', 'public']).default('private')
})

type FormState = z.infer<typeof schema>

const state = reactive<FormState>({
  name: '',
  description: '',
  color: '#10b981',
  visibility: 'private'
})

const loading = ref(false)
const isEditing = computed(() => Boolean(props.calendar))

const colorOptions = [
  { label: 'Verde', value: '#10b981' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Amarelo', value: '#f59e0b' },
  { label: 'Vermelho', value: '#ef4444' },
  { label: 'Roxo', value: '#8b5cf6' },
  { label: 'Rosa', value: '#ec4899' }
]

async function onSubmit() {
  if (loading.value) return
  loading.value = true
  try {
    if (props.calendar) {
      const success = await updateCalendar(props.calendar.id, {
        name: state.name,
        description: state.description || null,
        color: state.color || null,
        visibility: state.visibility as CalendarVisibility
      })

      if (success) {
        emit('update:open', false)
        emit('updated')
      }

      return
    }

    const result = await createCalendar({
      name: state.name,
      description: state.description || undefined,
      color: state.color || undefined,
      visibility: state.visibility as CalendarVisibility
    })

    if (result) {
      state.name = ''
      state.description = ''
      state.color = '#10b981'
      state.visibility = 'private'
      emit('update:open', false)
      emit('created')
    }
  } finally {
    loading.value = false
  }
}

watch(
  () => [props.open, props.calendar] as const,
  ([open, calendar]) => {
    if (!open) return

    state.name = calendar?.name ?? ''
    state.description = calendar?.description ?? ''
    state.color = calendar?.color ?? '#10b981'
    state.visibility = calendar?.visibility ?? 'private'
    localCalendar.value = calendar ?? null
    shares.value = []
    modalTab.value = 'general'
    if (calendar) void loadShares()
  },
  { immediate: true }
)
</script>

<template>
  <UModal
    :open="open"
    :title="isEditing ? 'Editar calendário' : 'Novo calendário'"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UTabs
          v-if="isEditing"
          :items="modalTabItems"
          :model-value="modalTab"
          :size="isMobile ? 'md' : 'sm'"
          class="mb-2"
          @update:model-value="modalTab = $event as ModalTab"
        />

        <!-- Geral: always shown when creating (nothing else applies yet); a
             tab like the other two once editing. -->
        <div v-if="!isEditing || modalTab === 'general'" class="space-y-4">
          <UFormField
            label="Nome"
            name="name"
          >
            <UInput
              v-model="state.name"
              placeholder="Ex.: Trabalho, Pessoal..."
              :size="isMobile ? 'md' : 'sm'"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Descrição"
            name="description"
          >
            <UTextarea
              v-model="state.description"
              placeholder="Descrição opcional"
              :rows="2"
              :size="isMobile ? 'md' : 'sm'"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Cor"
            name="color"
          >
            <div class="flex gap-2">
              <button
                v-for="opt in colorOptions"
                :key="opt.value"
                type="button"
                class="max-lg:size-9 lg:size-8 rounded-full ring-2 ring-offset-2 ring-offset-default transition-all"
                :class="state.color === opt.value ? 'ring-primary' : 'ring-transparent'"
                :style="{ backgroundColor: opt.value }"
                :title="opt.label"
                @click="state.color = opt.value"
              />
            </div>
          </UFormField>
        </div>

        <!-- Exportar -->
        <div v-if="isEditing && modalTab === 'export'" class="space-y-3">
          <p class="max-lg:text-base lg:text-sm font-medium text-highlighted">
            Exportar / assinar (.ics)
          </p>
          <UButton
            icon="i-lucide-download"
            label="Exportar .ics"
            color="neutral"
            variant="subtle"
            :size="isMobile ? 'md' : 'sm'"
            @click="onExportIcs"
          />
          <div class="flex items-center gap-3">
            <UCheckbox
              :model-value="localCalendar?.subscribeEnabled ?? false"
              label="Assinatura ativa"
              :size="isMobile ? 'md' : 'sm'"
              :disabled="subscribeToggling"
              @update:model-value="onToggleSubscribe(Boolean($event))"
            />
          </div>
          <p class="max-lg:text-sm lg:text-xs text-muted">
            Gera um link para assinar este calendário em outro app (Google Calendar, Apple Calendar, etc).
          </p>
          <div v-if="subscribeUrl" class="flex items-center gap-2">
            <UInput
              :model-value="subscribeUrl"
              readonly
              class="flex-1"
              :size="isMobile ? 'md' : 'sm'"
            />
            <UButton
              icon="i-lucide-copy"
              color="neutral"
              variant="subtle"
              :size="isMobile ? 'md' : 'sm'"
              aria-label="Copiar link"
              @click="copySubscribeUrl"
            />
          </div>
        </div>

        <!-- Compartilhar -->
        <div v-if="isEditing && modalTab === 'share'" class="space-y-3">
          <p class="max-lg:text-base lg:text-sm font-medium text-highlighted">
            Compartilhar calendário
          </p>

          <div class="flex flex-wrap items-center gap-2">
            <UInput
              v-model="newShareEmail"
              type="email"
              placeholder="email@exemplo.com"
              :size="isMobile ? 'md' : 'sm'"
              class="flex-1"
              @keydown.enter="onAddShare"
            />
            <USelect
              v-model="newSharePermission"
              :items="[{ label: 'Visualizar', value: 'view' }, { label: 'Editar', value: 'edit' }]"
              value-key="value"
              :size="isMobile ? 'md' : 'sm'"
              class="w-32"
            />
            <UButton
              icon="i-lucide-plus"
              :size="isMobile ? 'md' : 'sm'"
              color="primary"
              variant="subtle"
              :loading="addingShare"
              :disabled="!newShareEmail.trim()"
              @click="onAddShare"
            />
          </div>

          <div v-if="sharesLoading" class="text-xs text-muted">
            Carregando...
          </div>
          <ul v-else-if="shares.length > 0" class="space-y-1.5">
            <li
              v-for="share in shares"
              :key="share.id"
              class="flex flex-wrap items-center gap-2 rounded-md px-2 max-lg:py-2 lg:py-1.5 max-lg:text-base lg:text-sm hover:bg-elevated"
            >
              <UIcon
                :name="share.status === 'pending' ? 'i-lucide-mail' : 'i-lucide-user'"
                class="size-3.5 shrink-0 text-dimmed"
              />
              <span class="flex-1 truncate">{{ share.invitedEmail }}</span>
              <UBadge
                v-if="share.status === 'pending'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Convite pendente
              </UBadge>
              <USelect
                :model-value="share.permission"
                :items="[{ label: 'Visualizar', value: 'view' }, { label: 'Editar', value: 'edit' }]"
                value-key="value"
                :size="isMobile ? 'md' : 'sm'"
                class="w-28"
                @update:model-value="(value: string) => onChangeSharePermission(share, value as 'view' | 'edit')"
              />
              <UButton
                icon="i-lucide-x"
                :size="isMobile ? 'md' : 'xs'"
                color="neutral"
                variant="ghost"
                @click="onRemoveShare(share)"
              />
            </li>
          </ul>
          <p v-else class="text-xs text-dimmed">
            Ninguém tem acesso ainda.
          </p>
        </div>

        <div class="flex max-lg:flex-col-reverse lg:flex-row justify-end gap-2 pt-2">
          <UButton
            label="Cancelar"
            variant="outline"
            :size="isMobile ? 'lg' : 'md'"
            :block="isMobile"
            @click="emit('update:open', false)"
          />
          <UButton
            type="submit"
            :label="isEditing ? 'Salvar' : 'Criar'"
            :size="isMobile ? 'lg' : 'md'"
            :block="isMobile"
            :loading="loading"
            :disabled="loading"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
