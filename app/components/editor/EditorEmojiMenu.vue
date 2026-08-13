<script setup lang="ts">
defineProps<{
  visible: boolean
  pos: { x: number, y: number }
}>()

const emit = defineEmits<{
  select: [emoji: string, name: string]
}>()

const menuRef = ref<HTMLElement | null>(null)

defineExpose({ el: menuRef })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="menuRef"
      class="kortex-emoji-menu"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
      @mousedown.prevent
    >
      <AppEmojiPicker @select="(emoji, name) => emit('select', emoji, name)" />
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-emoji-menu {
  position: fixed;
  z-index: 9999;
  overflow: hidden;
  border-radius: 12px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
}
</style>
