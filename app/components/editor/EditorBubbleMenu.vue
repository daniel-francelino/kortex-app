<script setup lang="ts">
import type { Editor } from '@tiptap/core'

const props = defineProps<{
  editor: Editor | null | undefined
  visible: boolean
  pos: { x: number, y: number }
}>()

type BubbleView = 'toolbar' | 'link' | 'turninto' | 'color'
type ColorMode = 'text' | 'highlight'

const view = ref<BubbleView>('toolbar')
const colorMode = ref<ColorMode>('text')
const linkUrl = ref('')
const linkInputRef = ref<HTMLInputElement | null>(null)
const bubbleRef = ref<HTMLElement | null>(null)

// Same ~9-color set Notion uses for both text color and highlight — kept
// separate from the palette used elsewhere in the app (AppEmojiPicker, tags)
// since these need to read clearly as small text/background swatches.
const COLOR_SWATCHES = [
  { label: 'Cinza', value: '#9ca3af' },
  { label: 'Marrom', value: '#a8734a' },
  { label: 'Laranja', value: '#f97316' },
  { label: 'Amarelo', value: '#eab308' },
  { label: 'Verde', value: '#22c55e' },
  { label: 'Azul', value: '#3b82f6' },
  { label: 'Roxo', value: '#a855f7' },
  { label: 'Rosa', value: '#ec4899' },
  { label: 'Vermelho', value: '#ef4444' }
]

function openColorView(mode: ColorMode) {
  colorMode.value = mode
  view.value = 'color'
}

function applyColor(value: string | null) {
  if (colorMode.value === 'text') {
    if (value) props.editor?.chain().focus().setColor(value).run()
    else props.editor?.chain().focus().unsetColor().run()
  } else {
    if (value) props.editor?.chain().focus().toggleHighlight({ color: value }).run()
    else props.editor?.chain().focus().unsetHighlight().run()
  }
  view.value = 'toolbar'
}

const BLOCK_TYPES = [
  { key: 'paragraph', label: 'Texto', icon: 'i-lucide-type', action: (e: Editor) => e.chain().focus().setParagraph().run() },
  { key: 'heading1', label: 'Título 1', icon: 'i-lucide-heading-1', action: (e: Editor) => e.chain().focus().setHeading({ level: 1 }).run() },
  { key: 'heading2', label: 'Título 2', icon: 'i-lucide-heading-2', action: (e: Editor) => e.chain().focus().setHeading({ level: 2 }).run() },
  { key: 'heading3', label: 'Título 3', icon: 'i-lucide-heading-3', action: (e: Editor) => e.chain().focus().setHeading({ level: 3 }).run() },
  { key: 'bulletList', label: 'Lista com marcadores', icon: 'i-lucide-list', action: (e: Editor) => e.chain().focus().toggleBulletList().run() },
  { key: 'orderedList', label: 'Lista numerada', icon: 'i-lucide-list-ordered', action: (e: Editor) => e.chain().focus().toggleOrderedList().run() },
  { key: 'blockquote', label: 'Citação', icon: 'i-lucide-quote', action: (e: Editor) => e.chain().focus().toggleBlockquote().run() },
  { key: 'codeBlock', label: 'Bloco de código', icon: 'i-lucide-code-2', action: (e: Editor) => e.chain().focus().toggleCodeBlock().run() },
]

const currentBlockType = computed(() => {
  const e = props.editor
  if (!e) return BLOCK_TYPES[0]!
  if (e.isActive('heading', { level: 1 })) return BLOCK_TYPES[1]!
  if (e.isActive('heading', { level: 2 })) return BLOCK_TYPES[2]!
  if (e.isActive('heading', { level: 3 })) return BLOCK_TYPES[3]!
  if (e.isActive('bulletList')) return BLOCK_TYPES[4]!
  if (e.isActive('orderedList')) return BLOCK_TYPES[5]!
  if (e.isActive('blockquote')) return BLOCK_TYPES[6]!
  if (e.isActive('codeBlock')) return BLOCK_TYPES[7]!
  return BLOCK_TYPES[0]!
})

