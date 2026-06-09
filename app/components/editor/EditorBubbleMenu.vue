<script setup lang="ts">
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null | undefined
  visible: boolean
  pos: { x: number, y: number }
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="kortex-bubble"
      :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
      @mousedown.prevent
    >
      <button
        type="button"
        :class="['kortex-menu-btn', { active: props.editor?.isActive('bold') }]"
        title="Negrito"
        @click="props.editor?.chain().focus().toggleBold().run()"
      >
        <UIcon name="i-lucide-bold" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn', { active: props.editor?.isActive('italic') }]"
        title="Italico"
        @click="props.editor?.chain().focus().toggleItalic().run()"
      >
        <UIcon name="i-lucide-italic" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn', { active: props.editor?.isActive('underline') }]"
        title="Sublinhado"
        @click="props.editor?.chain().focus().toggleUnderline().run()"
      >
        <UIcon name="i-lucide-underline" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn', { active: props.editor?.isActive('strike') }]"
        title="Tachado"
        @click="props.editor?.chain().focus().toggleStrike().run()"
      >
        <UIcon name="i-lucide-strikethrough" class="size-3.5" />
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn', { active: props.editor?.isActive('code') }]"
        title="Codigo inline"
        @click="props.editor?.chain().focus().toggleCode().run()"
      >
        <UIcon name="i-lucide-code" class="size-3.5" />
      </button>
      <div class="kortex-menu-sep" />
      <button
        type="button"
        :class="['kortex-menu-btn kortex-menu-btn--text', { active: props.editor?.isActive('heading', { level: 1 }) }]"
        title="Titulo 1"
        @click="props.editor?.chain().focus().toggleHeading({ level: 1 }).run()"
      >
        H1
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn kortex-menu-btn--text', { active: props.editor?.isActive('heading', { level: 2 }) }]"
        title="Titulo 2"
        @click="props.editor?.chain().focus().toggleHeading({ level: 2 }).run()"
      >
        H2
      </button>
      <button
        type="button"
        :class="['kortex-menu-btn kortex-menu-btn--text', { active: props.editor?.isActive('heading', { level: 3 }) }]"
        title="Titulo 3"
        @click="props.editor?.chain().focus().toggleHeading({ level: 3 }).run()"
      >
        H3
      </button>
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-bubble {
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
  transform: translateX(-50%) translateY(calc(-100% - 8px));
}

.kortex-menu-btn {
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

.kortex-menu-btn:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-menu-btn.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-color-primary, #18b981);
}

.kortex-menu-sep {
  width: 1px;
  height: 16px;
  background: var(--ui-border);
  margin: 0 2px;
  flex-shrink: 0;
}
</style>
