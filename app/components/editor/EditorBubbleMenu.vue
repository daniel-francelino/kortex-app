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
