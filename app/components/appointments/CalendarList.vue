<script setup lang="ts">
import type { Calendar } from '~/types/appointments'

const props = defineProps<{
  calendars: Calendar[] | null | undefined
  archivedCalendars?: Calendar[] | null | undefined
  loading: boolean
  archivedLoading?: boolean
  activeCalendarId?: string
}>()

const emit = defineEmits<{
  create: []
  edit: [calendar: Calendar]
  archive: [calendar: Calendar]
  restore: [calendar: Calendar]
  toggle: [calendarId: string]
}>()

function getColor(cal: Calendar, index: number): string {
  const defaultColors = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']
  return cal.color ?? defaultColors[index % defaultColors.length] ?? '#10b981'
}

void props
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-semibold text-highlighted">
        Calendários
      </h3>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        variant="ghost"
        @click="emit('create')"
      />
    </div>

    <!-- Loading -->
    <div
      v-if="loading"
      class="space-y-2"
    >
      <USkeleton
        v-for="i in 3"
        :key="i"
        class="h-8 w-full"
      />
    </div>

    <!-- Empty -->
    <div
      v-else-if="!calendars || calendars.length === 0"
      class="text-center py-4"
    >
      <p class="text-sm text-muted">
        Nenhum calendário criado
      </p>
      <UButton
        label="Criar calendário"
        size="xs"
        variant="link"
        class="mt-1"
        @click="emit('create')"
      />
    </div>

    <!-- List -->
    <div
      v-else
      class="space-y-1"
    >
      <div
        v-for="(cal, index) in calendars"
        :key="cal.id"
        class="group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-elevated/50"
        :class="props.activeCalendarId === cal.id ? 'bg-primary/10 ring-1 ring-primary/20' : ''"
      >
        <button
          type="button"
          class="flex min-w-0 flex-1 items-center gap-2 text-left"
          @click="emit('toggle', cal.id)"
        >
          <span
            class="size-3 shrink-0 rounded-full"
            :style="{ backgroundColor: getColor(cal, index) }"
          />
          <span class="flex-1 truncate text-sm">{{ cal.name }}</span>
          <UIcon
            v-if="props.activeCalendarId === cal.id"
            name="i-lucide-check"
            class="size-4 shrink-0 text-primary"
          />
        </button>

        <UDropdownMenu
          :items="[
            [{
              label: 'Editar',
              icon: 'i-lucide-pencil',
              onSelect: () => emit('edit', cal)
            }],
            [{
              label: 'Arquivar',
              icon: 'i-lucide-archive',
              onSelect: () => emit('archive', cal)
            }]
          ]"
        >
          <UButton
            icon="i-lucide-more-horizontal"
            size="xs"
            variant="ghost"
            class="opacity-0 group-hover:opacity-100"
          />
        </UDropdownMenu>
      </div>
    </div>

    <div
      v-if="archivedLoading || archivedCalendars?.length"
      class="space-y-2 border-t border-default pt-3"
    >
      <div class="flex items-center gap-2 px-1">
        <UIcon
          name="i-lucide-archive"
          class="size-4 text-muted"
        />
        <h4 class="text-xs font-semibold uppercase tracking-wide text-muted">
          Arquivados
        </h4>
      </div>

      <div
        v-if="archivedLoading"
        class="space-y-2"
      >
        <USkeleton
          v-for="i in 2"
          :key="i"
          class="h-8 w-full"
        />
      </div>

      <div
        v-else
        class="space-y-1"
      >
        <div
          v-for="(cal, index) in archivedCalendars"
          :key="cal.id"
          class="group flex items-center gap-2 rounded-md px-2 py-1.5 text-muted transition-colors hover:bg-elevated/40"
        >
          <span
            class="size-3 shrink-0 rounded-full opacity-60"
            :style="{ backgroundColor: getColor(cal, index) }"
          />
          <span class="min-w-0 flex-1 truncate text-sm">
            {{ cal.name }}
          </span>

          <UTooltip text="Restaurar calendário">
            <UButton
              icon="i-lucide-rotate-ccw"
              size="xs"
              variant="ghost"
              class="opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              @click="emit('restore', cal)"
            />
          </UTooltip>
        </div>
      </div>
    </div>
  </div>
</template>
