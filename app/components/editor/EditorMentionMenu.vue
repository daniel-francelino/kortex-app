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

<style scoped>
.kortex-mention-menu {
  position: fixed;
  z-index: 9999;
  width: 260px;
  max-height: 300px;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
}

.kortex-mention-input {
  width: 100%;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
  font-size: 0.8125rem;
  outline: none;
  padding: 0.45rem 0.55rem;
  margin-bottom: 0.35rem;
}

.kortex-mention-input:focus {
  border-color: var(--ui-color-primary, #18b981);
}

.kortex-mention-item {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  width: 100%;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--ui-text-highlighted);
  padding: 0.4rem 0.45rem;
  text-align: left;
  cursor: pointer;
}

.kortex-mention-item:hover {
  background: var(--ui-bg-muted);
}

.kortex-mention-avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 999px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  color: var(--ui-text-muted);
  font-size: 0.75rem;
  font-weight: 700;
  flex-shrink: 0;
}

.kortex-mention-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.05rem;
  font-size: 0.8125rem;
}

.kortex-mention-copy span,
.kortex-mention-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-mention-copy small {
  color: var(--ui-text-muted);
  font-size: 0.7rem;
}

.kortex-menu-empty {
  padding: 8px;
  font-size: 0.8125rem;
  color: var(--ui-text-muted);
  text-align: center;
  margin: 0;
}
</style>