function openLinkView() {
  const existing = props.editor?.getAttributes('link').href ?? ''
  linkUrl.value = existing
  view.value = 'link'
  nextTick(() => linkInputRef.value?.focus())
}

function applyLink() {
  const url = linkUrl.value.trim()
  if (url) {
    const href = /^https?:\/\//.test(url) ? url : `https://${url}`
    props.editor?.chain().focus().setLink({ href }).run()
  } else {
    props.editor?.chain().focus().unsetLink().run()
  }
  view.value = 'toolbar'
  linkUrl.value = ''
}

function selectBlockType(item: typeof BLOCK_TYPES[number]) {
  if (props.editor) item.action(props.editor)
  view.value = 'toolbar'
}

function clearFormatting() {
  props.editor?.chain().focus().clearNodes().unsetAllMarks().run()
}

watch(() => props.visible, (v) => {
  if (!v) {
    view.value = 'toolbar'
    linkUrl.value = ''
  }
})

defineExpose({ el: bubbleRef })
</script>

<template>
  <Teleport to="body">
    <Transition name="kortex-bubble-anim">
      <div
        v-if="visible"
        ref="bubbleRef"
        class="kortex-bubble"
        :class="`kortex-bubble--${view}`"
        :style="{ left: `${pos.x}px`, top: `${pos.y}px` }"
        @mousedown.prevent
      >
        <!-- Link editing view -->
        <template v-if="view === 'link'">
          <button
            type="button"
            class="kortex-menu-btn"
            title="Voltar"
            @click="view = 'toolbar'"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          </button>
          <div class="kortex-bubble-link-wrap">
            <UIcon name="i-lucide-link" class="size-3 text-muted shrink-0" />
            <input
              ref="linkInputRef"
              v-model="linkUrl"
              class="kortex-bubble-link-input"
              placeholder="Cole ou digite um URL..."
              @keydown.enter.prevent="applyLink"
              @keydown.escape.prevent="view = 'toolbar'"
            >
          </div>
          <button
            type="button"
            class="kortex-menu-btn"
            :disabled="!linkUrl.trim()"
            title="Aplicar"
            @click="applyLink"
          >
            <UIcon name="i-lucide-check" class="size-3.5" />
          </button>
          <template v-if="editor?.isActive('link')">
            <div class="kortex-menu-sep" />
            <button
              type="button"
              class="kortex-menu-btn kortex-menu-btn--danger"
              title="Remover link"
              @click="editor?.chain().focus().unsetLink().run(); view = 'toolbar'"
            >
              <UIcon name="i-lucide-unlink" class="size-3.5" />
            </button>
          </template>
        </template>

        <!-- Turn into view -->
        <template v-else-if="view === 'turninto'">
          <button
            type="button"
            class="kortex-menu-btn"
            title="Voltar"
            @click="view = 'toolbar'"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          </button>
          <div class="kortex-menu-sep" />
          <p class="kortex-bubble-section-label">
            Converter em
          </p>
          <div class="kortex-menu-sep" />
          <button
            v-for="item in BLOCK_TYPES"
            :key="item.key"
            type="button"
            :class="['kortex-menu-btn kortex-bubble-turn-btn', { active: currentBlockType.key === item.key }]"
            :title="item.label"
            @click="selectBlockType(item)"
          >
            <UIcon :name="item.icon" class="size-3.5" />
          </button>
        </template>

        <!-- Color / highlight view -->
        <template v-else-if="view === 'color'">
          <button
            type="button"
            class="kortex-menu-btn"
            title="Voltar"
            @click="view = 'toolbar'"
          >
            <UIcon name="i-lucide-arrow-left" class="size-3.5" />
          </button>
          <div class="kortex-menu-sep" />
          <div class="kortex-bubble-color-swatches">
            <button
              type="button"
              class="kortex-menu-btn kortex-bubble-color-swatch kortex-bubble-color-swatch--none"
              title="Padrão"
              @click="applyColor(null)"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
            <button
              v-for="swatch in COLOR_SWATCHES"
              :key="swatch.value"
              type="button"
              class="kortex-menu-btn kortex-bubble-color-swatch"
              :title="swatch.label"
              :style="{ '--swatch-color': swatch.value }"
              @click="applyColor(swatch.value)"
            />
          </div>
        </template>

        <!-- Default toolbar -->
        <template v-else>
          <!-- Block type indicator -->
          <button
            type="button"
            class="kortex-menu-btn kortex-bubble-type-btn"
            title="Converter tipo de bloco"
            @click="view = 'turninto'"
          >
            <UIcon :name="currentBlockType.icon" class="size-3.5" />
            <span class="kortex-bubble-type-label">{{ currentBlockType.label }}</span>
            <UIcon name="i-lucide-chevron-down" class="size-3 opacity-50" />
          </button>

          <div class="kortex-menu-sep" />

          <!-- Text marks -->
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('bold') }]"
            title="Negrito"
            @click="editor?.chain().focus().toggleBold().run()"
          >
            <UIcon name="i-lucide-bold" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('italic') }]"
            title="Itálico"
            @click="editor?.chain().focus().toggleItalic().run()"
          >
            <UIcon name="i-lucide-italic" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('underline') }]"
            title="Sublinhado"
            @click="editor?.chain().focus().toggleUnderline().run()"
          >
            <UIcon name="i-lucide-underline" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('strike') }]"
            title="Tachado"
            @click="editor?.chain().focus().toggleStrike().run()"
          >
            <UIcon name="i-lucide-strikethrough" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('code') }]"
            title="Código inline"
            @click="editor?.chain().focus().toggleCode().run()"
          >
            <UIcon name="i-lucide-code" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: !!editor?.getAttributes('textStyle').color }]"
            title="Cor do texto"
            @click="openColorView('text')"
          >
            <UIcon name="i-lucide-baseline" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('highlight') }]"
            title="Destaque"
            @click="openColorView('highlight')"
          >
            <UIcon name="i-lucide-highlighter" class="size-3.5" />
          </button>

          <div class="kortex-menu-sep" />

          <!-- Link & utilities -->
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive('link') }]"
            title="Link"
            @click="openLinkView"
          >
            <UIcon name="i-lucide-link" class="size-3.5" />
          </button>
          <UTooltip text="Limpar formatação">
            <button
              type="button"
              class="kortex-menu-btn"
              @click="clearFormatting"
            >
              <UIcon name="i-lucide-remove-formatting" class="size-3.5" />
            </button>
          </UTooltip>

          <div class="kortex-menu-sep" />

          <!-- Alignment -->
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive({ textAlign: 'left' }) }]"
            title="Alinhar à esquerda"
            @click="editor?.chain().focus().setTextAlign('left').run()"
          >
            <UIcon name="i-lucide-align-left" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive({ textAlign: 'center' }) }]"
            title="Centralizar"
            @click="editor?.chain().focus().setTextAlign('center').run()"
          >
            <UIcon name="i-lucide-align-center" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive({ textAlign: 'right' }) }]"
            title="Alinhar à direita"
            @click="editor?.chain().focus().setTextAlign('right').run()"
          >
            <UIcon name="i-lucide-align-right" class="size-3.5" />
          </button>
          <button
            type="button"
            :class="['kortex-menu-btn', { active: editor?.isActive({ textAlign: 'justify' }) }]"
            title="Justificado"
            @click="editor?.chain().focus().setTextAlign('justify').run()"
          >
            <UIcon name="i-lucide-align-justify" class="size-3.5" />
          </button>
        </template>
      </div>
    </Transition>
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
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14), 0 2px 6px rgba(0, 0, 0, 0.08);
  white-space: nowrap;
  transform: translateX(-50%) translateY(calc(-100% - 8px));
  will-change: transform, opacity;
}

