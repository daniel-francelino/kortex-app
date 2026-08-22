<script setup lang="ts">
import type { JournalTag } from '~/types/journal'

const props = defineProps<{
  modelValue: string[]
  availableTags: JournalTag[]
  onDeleteTag?: (id: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  'update:modelValue': [string[]]
}>()

// The remove/add icon buttons and the input use the `size` prop (a JS value,
// not a CSS class), so they need the real viewport check to be big enough to
// tap reliably on mobile without ending up oversized on desktop.
const isMobile = useIsMobile()

const newTagName = ref('')

const suggestionTags = computed(() =>
  props.availableTags
    .filter(t => !props.modelValue.includes(t.name))
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

// Deleting a tag removes it everywhere (not just from this entry), so it
// gets its own confirmation instead of being a plain click like adding one.
const confirmDeleteTarget = ref<JournalTag | null>(null)
const deleting = ref(false)

async function confirmDelete() {
  if (!confirmDeleteTarget.value || !props.onDeleteTag || deleting.value) return
  deleting.value = true
  try {
    const ok = await props.onDeleteTag(confirmDeleteTarget.value.id)
    if (ok) confirmDeleteTarget.value = null
  } finally {
    deleting.value = false
  }
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
      v-if="suggestionTags.length > 0"
      class="flex flex-wrap items-center gap-2 lg:gap-1.5"
    >
      <span class="text-xs text-dimmed">Sugestões:</span>
      <div
        v-for="tag in suggestionTags"
        :key="tag.id"
        class="flex items-center gap-0.5 rounded-full border border-default py-1 pl-3 pr-1 lg:py-0.5 lg:pl-2"
      >
        <button
          type="button"
          class="text-sm text-muted transition-colors hover:text-primary lg:text-xs"
          @click="addTag(tag.name)"
        >
          {{ tag.name }}
        </button>
        <UButton
          v-if="onDeleteTag"
          icon="i-lucide-x"
          :size="isMobile ? 'md' : 'xs'"
          color="neutral"
          variant="ghost"
          square
          @click="confirmDeleteTarget = tag"
        />
      </div>
    </div>

    <UModal
      :open="!!confirmDeleteTarget"
      :ui="{ overlay: 'z-[240]', content: 'z-[250]' }"
      @update:open="confirmDeleteTarget = null"
    >
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-trash-2" class="size-4 text-error" />
          <span class="text-sm font-semibold text-highlighted">Excluir tag</span>
        </div>
      </template>

      <template #body>
        <p class="text-sm text-muted">
          Excluir "{{ confirmDeleteTarget?.name }}" a remove de <strong>todas</strong> as entradas do diário que a usam, não só desta. Isso não afeta o conteúdo das entradas, só o vínculo com a tag.
        </p>
      </template>

      <template #footer>
        <div class="flex w-full items-center justify-end gap-2">
          <UButton
            label="Cancelar"
            variant="ghost"
            color="neutral"
            :size="isMobile ? 'md' : 'sm'"
            @click="confirmDeleteTarget = null"
          />
          <UButton
            label="Excluir"
            color="error"
            icon="i-lucide-trash-2"
            :size="isMobile ? 'md' : 'sm'"
            :loading="deleting"
            @click="confirmDelete"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
