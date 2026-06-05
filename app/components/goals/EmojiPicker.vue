<script setup lang="ts">
defineProps<{
  modelValue: string | null | undefined
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | null]
}>()

const pickerOpen = ref(false)

const GOAL_EMOJIS = [
  '🎯', '⭐', '💪', '🏃', '📚', '💡', '🔥', '✨',
  '🌟', '🎓', '💼', '🏆', '🚀', '💎', '🌱', '🏋️',
  '🧠', '📊', '💰', '❤️', '🤝', '🏠', '🎨', '🎵',
  '🌍', '💻', '📝', '🔑', '⚡', '🌈', '🎉', '🙏',
  '🌺', '🦁', '🦅', '🌊', '🏄', '🧘', '🎭', '🌙',
  '☀️', '🌸', '🦋', '🐉', '🦊', '🌲', '🍎', '🔭',
]

function select(emoji: string) {
  emit('update:modelValue', emoji)
  pickerOpen.value = false
}

function clear() {
  emit('update:modelValue', null)
  pickerOpen.value = false
}
</script>

<template>
  <UPopover v-model:open="pickerOpen">
    <button
      type="button"
      class="size-14 rounded-xl border-2 flex items-center justify-center transition-colors"
      :class="modelValue
        ? 'border-solid border-primary/40 bg-elevated'
        : 'border-dashed border-default hover:border-primary'"
    >
      <span v-if="modelValue" class="text-2xl leading-none select-none">{{ modelValue }}</span>
      <UIcon v-else name="i-lucide-smile-plus" class="size-6 text-muted" />
    </button>

    <template #content>
      <div class="p-2 w-56">
        <div class="grid grid-cols-8 gap-0.5">
          <button
            v-for="emoji in GOAL_EMOJIS"
            :key="emoji"
            type="button"
            class="size-6 text-sm rounded hover:bg-elevated flex items-center justify-center transition-colors leading-none"
            :class="modelValue === emoji ? 'bg-elevated ring-1 ring-primary' : ''"
            @click="select(emoji)"
          >
            {{ emoji }}
          </button>
        </div>
        <button
          v-if="modelValue"
          type="button"
          class="w-full text-xs text-muted hover:text-error text-center py-1.5 border-t border-default mt-2"
          @click="clear"
        >
          Remover emoji
        </button>
      </div>
    </template>
  </UPopover>
</template>
