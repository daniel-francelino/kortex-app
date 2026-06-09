<script setup lang="ts">
export interface EditorMentionItem {
  id: string
  label: string
  description?: string
  kind?: string
}

defineProps<{
  visible: boolean
  query: string
  items: EditorMentionItem[]
  pos: { x: number, y: number }
}>()

const emit = defineEmits<{
  'update:query': [value: string]
  'select': [item?: EditorMentionItem]
  'close': []
}>()

const inputRef = ref<HTMLInputElement | null>(null)

function focus() {
  inputRef.value?.focus()
}

function onInput(event: Event) {
  emit('update:query', (event.target as HTMLInputElement).value)
}

defineExpose({ focus })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="kortex-mention-menu"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
      @mousedown.prevent
    >
      <input
        ref="inputRef"
        :value="query"
        class="kortex-mention-input"
        placeholder="@mencao"
        @input="onInput"
        @keydown.escape.prevent="emit('close')"
        @keydown.enter.prevent="emit('select', items[0])"
      >

      <template v-if="items.length">
        <button
          v-for="item in items"
          :key="item.id"
          type="button"
          class="kortex-mention-item"
          @click="emit('select', item)"
        >
          <span class="kortex-mention-avatar">
            {{ item.label.slice(0, 1).toUpperCase() }}
          </span>
          <span class="kortex-mention-copy">
            <span>{{ item.label }}</span>
            <small v-if="item.description">{{ item.description }}</small>
          </span>
        </button>
      </template>

      <button
        v-else-if="query.trim()"
        type="button"
        class="kortex-mention-item"
        @click="emit('select')"
      >
        <span class="kortex-mention-avatar">@</span>
        <span class="kortex-mention-copy">
          <span>{{ query.trim() }}</span>
          <small>Mencao manual</small>
        </span>
      </button>

      <p
        v-else
        class="kortex-menu-empty"
      >
        Digite uma mencao
      </p>
    </div>
  </Teleport>
</template>
