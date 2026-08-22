<script setup lang="ts">
import type { MetricDefinition, MetricValueWithDefinition } from '~/types/journal'
import { MetricType } from '~/types/journal'

const props = defineProps<{
  definitions: MetricDefinition[]
  existingValues: MetricValueWithDefinition[]
  entryDate: string
  loading?: boolean
  onUpsertMetricValues: (payload: {
    entryDate: string
    values: Array<{
      metricKey: string
      numberValue: number | null
      booleanValue: boolean | null
      textValue: string | null
      selectValue: string | null
    }>
  }) => Promise<boolean>
}>()

const emit = defineEmits<{
  saved: []
}>()

const isMobile = useIsMobile()

// Build local state from existing values
const localValues = ref<Record<string, { numberValue: number | null, booleanValue: boolean | null, textValue: string | null, selectValue: string | null }>>({})

watch(() => [props.definitions, props.existingValues], () => {
  const vals: typeof localValues.value = {}
  for (const def of props.definitions) {
    if (!def.isActive) continue
    const existing = props.existingValues.find(v => v.metricDefinitionId === def.id)
    vals[def.key] = {
      numberValue: existing?.numberValue ?? null,
      booleanValue: existing?.booleanValue ?? null,
      textValue: existing?.textValue ?? null,
      selectValue: existing?.selectValue ?? null
    }
  }
  localValues.value = vals
}, { immediate: true, deep: true })

const activeDefinitions = computed(() => props.definitions.filter(d => d.isActive))

const saving = ref(false)

async function onSave() {
  if (saving.value) return
  saving.value = true
  try {
    const values = activeDefinitions.value.map((def) => {
      const val = localValues.value[def.key] ?? { numberValue: null, booleanValue: null, textValue: null, selectValue: null }
      return { metricKey: def.key, ...val }
    })

    const ok = await props.onUpsertMetricValues({
      entryDate: props.entryDate,
      values
    })
    if (ok) {
      emit('saved')
    }
  } finally {
    saving.value = false
  }
}

function getNumberValue(key: string): number | undefined {
  const val = localValues.value[key]?.numberValue
  return val !== null && val !== undefined ? val : undefined
}

function setNumberValue(key: string, val: number | string) {
  if (!localValues.value[key]) return
  const numVal = typeof val === 'string' ? parseFloat(val) : val
  localValues.value[key].numberValue = isNaN(numVal) ? null : numVal
}

function getBooleanValue(key: string): boolean {
  return localValues.value[key]?.booleanValue ?? false
}

function setBooleanValue(key: string, val: boolean) {
  if (!localValues.value[key]) return
  localValues.value[key].booleanValue = val
}

function getTextValue(key: string): string {
  return localValues.value[key]?.textValue ?? ''
}

function setTextValue(key: string, val: string) {
  if (!localValues.value[key]) return
  localValues.value[key].textValue = val || null
}

function getSelectValue(key: string): string {
  return localValues.value[key]?.selectValue ?? ''
}

function setSelectValue(key: string, val: string) {
  if (!localValues.value[key]) return
  localValues.value[key].selectValue = val || null
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h4 class="text-sm font-medium text-highlighted">
        Métricas do dia
      </h4>
      <UButton
        label="Salvar métricas"
        :size="isMobile ? 'md' : 'sm'"
        :loading="saving"
        :disabled="saving || activeDefinitions.length === 0"
        @click="onSave"
      />
    </div>

    <div v-if="props.loading" class="space-y-3">
      <USkeleton
        v-for="i in 4"
        :key="i"
        class="h-12 w-full"
      />
    </div>

    <div
      v-else-if="activeDefinitions.length === 0"
      class="text-center py-6"
    >
      <UIcon
        name="i-lucide-gauge"
        class="size-10 text-dimmed"
      />
      <p class="text-sm text-muted mt-2">
        Nenhuma métrica configurada.
      </p>
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <div
        v-for="def in activeDefinitions"
        :key="def.id"
        class="flex flex-col gap-1 rounded-lg border border-default p-3"
      >
        <div class="flex items-center justify-between">
          <label class="text-sm font-medium text-highlighted">
            {{ def.name }}
          </label>
          <span
            v-if="def.unit"
            class="text-xs text-muted"
          >
            {{ def.unit }}
          </span>
        </div>

        <!-- Number input -->
        <UInput
          v-if="def.type === MetricType.Number || def.type === MetricType.Scale"
          type="number"
          :model-value="getNumberValue(def.key)"
          :min="def.minValue ?? undefined"
          :max="def.maxValue ?? undefined"
          :step="def.step ?? 1"
          placeholder="0"
          :size="isMobile ? 'lg' : 'sm'"
          @update:model-value="setNumberValue(def.key, $event)"
        />

        <!-- Boolean toggle -->
        <UCheckbox
          v-else-if="def.type === MetricType.Boolean"
          :model-value="getBooleanValue(def.key)"
          label="Sim"
          :size="isMobile ? 'lg' : 'sm'"
          @update:model-value="setBooleanValue(def.key, Boolean($event))"
        />

        <!-- Select -->
        <USelect
          v-else-if="def.type === MetricType.Select && def.options"
          :model-value="getSelectValue(def.key)"
          :items="def.options.map(o => ({ label: o, value: o }))"
          value-key="value"
          placeholder="Selecione..."
          :size="isMobile ? 'lg' : 'sm'"
          @update:model-value="setSelectValue(def.key, $event)"
        />

        <!-- Text -->
        <UInput
          v-else-if="def.type === MetricType.Text"
          :model-value="getTextValue(def.key)"
          placeholder="Escreva..."
          :size="isMobile ? 'lg' : 'sm'"
          @update:model-value="setTextValue(def.key, $event)"
        />
      </div>
    </div>
  </div>
</template>
