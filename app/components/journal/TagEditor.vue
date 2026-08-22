<script setup lang="ts">
import type { JournalTag } from '~/types/journal'

const props = defineProps<{
  modelValue: string[]
  availableTags: JournalTag[]
}>()

const emit = defineEmits<{
  'update:modelValue': [string[]]
}>()

// The remove/add icon buttons and the input use the `size` prop (a JS value,
// not a CSS class), so they need the real viewport check to be big enough to
// tap reliably on mobile without ending up oversized on desktop.
const isMobile = useIsMobile()

const newTagName = ref('')

const suggestions = computed(() =>
  props.availableTags
    .map(t => t.name)
    .filter(name => !props.modelValue.includes(name))
    .slice(0, 8)
)

function removeTag(name: string) {
  emit('update:modelValue', props.modelValue.filter(t => t !== name))
}

function addTag(name: string) {
  const trimmed = name.trim()
  if (!trimmed || props.modelValue.includes(trimmed)) return
  emit('update:modelValue', [...props.modelValue, trimmed])
  newTagName.value = ''
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center gap-2 lg:gap-1.5">
      <UBadge
        v-for="tag in modelValue"
        :key="tag"
        color="neutral"
        variant="subtle"
        :size="isMobile ? 'lg' : 'sm'"
        class="gap-1 pr-1"
      >
        {{ tag }}
        <UButton
          icon="i-lucide-x"
          :size="isMobile ? 'lg' : 'xs'"
          color="neutral"
          variant="ghost"
          square
          @click="removeTag(tag)"
        />
      </UBadge>

      <UInput
        v-model="newTagName"
        placeholder="Adicionar tag..."
        :size="isMobile ? 'lg' : 'xs'"
        class="w-32 flex-1 lg:w-32 lg:flex-none"
        @keydown.enter.prevent="addTag(newTagName)"
      />
      <UButton
        icon="i-lucide-plus"
        :size="isMobile ? 'lg' : 'xs'"
        color="neutral"
        variant="ghost"
        square
        :disabled="!newTagName.trim()"
        @click="addTag(newTagName)"
      />
    </div>

    <div
      v-if="suggestions.length > 0"
      class="flex flex-wrap items-center gap-2 lg:gap-1.5"
    >
      <span class="text-xs text-dimmed">Sugestões:</span>
      <button
        v-for="name in suggestions"
        :key="name"
        type="button"
        class="rounded-full border border-default px-3 py-1.5 text-sm text-muted transition-colors hover:border-primary hover:text-primary lg:px-2 lg:py-0.5 lg:text-xs"
        @click="addTag(name)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>
