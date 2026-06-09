<script setup lang="ts">
type BlockTransformKind = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'taskList'

defineProps<{
  visible: boolean
  pos: { x: number, y: number }
  activeIndex: number | null
  blockCount: number
}>()

const emit = defineEmits<{
  'move': [direction: -1 | 1]
  'transform': [kind: BlockTransformKind]
  'duplicate': []
  'copy-link': []
  'copy-text': []
  'delete': []
  'dragstart': [event: DragEvent]
  'dragend': []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="kortex-block-menu"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @mousedown.stop
    >
      <button
        type="button"
        class="kortex-block-handle"
        title="Arrastar bloco"
        draggable="true"
        @dragstart="emit('dragstart', $event)"
        @dragend="emit('dragend')"
      >
        <UIcon name="i-lucide-grip-vertical" class="size-4" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Mover para cima"
        :disabled="activeIndex === 0"
        @click="emit('move', -1)"
      >
        <UIcon name="i-lucide-arrow-up" class="size-3.5" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Mover para baixo"
        :disabled="activeIndex === blockCount - 1"
        @click="emit('move', 1)"
      >
        <UIcon name="i-lucide-arrow-down" class="size-3.5" />
      </button>
      <div class="kortex-menu-sep kortex-menu-sep--vertical" />
      <button
        type="button"
        class="kortex-menu-btn kortex-menu-btn--text"
        title="Texto"
        @click="emit('transform', 'paragraph')"
      >
        T
      </button>
      <button
        type="button"
        class="kortex-menu-btn kortex-menu-btn--text"
        title="Titulo 1"
        @click="emit('transform', 'heading1')"
      >
        H1
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Lista"
        @click="emit('transform', 'bulletList')"
      >
        <UIcon name="i-lucide-list" class="size-3.5" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Tarefa"
        @click="emit('transform', 'taskList')"
      >
        <UIcon name="i-lucide-list-checks" class="size-3.5" />
      </button>
      <div class="kortex-menu-sep kortex-menu-sep--vertical" />
      <button
        type="button"
        class="kortex-menu-btn"
        title="Duplicar bloco"
        @click="emit('duplicate')"
      >
        <UIcon name="i-lucide-copy-plus" class="size-3.5" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Copiar link do bloco"
        @click="emit('copy-link')"
      >
        <UIcon name="i-lucide-link" class="size-3.5" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn"
        title="Copiar texto do bloco"
        @click="emit('copy-text')"
      >
        <UIcon name="i-lucide-copy" class="size-3.5" />
      </button>
      <button
        type="button"
        class="kortex-menu-btn kortex-menu-btn--danger"
        title="Apagar bloco"
        @click="emit('delete')"
      >
        <UIcon name="i-lucide-trash-2" class="size-3.5" />
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-block-menu {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 4px;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 4px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
  transform: translateX(-100%);
}

.kortex-menu-btn,
.kortex-block-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 28px;
  height: 28px;
  padding: 0 4px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, opacity 0.1s;
}

.kortex-menu-btn--text {
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0;
}

.kortex-menu-btn:hover,
.kortex-block-handle:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-menu-btn:disabled {
  opacity: 0.35;
  cursor: default;
}

.kortex-menu-btn--danger:hover {
  background: color-mix(in srgb, var(--ui-color-error, #ef4444) 10%, transparent);
  color: var(--ui-color-error, #ef4444);
}

.kortex-menu-sep {
  width: 1px;
  height: 16px;
  background: var(--ui-border);
  margin: 0 2px;
  flex-shrink: 0;
}

.kortex-menu-sep--vertical {
  margin: 0 1px;
}
</style>
