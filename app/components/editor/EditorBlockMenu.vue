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
