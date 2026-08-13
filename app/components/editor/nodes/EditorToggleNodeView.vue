<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const isOpen = computed(() => props.node.attrs.open !== false)

function toggleOpen() {
  props.updateAttributes({ open: !isOpen.value })
}
</script>

<template>
  <NodeViewWrapper
    class="kortex-toggle"
    data-type="toggle"
    :data-open="isOpen"
  >
    <button
      type="button"
      class="kortex-toggle-chevron"
      contenteditable="false"
      :aria-expanded="isOpen"
      :title="isOpen ? 'Recolher' : 'Expandir'"
      @click="toggleOpen"
    >
      <UIcon
        name="i-lucide-chevron-right"
        class="size-3.5"
        :class="{ 'rotate-90': isOpen }"
      />
    </button>
    <NodeViewContent class="kortex-toggle-body" />
  </NodeViewWrapper>
</template>