.kortex-bubble--link {
  min-width: 280px;
}

/* Entrance animation */
.kortex-bubble-anim-enter-active {
  transition: opacity 0.12s ease, transform 0.12s cubic-bezier(0.2, 0, 0, 1.2);
}

.kortex-bubble-anim-leave-active {
  transition: opacity 0.08s ease, transform 0.08s ease;
}

.kortex-bubble-anim-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(-100% - 4px)) scale(0.94);
}

.kortex-bubble-anim-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(calc(-100% - 12px)) scale(0.96);
}

/* Block type button */
.kortex-bubble-type-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 8px;
  min-width: unset;
}

.kortex-bubble-type-label {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--ui-text-muted);
  max-width: 72px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-bubble-type-btn:hover .kortex-bubble-type-label {
  color: var(--ui-text-highlighted);
}

/* Turn-into view */
.kortex-bubble-section-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ui-text-dimmed);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 0 6px;
  margin: 0;
  white-space: nowrap;
}

.kortex-bubble-turn-btn {
  min-width: 28px;
}

/* Color / highlight swatches — own gap instead of the 1px shared by toolbar
 * icons, which reads as "stuck together" on circular color swatches. */
.kortex-bubble-color-swatches {
  display: flex;
  align-items: center;
  gap: 6px;
}

