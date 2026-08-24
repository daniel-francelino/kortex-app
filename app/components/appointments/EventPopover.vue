<script setup lang="ts">
import type { CalendarEvent } from '~/types/appointments'
import { formatEventTime, getEventTimeZone } from '~/utils/calendarEventTime'

const props = defineProps<{
  event: CalendarEvent | null
  position: { x: number, y: number }
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  edit: [event: CalendarEvent]
  archive: [event: CalendarEvent]
  duplicate: [event: CalendarEvent]
}>()

const popoverRef = ref<HTMLElement | null>(null)

const popoverStyle = computed(() => {
  if (!props.visible || !props.position) return { display: 'none' }

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const cardW = 320
  const cardH = 280

  let left = props.position.x + 8
  let top = props.position.y - 40

  if (left + cardW > viewportW - 16) left = props.position.x - cardW - 8
  if (top + cardH > viewportH - 16) top = viewportH - cardH - 16
  if (top < 16) top = 16
  if (left < 16) left = 16

  return {
    position: 'fixed' as const,
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 50
  }
})

function formatDateTime(dateStr: string, allDay: boolean): string {
  const date = new Date(dateStr)
  const timeZone = getEventTimeZone(props.event)
  if (Number.isNaN(date.getTime())) return 'Data inválida'

  if (allDay) {
    return date.toLocaleDateString('pt-BR', {
      timeZone,
      weekday: 'short',
      day: '2-digit',
      month: 'short'
    })
  }

  return date.toLocaleDateString('pt-BR', {
    timeZone,
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  }) + ' ' + (props.event ? formatEventTime(props.event) : '')
}

function getTimeRange(evt: CalendarEvent): string {
  if (evt.allDay) return 'Dia inteiro'
  const start = formatDateTime(evt.startAt, false)
  const endTime = formatEventTime(evt, 'endAt')
  return `${start} — ${endTime}`
}

function onClickOutside(e: MouseEvent) {
  if (popoverRef.value && !popoverRef.value.contains(e.target as Node)) {
    emit('close')
  }
}

watch(() => props.visible, (val) => {
  if (val) {
    setTimeout(() => {
      document.addEventListener('mousedown', onClickOutside)
    }, 10)
  } else {
    document.removeEventListener('mousedown', onClickOutside)
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-95"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-95"
    >
      <div
        v-if="visible && event"
        ref="popoverRef"
        :style="popoverStyle"
        class="w-72 overflow-hidden rounded-xl border border-default bg-default shadow-2xl"
      >
        <!-- Top color bar -->
        <div
          class="h-1 w-full"
          :style="{ backgroundColor: event.calendar?.color ?? '#10b981' }"
        />

        <!-- Header -->
        <div class="flex items-start justify-between px-3 pt-3 pb-1">
          <div class="min-w-0 flex-1 pr-2">
            <h4 class="text-sm font-semibold leading-snug text-highlighted">
              {{ event.title }}
            </h4>
            <p class="mt-0.5 text-[11px] text-muted">
              {{ getTimeRange(event) }}
            </p>
          </div>
          <button
            class="-mr-1 -mt-0.5 rounded p-0.5 text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>

        <!-- Details -->
        <div class="space-y-1.5 px-3 py-2 text-[11px] text-muted">
          <div v-if="event.location" class="flex items-center gap-2">
            <UIcon name="i-lucide-map-pin" class="size-3 shrink-0" />
            <span class="truncate">{{ event.location }}</span>
          </div>
          <div v-if="event.calendar?.name" class="flex items-center gap-2">
            <span
              class="inline-block size-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: event.calendar.color ?? '#10b981' }"
            />
            <span class="truncate">{{ event.calendar.name }}</span>
          </div>
          <div v-if="event.rrule" class="flex items-center gap-2">
            <UIcon name="i-lucide-repeat" class="size-3 shrink-0" />
            <span>Recorrente</span>
          </div>
          <p v-if="event.description" class="line-clamp-2 leading-relaxed">
            {{ event.description }}
          </p>
        </div>

        <!-- Actions -->
        <div class="flex items-center justify-end gap-0.5 border-t border-default/50 px-2 py-1.5">
          <UButton
            icon="i-lucide-pencil"
            size="xs"
            variant="ghost"
            color="neutral"
            title="Editar"
            @click="emit('edit', event)"
          />
          <UButton
            icon="i-lucide-copy"
            size="xs"
            variant="ghost"
            color="neutral"
            title="Duplicar"
            @click="emit('duplicate', event)"
          />
          <UButton
            icon="i-lucide-trash-2"
            size="xs"
            variant="ghost"
            color="error"
            title="Remover"
            @click="emit('archive', event)"
          />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
