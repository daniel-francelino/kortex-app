<script setup lang="ts">
import type { MoodValue } from '~/types/journal'
import { MOOD_OPTIONS } from '~/types/journal'

const props = withDefaults(defineProps<{
  modelValue?: string | null
  label?: string
}>(), {
  modelValue: null,
  label: 'Como foi o seu dia?',
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

function select(value: MoodValue) {
  // Click same → deselect
  emit('update:modelValue', props.modelValue === value ? null : value)
}

const bgClasses: Record<MoodValue, string> = {
  very_bad: 'bg-red-100 dark:bg-red-950/40 ring-red-300 dark:ring-red-800',
  bad: 'bg-orange-100 dark:bg-orange-950/40 ring-orange-300 dark:ring-orange-800',
  neutral: 'bg-slate-100 dark:bg-slate-800/60 ring-slate-300 dark:ring-slate-600',
  good: 'bg-green-100 dark:bg-green-950/40 ring-green-300 dark:ring-green-800',
  very_good: 'bg-emerald-100 dark:bg-emerald-950/40 ring-emerald-300 dark:ring-emerald-800'
}

const hoverClasses: Record<MoodValue, string> = {
  very_bad: 'hover:bg-red-50 dark:hover:bg-red-950/20',
  bad: 'hover:bg-orange-50 dark:hover:bg-orange-950/20',
  neutral: 'hover:bg-slate-50 dark:hover:bg-slate-800/40',
  good: 'hover:bg-green-50 dark:hover:bg-green-950/20',
  very_good: 'hover:bg-emerald-50 dark:hover:bg-emerald-950/20'
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm font-medium text-muted">
      {{ label }}
    </p>

    <div class="flex items-stretch gap-2">
      <button
        v-for="mood in MOOD_OPTIONS"
        :key="mood.value"
        type="button"
        :class="[
          'flex flex-col items-center justify-center gap-1.5 flex-1 py-3 px-1 rounded-xl',
          'border transition-all duration-150 cursor-pointer select-none',
          modelValue === mood.value
            ? ['ring-2 border-transparent', bgClasses[mood.value]]
            : ['border-transparent', hoverClasses[mood.value]],
        ]"
        :title="mood.label"
        @click="select(mood.value)"
      >
        <!-- Emoji -->
        <span
          :class="[
            'transition-transform duration-150 leading-none',
            modelValue === mood.value ? 'text-3xl scale-110' : 'text-2xl',
            modelValue !== null && modelValue !== mood.value ? 'opacity-40' : 'opacity-100',
          ]"
        >{{ mood.emoji }}</span>

        <!-- Label — always visible on selected, hidden on others -->
        <span
          :class="[
            'text-[10px] font-medium leading-none text-center transition-all duration-150 whitespace-nowrap',
            modelValue === mood.value ? 'opacity-100' : 'opacity-0',
          ]"
          :style="{ color: mood.color }"
        >{{ mood.label }}</span>
      </button>
    </div>
  </div>
</template>
