<script setup lang="ts">
import type { JournalTag } from '~/types/journal'

const props = defineProps<{
  modelValue: string[]
  availableTags: JournalTag[]
}>()

const emit = defineEmits<{
  'update:modelValue': [string[]]
}>()

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
    <div class="flex flex-wrap items-center gap-1.5">
      <UBadge
        v-for="tag in modelValue"
        :key="tag"
        color="neutral"
        variant="subtle"
        size="sm"
        class="gap-1 pr-1"
      >
        {{ tag }}
        <UButton
          icon="i-lucide-x"
          size="xs"
          color="neutral"
          variant="link"
          class="p-0"
          :padded="false"
          @click="removeTag(tag)"
        />
      </UBadge>

      <UInput
        v-model="newTagName"
        placeholder="Adicionar tag..."
        size="xs"
        class="w-32"
        @keydown.enter.prevent="addTag(newTagName)"
      />
      <UButton
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!newTagName.trim()"
        @click="addTag(newTagName)"
      />
    </div>

    <div
      v-if="suggestions.length > 0"
      class="flex flex-wrap items-center gap-1.5"
    >
      <span class="text-xs text-dimmed">Sugestões:</span>
      <button
        v-for="name in suggestions"
        :key="name"
        type="button"
        class="rounded-full border border-default px-2 py-0.5 text-xs text-muted transition-colors hover:border-primary hover:text-primary"
        @click="addTag(name)"
      >
        {{ name }}
      </button>
    </div>
  </div>
</template>
