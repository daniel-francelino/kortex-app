<script setup lang="ts">
import type { CalendarEvent } from '~/types/appointments'
import { formatEventTime } from '~/utils/calendarEventTime'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  date: string
  events: CalendarEvent[]
  position: { x: number, y: number }
  visible: boolean
}>()

const emit = defineEmits<{
  close: []
  selectEvent: [event: CalendarEvent, mouseEvent: MouseEvent]
}>()

const popoverRef = ref<HTMLElement | null>(null)

const popoverStyle = computed(() => {
  if (!props.visible || !props.position) return { display: 'none' }

  const viewportW = typeof window !== 'undefined' ? window.innerWidth : 1200
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800
  const cardW = 280
  const cardH = Math.min(360, 84 + props.events.length * 34)

  let left = props.position.x - cardW / 2
  let top = props.position.y - 24

  if (left + cardW > viewportW - 16) left = viewportW - cardW - 16
  if (left < 16) left = 16
  if (top + cardH > viewportH - 16) top = viewportH - cardH - 16
  if (top < 16) top = 16

  return {
    position: 'fixed' as const,
    top: `${top}px`,
    left: `${left}px`,
    zIndex: 50
  }
})

const weekdayLabel = computed(() => {
  if (!props.date) return ''
  const d = new Date(`${props.date}T00:00:00`)
  return formatDisplay(d, 'EEEEEE').replace('.', '').toUpperCase()
})

const dayNumber = computed(() => {
  if (!props.date) return ''
  const d = new Date(`${props.date}T00:00:00`)
  return String(d.getDate())
})

function getEventColor(evt: CalendarEvent): string {
  return evt.calendar?.color ?? '#10b981'
}

function onEventClick(evt: CalendarEvent, e: MouseEvent) {
  emit('selectEvent', evt, e)
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
        v-if="visible"
        ref="popoverRef"
        :style="popoverStyle"
        class="flex max-h-[360px] w-[280px] flex-col overflow-hidden rounded-xl border border-default bg-default shadow-2xl"
      >
        <!-- Header -->
        <div class="flex items-start justify-between px-3 pt-3 pb-2">
          <div>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-muted">
              {{ weekdayLabel }}
            </p>
            <p class="text-xl font-semibold leading-tight text-highlighted">
              {{ dayNumber }}
            </p>
          </div>
          <button
            class="-mr-1 -mt-0.5 rounded p-0.5 text-muted transition-colors hover:bg-elevated hover:text-highlighted"
            @click="emit('close')"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>

        <!-- Event list -->
        <div class="flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
          <button
            v-for="evt in events"
            :key="evt.id"
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-elevated"
            @click="onEventClick(evt, $event)"
          >
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: getEventColor(evt) }"
            />
            <span v-if="!evt.allDay" class="shrink-0 text-muted">{{ formatEventTime(evt) }}</span>
            <span class="min-w-0 flex-1 truncate font-medium text-highlighted">{{ evt.title }}</span>
          </button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
