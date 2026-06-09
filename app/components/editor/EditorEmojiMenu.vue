<script setup lang="ts">
export interface EditorEmojiItem {
  emoji: string
  name: string
  label: string
}

defineProps<{
  visible: boolean
  items: EditorEmojiItem[]
  pos: { x: number, y: number }
}>()

const emit = defineEmits<{
  select: [item: EditorEmojiItem]
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="kortex-emoji-menu"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
      @mousedown.prevent
    >
      <button
        v-for="item in items"
        :key="item.name"
        type="button"
        class="kortex-emoji-item"
        :title="item.label"
        @click="emit('select', item)"
      >
        <span>{{ item.emoji }}</span>
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-emoji-menu {
  position: fixed;
  z-index: 9999;
  display: grid;
  grid-template-columns: repeat(4, 36px);
  gap: 4px;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
}

.kortex-emoji-item {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;
  font-size: 1.2rem;
}

.kortex-emoji-item:hover {
  background: var(--ui-bg-muted);
}
</style>
