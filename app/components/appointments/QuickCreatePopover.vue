<script setup lang="ts">
import type { Calendar } from '~/types/appointments'

const props = defineProps<{
  visible: boolean
  position: { x: number, y: number }
  date: string
  calendars: Calendar[] | null | undefined
}>()

const emit = defineEmits<{
  close: []
  create: [payload: { title: string, date: string, calendarId: string }]
  moreOptions: [date: string]
}>()

const popoverRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLInputElement | null>(null)
const mobileInputRef = ref<HTMLInputElement | null>(null)
const title = ref('')
const calendarId = ref('')
const isMobile = useMediaQuery('(max-width: 1023px)')

// ─── Position ─────────────────────────────────────────────────────────────
const CARD_W = 320
const CARD_H = 220

const popoverStyle = computed(() => {
  if (!props.visible) return { display: 'none' }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1200
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800

  let left = props.position.x + 12
  let top = props.position.y - 32

  if (left + CARD_W > vw - 12) left = props.position.x - CARD_W - 12
  if (top + CARD_H > vh - 12) top = vh - CARD_H - 12
  if (top < 12) top = 12
  if (left < 12) left = 12

  return {
    position: 'fixed' as const,
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 50
  }
})

// ─── Calendar helpers ──────────────────────────────────────────────────────
const calendarOptions = computed(() =>
  (props.calendars ?? []).map(c => ({ label: c.name, value: c.id }))
)

const selectedCalendar = computed<Calendar | undefined>(() =>
  (props.calendars ?? []).find(c => c.id === calendarId.value)
)

const calendarColor = computed(() => selectedCalendar.value?.color ?? '#10b981')

// ─── Date label ────────────────────────────────────────────────────────────
const dateLabel = computed(() => {
  if (!props.date) return ''
  const [year, month, day] = props.date.split('-').map(Number)
  const d = new Date(year ?? 0, (month ?? 1) - 1, day ?? 1)
  return d.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })
})

// ─── Visibility / focus ────────────────────────────────────────────────────
watch(() => props.visible, async (val) => {
  if (val) {
    title.value = ''
    if (props.calendars?.length && !calendarId.value) {
      calendarId.value = props.calendars[0]?.id ?? ''
    }
    await nextTick()
    if (isMobile.value) {
      mobileInputRef.value?.focus()
      return
    }
    inputRef.value?.focus()
    setTimeout(() => document.addEventListener('mousedown', onClickOutside), 10)
  } else {
    document.removeEventListener('mousedown', onClickOutside)
  }
})

function onClickOutside(e: MouseEvent) {
  if (popoverRef.value && !popoverRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))

// ─── Actions ───────────────────────────────────────────────────────────────
function onQuickCreate() {
  if (!title.value.trim()) return
  emit('create', { title: title.value.trim(), date: props.date, calendarId: calendarId.value })
  title.value = ''
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') { e.preventDefault(); onQuickCreate() }
  if (e.key === 'Escape') emit('close')
}
</script>

<template>
  <!-- Desktop: small floating card positioned next to the click -->
  <Teleport v-if="!isMobile" to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1 scale-[0.98]"
      enter-to-class="opacity-100 translate-y-0 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible"
        ref="popoverRef"
        :style="popoverStyle"
        class="w-80 overflow-hidden rounded-xl border border-default bg-default shadow-2xl"
      >
        <!-- Color bar (calendar color) -->
        <div
          class="h-1 w-full transition-colors duration-200"
          :style="{ backgroundColor: calendarColor }"
        />

        <!-- Header: date + close -->
        <div class="flex items-center justify-between px-4 pt-3 pb-1">
          <div class="flex items-center gap-1.5 text-xs text-muted">
            <UIcon name="i-lucide-calendar" class="size-3.5 shrink-0" />
            <span class="capitalize font-medium">{{ dateLabel }}</span>
          </div>
          <button
            class="rounded p-0.5 text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <!-- Title input -->
        <div class="px-4 py-2">
          <input
            ref="inputRef"
            v-model="title"
            type="text"
            placeholder="Adicionar título"
            class="w-full border-0 border-b border-default bg-transparent pb-1.5 text-sm font-medium text-highlighted placeholder:font-normal placeholder:text-muted/50 outline-none focus:border-primary transition-colors"
            @keydown="onKeydown"
          >
        </div>

        <!-- Calendar selector (only if multiple) -->
        <div
          v-if="calendarOptions.length > 1"
          class="flex items-center gap-2.5 px-4 py-2"
        >
          <span
            class="inline-block size-3 shrink-0 rounded-full transition-colors duration-200"
            :style="{ backgroundColor: calendarColor }"
          />
          <USelect
            v-model="calendarId"
            :items="calendarOptions"
            variant="none"
            size="sm"
            class="flex-1 text-xs"
          />
        </div>

        <!-- Footer actions -->
        <div class="flex items-center justify-between px-3 py-2.5 border-t border-default/50">
          <button
            class="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            @click="emit('moreOptions', date)"
          >
            <UIcon name="i-lucide-expand" class="size-3" />
            Mais opções
          </button>

          <UButton
            label="Salvar"
            size="xs"
            :disabled="!title.trim()"
            @click="onQuickCreate"
          />
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- Mobile: a card positioned near the tap point doesn't work once the
       keyboard opens and resizes the viewport — use a bottom sheet instead. -->
  <UDrawer
    v-else
    :open="visible"
    direction="bottom"
    :title="dateLabel"
    :ui="{ title: 'capitalize' }"
    @update:open="(value: boolean) => { if (!value) emit('close') }"
  >
    <template #body>
      <div class="flex items-center gap-2.5 pb-4">
        <span
          class="inline-block size-3 shrink-0 rounded-full transition-colors duration-200"
          :style="{ backgroundColor: calendarColor }"
        />
        <USelect
          v-if="calendarOptions.length > 1"
          v-model="calendarId"
          :items="calendarOptions"
          variant="none"
          size="md"
          class="flex-1"
        />
        <span v-else class="text-sm text-muted">{{ selectedCalendar?.name }}</span>
      </div>

      <input
        ref="mobileInputRef"
        v-model="title"
        type="text"
        placeholder="Adicionar título"
        class="w-full border-0 border-b border-default bg-transparent pb-2 text-base font-medium text-highlighted placeholder:font-normal placeholder:text-muted/50 outline-none focus:border-primary transition-colors"
        @keydown="onKeydown"
      >
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between">
        <UButton
          label="Mais opções"
          icon="i-lucide-expand"
          color="neutral"
          variant="ghost"
          @click="emit('moreOptions', date)"
        />
        <UButton
          label="Salvar"
          :disabled="!title.trim()"
          @click="onQuickCreate"
        />
      </div>
    </template>
  </UDrawer>
</template>
