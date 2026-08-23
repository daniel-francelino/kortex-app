<script setup lang="ts">
import { getMoodOption } from '~/types/journal'
import { formatPeriodLabel } from '~/utils/journal-periods'
import { isEditorContentEmpty } from '~/utils/editor/content'

const emit = defineEmits<{
  selectDate: [date: string]
}>()

const { periodType, periodKey, loading, saving, data, setType, shift, goToToday, save } = useJournalPeriods()

const isMobile = useIsMobile()

const content = ref('')
const savedContent = ref('')
const hasChanges = computed(() => content.value !== savedContent.value)

watch(() => data.value?.note, (note) => {
  const c = note?.content ?? ''
  content.value = c
  savedContent.value = c
}, { immediate: true })

async function onSave() {
  if (!hasChanges.value) return
  const ok = await save(content.value)
  if (ok) savedContent.value = content.value
}

function formatEntryDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'short',
    day: '2-digit',
    month: 'short'
  })
}
</script>

<template>
  <div class="space-y-4">
    <!-- Type toggle + navigator -->
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex items-center gap-0.5 rounded-lg border border-default p-0.5">
        <UButton
          label="Semana"
          size="sm"
          :color="periodType === 'week' ? 'primary' : 'neutral'"
          :variant="periodType === 'week' ? 'soft' : 'ghost'"
          @click="setType('week')"
        />
        <UButton
          label="Mês"
          size="sm"
          :color="periodType === 'month' ? 'primary' : 'neutral'"
          :variant="periodType === 'month' ? 'soft' : 'ghost'"
          @click="setType('month')"
        />
      </div>

      <div class="flex items-center gap-1">
        <UButton
          icon="i-lucide-chevron-left"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="shift(-1)"
        />
        <span class="min-w-40 text-center text-sm font-medium capitalize text-highlighted">
          {{ formatPeriodLabel(periodType, periodKey) }}
        </span>
        <UButton
          icon="i-lucide-chevron-right"
          color="neutral"
          variant="ghost"
          size="sm"
          @click="shift(1)"
        />
        <UButton
          label="Hoje"
          size="xs"
          variant="outline"
          color="neutral"
          class="ml-1"
          @click="goToToday"
        />
      </div>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="space-y-3">
      <USkeleton class="h-40 w-full rounded-lg" />
    </div>

    <template v-else>
      <!-- Note editor -->
      <div class="rounded-lg border border-default p-3">
        <div class="mb-2 flex items-center justify-between">
          <h4 class="text-sm font-medium text-highlighted">
            Nota do período
          </h4>
          <UButton
            label="Salvar"
            icon="i-lucide-check"
            size="xs"
            :disabled="!hasChanges || isEditorContentEmpty(content)"
            :loading="saving"
            @click="onSave"
          />
        </div>
        <ClientOnly>
          <NotionEditor
            :key="`${periodType}-${periodKey}`"
            v-model="content"
            placeholder="Reflita sobre este período... o que funcionou, o que quer mudar?"
            min-height="10rem"
          />
          <template #fallback>
            <USkeleton class="h-40 w-full rounded-lg" />
          </template>
        </ClientOnly>
      </div>

      <!-- Related daily entries -->
      <div class="rounded-lg border border-default p-3">
        <h4 class="mb-2 text-sm font-medium text-highlighted">
          Entradas do período
        </h4>
        <div v-if="(data?.entries?.length ?? 0) === 0" class="py-4 text-center text-sm text-dimmed">
          Nenhuma entrada de diário neste período.
        </div>
        <div v-else class="flex flex-col gap-1.5">
          <button
            v-for="entry in data?.entries ?? []"
            :key="entry.entryDate"
            type="button"
            class="flex items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-elevated/60"
            @click="emit('selectDate', entry.entryDate)"
          >
            <span class="w-16 shrink-0 text-xs text-muted capitalize">{{ formatEntryDate(entry.entryDate) }}</span>
            <span
              v-if="getMoodOption(entry.mood)"
              class="shrink-0 text-sm leading-none"
            >{{ getMoodOption(entry.mood)?.emoji }}</span>
            <span class="truncate text-sm text-highlighted">
              {{ entry.isEncrypted ? 'Entrada protegida' : (entry.title || 'Sem título') }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </div>
</template>