/* Color / highlight swatches — the extra `.kortex-menu-btn` in the selector
 * isn't redundant: it bumps specificity above the shared `.kortex-menu-btn`
 * background rule below (same specificity, defined later, would otherwise
 * always win and render every swatch transparent regardless of its color). */
.kortex-menu-btn.kortex-bubble-color-swatch {
  min-width: 22px;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--swatch-color, transparent);
  border: 1px solid color-mix(in srgb, var(--swatch-color, var(--ui-border)) 60%, transparent);
}

.kortex-menu-btn.kortex-bubble-color-swatch:hover {
  background: var(--swatch-color, transparent);
  transform: scale(1.12);
}

.kortex-menu-btn.kortex-bubble-color-swatch--none {
  background: transparent;
  border: 1px dashed var(--ui-border);
  color: var(--ui-text-dimmed);
}

/* Link editing */
.kortex-bubble-link-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 0 6px;
  flex: 1;
  min-width: 0;
  border-radius: 5px;
  background: var(--ui-bg-muted);
  height: 26px;
}

.kortex-bubble-link-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  font-size: 0.8125rem;
  color: var(--ui-text-highlighted);
  line-height: 1;
}

.kortex-bubble-link-input::placeholder {
  color: var(--ui-text-dimmed);
}

/* Shared button styles */
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
  flex-shrink: 0;
}

.kortex-menu-btn:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-menu-btn.active {
  background: var(--ui-bg-elevated);
  color: var(--ui-color-primary, #18b981);
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

/* ─── Mobile: bigger touch targets, wrap instead of overflowing the screen ───
 * At ~15 buttons wide, the toolbar view alone is easily wider than a phone
 * viewport — `white-space: nowrap` (desktop) meant it just ran off both
 * edges there, with no way to reach whatever fell outside. Wrapping is safe
 * with the position clamp already in place (NotionStyleEditor.vue): it
 * measures the real, already-wrapped rect after render, so a taller/wrapped
 * menu still ends up positioned on screen. */
@media (max-width: 1023px) {
  .kortex-bubble {
    max-width: calc(100vw - 24px);
    flex-wrap: wrap;
    white-space: normal;
    justify-content: center;
  }

  .kortex-bubble--link {
    min-width: min(280px, calc(100vw - 24px));
  }

  .kortex-menu-btn {
    min-width: 40px;
    height: 40px;
  }

  .kortex-menu-btn.kortex-bubble-color-swatch {
    min-width: 32px;
    width: 32px;
    height: 32px;
  }

  .kortex-bubble-color-swatches {
    gap: 8px;
  }

  .kortex-menu-sep {
    height: 22px;
  }
}
</style>
