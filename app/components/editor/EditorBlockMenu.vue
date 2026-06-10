<script setup lang="ts">
type BlockTransformKind = 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'bulletList' | 'taskList'

const props = defineProps<{
  visible: boolean
  pos: { x: number, y: number }
  activeIndex: number | null
  blockCount: number
}>()

const emit = defineEmits<{
  'add': []
  'move': [direction: -1 | 1]
  'transform': [kind: BlockTransformKind]
  'duplicate': []
  'copy-link': []
  'copy-text': []
  'delete': []
  'dragstart': [event: DragEvent]
  'dragend': []
}>()

const containerRef = ref<HTMLElement | null>(null)
const dropdownOpen = ref(false)
defineExpose({ containerRef, dropdownOpen })

const contextItems = computed(() => [
  [
    {
      label: 'Mover para cima',
      icon: 'i-lucide-arrow-up',
      disabled: props.activeIndex === 0,
      onSelect: () => emit('move', -1)
    },
    {
      label: 'Mover para baixo',
      icon: 'i-lucide-arrow-down',
      disabled: props.activeIndex !== null && props.activeIndex >= props.blockCount - 1,
      onSelect: () => emit('move', 1)
    }
  ],
  [
    {
      label: 'Converter em texto',
      icon: 'i-lucide-type',
      onSelect: () => emit('transform', 'paragraph')
    },
    {
      label: 'Converter em H1',
      icon: 'i-lucide-heading-1',
      onSelect: () => emit('transform', 'heading1')
    },
    {
      label: 'Converter em H2',
      icon: 'i-lucide-heading-2',
      onSelect: () => emit('transform', 'heading2')
    },
    {
      label: 'Converter em H3',
      icon: 'i-lucide-heading-3',
      onSelect: () => emit('transform', 'heading3')
    },
    {
      label: 'Lista com marcadores',
      icon: 'i-lucide-list',
      onSelect: () => emit('transform', 'bulletList')
    },
    {
      label: 'Lista de tarefas',
      icon: 'i-lucide-list-checks',
      onSelect: () => emit('transform', 'taskList')
    }
  ],
  [
    {
      label: 'Duplicar',
      icon: 'i-lucide-copy-plus',
      onSelect: () => emit('duplicate')
    },
    {
      label: 'Copiar texto',
      icon: 'i-lucide-copy',
      onSelect: () => emit('copy-text')
    }
  ],
  [
    {
      label: 'Excluir bloco',
      icon: 'i-lucide-trash-2',
      color: 'error' as const,
      onSelect: () => emit('delete')
    }
  ]
])
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="containerRef"
      class="kortex-block-controls"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
    >
      <!-- Add block -->
      <button
        type="button"
        class="kortex-block-btn"
        title="Adicionar bloco"
        @mousedown.stop
        @click="emit('add')"
      >
        <UIcon name="i-lucide-plus" class="size-3.5" />
      </button>

      <!-- Drag handle + context menu -->
      <UDropdownMenu v-model:open="dropdownOpen" :items="contextItems">
        <button
          type="button"
          class="kortex-block-btn kortex-block-drag"
          title="Arrastar ou abrir opções"
          draggable="true"
          @mousedown.stop
          @dragstart="emit('dragstart', $event)"
          @dragend="emit('dragend')"
        >
          <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
        </button>
      </UDropdownMenu>
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-block-controls {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 1px;
  transform: translateX(-100%) translateY(-50%);
  padding-right: 4px;
}

.kortex-block-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 4px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  opacity: 0.45;
  transition: background 0.1s, color 0.1s, opacity 0.1s;
}

.kortex-block-btn:hover {
  background: var(--ui-bg-elevated);
  color: var(--ui-text-highlighted);
  opacity: 1;
}

.kortex-block-drag {
  cursor: grab;
}

.kortex-block-drag:active {
  cursor: grabbing;
}
</style>
