<script setup lang="ts">
import type { MoodValue } from '~/types/journal'
import { MOOD_OPTIONS } from '~/types/journal'

const props = withDefaults(defineProps<{
  modelValue?: string | null
}>(), {
  modelValue: null
})

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

function select(value: MoodValue) {
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
  <div class="flex items-center gap-0.5 sm:gap-1">
    <button
      v-for="mood in MOOD_OPTIONS"
      :key="mood.value"
      type="button"
      :class="[
        'group flex size-10 flex-col items-center justify-center gap-1 rounded-xl sm:size-12',
        'border transition-all duration-150 cursor-pointer select-none',
        modelValue === mood.value
          ? ['ring-2 border-transparent', bgClasses[mood.value]]
          : ['border-transparent', hoverClasses[mood.value]],
      ]"
      :title="mood.label"
      @click="select(mood.value)"
    >
      <span
        :class="[
          'text-lg leading-none transition-all duration-150 sm:text-xl',
          modelValue === mood.value ? 'scale-110' : '',
          modelValue !== null && modelValue !== mood.value ? 'opacity-35' : 'opacity-100',
        ]"
      >{{ mood.emoji }}</span>
    </button>
  </div>
</template>
