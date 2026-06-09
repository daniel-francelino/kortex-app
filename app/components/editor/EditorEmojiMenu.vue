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
