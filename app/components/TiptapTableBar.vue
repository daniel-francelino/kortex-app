<script setup lang="ts">
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null | undefined
}>()

const visible = ref(false)
const pos = ref({ x: 0, y: 0 })

function update() {
  const ed = props.editor
  if (!ed?.isEditable || !ed.isActive('table')) {
    visible.value = false
    return
  }
  try {
    const { from } = ed.state.selection
    const coords = ed.view.coordsAtPos(from)
    pos.value = { x: coords.left, y: coords.bottom + 6 }
    visible.value = true
  } catch {
    visible.value = false
  }
}

defineExpose({ update })
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && editor"
      class="ttb-bar"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
      @mousedown.prevent
    >
      <!-- Row actions -->
      <button type="button" class="ttb-btn" title="Inserir linha acima" @click="editor.chain().focus().addRowBefore().run()">
        <UIcon name="i-lucide-plus" class="size-3" />
        <UIcon name="i-lucide-chevron-up" class="size-3" />
      </button>
      <button type="button" class="ttb-btn" title="Inserir linha abaixo" @click="editor.chain().focus().addRowAfter().run()">
        <UIcon name="i-lucide-plus" class="size-3" />
        <UIcon name="i-lucide-chevron-down" class="size-3" />
      </button>
      <button type="button" class="ttb-btn ttb-btn--label" title="Excluir linha" @click="editor.chain().focus().deleteRow().run()">
        <UIcon name="i-lucide-minus" class="size-3" />
        <span>Linha</span>
      </button>

      <div class="ttb-sep" />

      <!-- Column actions -->
      <button type="button" class="ttb-btn" title="Inserir coluna à esquerda" @click="editor.chain().focus().addColumnBefore().run()">
        <UIcon name="i-lucide-plus" class="size-3" />
        <UIcon name="i-lucide-chevron-left" class="size-3" />
      </button>
      <button type="button" class="ttb-btn" title="Inserir coluna à direita" @click="editor.chain().focus().addColumnAfter().run()">
        <UIcon name="i-lucide-plus" class="size-3" />
        <UIcon name="i-lucide-chevron-right" class="size-3" />
      </button>
      <button type="button" class="ttb-btn ttb-btn--label" title="Excluir coluna" @click="editor.chain().focus().deleteColumn().run()">
        <UIcon name="i-lucide-minus" class="size-3" />
        <span>Coluna</span>
      </button>

      <div class="ttb-sep" />

      <!-- Table-level actions -->
      <button
        type="button"
        class="ttb-btn ttb-btn--label"
        :class="{ active: editor.isActive('tableHeader') }"
        title="Alternar linha de cabeçalho"
        @click="editor.chain().focus().toggleHeaderRow().run()"
      >
        <UIcon name="i-lucide-table-2" class="size-3" />
        <span>Cabeç.</span>
      </button>
      <button type="button" class="ttb-btn ttb-btn--label ttb-btn--danger" title="Excluir tabela" @click="editor.chain().focus().deleteTable().run()">
        <UIcon name="i-lucide-trash-2" class="size-3" />
        <span>Tabela</span>
      </button>
    </div>
  </Teleport>
</template>

<style>
.ttb-bar {
  position: fixed;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 1px;
  padding: 3px 5px;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 4px 16px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08);
  white-space: nowrap;
}

.ttb-btn {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 24px;
  height: 26px;
  padding: 0 5px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.ttb-btn--label span {
  font-size: 0.7rem;
  font-weight: 500;
  letter-spacing: -0.01em;
}

.ttb-btn:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.ttb-btn.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-color-primary, #18b981);
}

.ttb-btn--danger:hover {
  background: color-mix(in srgb, var(--ui-color-error, #ef4444) 10%, transparent);
  color: var(--ui-color-error, #ef4444);
}

.ttb-sep {
  width: 1px;
  height: 16px;
  background: var(--ui-border);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
