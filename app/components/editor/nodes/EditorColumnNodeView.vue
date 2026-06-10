<script setup lang="ts">
import type { Node as PmNode } from '@tiptap/pm/model'
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const menuOpen = ref(false)
const isLastCol = ref(true)

// ─── Column position info ──────────────────────────────────────────────────────

function getColInfo() {
  const pos = props.getPos()
  if (pos === undefined) {
    return { index: 0, total: 1, isLast: true, parentStart: -1, parent: null as PmNode | null }
  }
  const $pos = props.editor.state.doc.resolve(pos)
  const parent = $pos.parent
  const parentStart = $pos.start() - 1
  let index = 0
  let total = 0

  parent.forEach((_child: PmNode, childOffset: number) => {
    if ($pos.parentOffset === childOffset) index = total
    total++
  })

  return { index, total, isLast: index === total - 1, parentStart, parent }
}

watch(() => props.node, () => {
  isLastCol.value = getColInfo().isLast
}, { immediate: true })

const widthStyle = computed(() => {
  const w = props.node.attrs.width as number | null
  return w ? { flex: `0 0 ${w}%` } : {}
})

const isEmpty = computed(() => !props.node.textContent.trim())

// ─── Resize ────────────────────────────────────────────────────────────────────

let resizeStartX = 0
let resizeStartW = 0
let resizeStartNextW = 0
let resizingNextEl: HTMLElement | null = null

function getColEl(): HTMLElement | null {
  const pos = props.getPos()
  if (pos === undefined) return null
  return props.editor.view.nodeDOM(pos) as HTMLElement | null
}

function onResizeDown(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()

  const el = getColEl()
  if (!el) return

  const nextEl = el.nextElementSibling as HTMLElement | null
  if (!nextEl || nextEl.getAttribute('data-type') !== 'column') return

  resizeStartX = e.clientX
  resizeStartW = el.getBoundingClientRect().width
  resizeStartNextW = nextEl.getBoundingClientRect().width
  resizingNextEl = nextEl

  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeUp, { once: true })
}

function onResizeMove(e: MouseEvent) {
  const el = getColEl()
  if (!el || !resizingNextEl) return

  const dx = e.clientX - resizeStartX
  const minW = 120
  const total = resizeStartW + resizeStartNextW

  let newW = resizeStartW + dx
  let newNextW = resizeStartNextW - dx

  if (newW < minW) { newW = minW; newNextW = total - minW }
  if (newNextW < minW) { newNextW = minW; newW = total - minW }

  el.style.flex = `0 0 ${newW}px`
  resizingNextEl.style.flex = `0 0 ${newNextW}px`
}

function onResizeUp() {
  document.removeEventListener('mousemove', onResizeMove)

  const el = getColEl()
  if (!el || !resizingNextEl) { resizingNextEl = null; return }

  const containerW = el.parentElement?.getBoundingClientRect().width ?? 0

  if (!containerW) {
    el.style.flex = ''
    resizingNextEl.style.flex = ''
    resizingNextEl = null
    return
  }

  const newPct = Math.round((el.getBoundingClientRect().width / containerW) * 1000) / 10
  const newNextPct = Math.round((resizingNextEl.getBoundingClientRect().width / containerW) * 1000) / 10

  el.style.flex = ''
  resizingNextEl.style.flex = ''

  const localNext = resizingNextEl
  resizingNextEl = null

  const pos = props.getPos()
  if (pos === undefined) return

  // Find next column's position in the doc
  const nextPos = pos + props.node.nodeSize
  const nextNode = props.editor.state.doc.nodeAt(nextPos)
  if (!nextNode) return

  // Verify we're actually looking at a column node
  if (nextNode.type.name !== 'column') return

  props.editor.chain()
    .command(({ tr }) => {
      tr.setNodeMarkup(pos, null, { ...props.node.attrs, width: newPct })
      tr.setNodeMarkup(nextPos, null, { ...nextNode.attrs, width: newNextPct })
      return true
    })
    .run()

  void localNext
}

// ─── Column management ─────────────────────────────────────────────────────────

function addColumn(side: 'left' | 'right') {
  const pos = props.getPos()
  if (pos === undefined) return
  menuOpen.value = false

  const { parent, parentStart, total } = getColInfo()
  if (!parent) return

  const newTotal = total + 1
  const equalW = +(100 / newTotal).toFixed(2)
  const parentEnd = parentStart + parent.nodeSize

  const newColNode = props.editor.state.schema.nodes.column!.create(
    { width: equalW },
    [props.editor.state.schema.nodes.paragraph!.create()]
  )

  const newCols: PmNode[] = []
  let inserted = false

  parent.forEach((child: PmNode, childOffset: number) => {
    const childPos = parentStart + 1 + childOffset
    const updated = child.type.create({ ...child.attrs, width: equalW }, child.content, child.marks)

    if (side === 'left' && childPos === pos && !inserted) {
      newCols.push(newColNode)
      inserted = true
    }
    newCols.push(updated)
    if (side === 'right' && childPos === pos && !inserted) {
      newCols.push(newColNode)
      inserted = true
    }
  })

  const newCols2 = parent.type.create(parent.attrs, newCols, parent.marks)
  props.editor.chain().command(({ tr }) => { tr.replaceWith(parentStart, parentEnd, newCols2); return true }).run()
}

function deleteColumn() {
  const pos = props.getPos()
  if (pos === undefined) return
  menuOpen.value = false

  const { parent, parentStart, total } = getColInfo()
  if (!parent) return

  const parentEnd = parentStart + parent.nodeSize

  if (total <= 2) {
    const otherBlocks: PmNode[] = []
    parent.forEach((child: PmNode, childOffset: number) => {
      if (parentStart + 1 + childOffset !== pos) {
        child.content.forEach((b: PmNode) => otherBlocks.push(b))
      }
    })
    props.editor.chain()
      .command(({ tr, state }) => {
        tr.replaceWith(parentStart, parentEnd, otherBlocks.length ? otherBlocks : [state.schema.nodes.paragraph!.create()])
        return true
      })
      .run()
    return
  }

  const equalW = +(100 / (total - 1)).toFixed(2)
  const newCols: PmNode[] = []

  parent.forEach((child: PmNode, childOffset: number) => {
    if (parentStart + 1 + childOffset !== pos) {
      newCols.push(child.type.create({ ...child.attrs, width: equalW }, child.content, child.marks))
    }
  })

  const newColumnsNode = parent.type.create(parent.attrs, newCols, parent.marks)
  props.editor.chain().command(({ tr }) => { tr.replaceWith(parentStart, parentEnd, newColumnsNode); return true }).run()
}

// Close menu on outside click
function onDocClick() { menuOpen.value = false }

onMounted(() => document.addEventListener('click', onDocClick))
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeUp)
})
</script>

<template>
  <NodeViewWrapper
    as="div"
    class="editor-column"
    data-type="column"
    :style="widthStyle"
  >
    <!-- Actions bar (non-editable) -->
    <div
      v-if="editor.isEditable"
      class="editor-column-actions"
      contenteditable="false"
    >
      <button
        type="button"
        class="editor-column-menu-btn"
        @mousedown.prevent
        @click.stop="menuOpen = !menuOpen"
      >
        <UIcon name="i-lucide-more-horizontal" class="size-3" />
      </button>

      <div
        v-if="menuOpen"
        class="editor-column-menu"
        @click.stop
        @mousedown.stop
      >
        <button type="button" @click="addColumn('left')">
          <UIcon name="i-lucide-panel-left-open" class="size-3.5 shrink-0" />
          Coluna à esquerda
        </button>
        <button type="button" @click="addColumn('right')">
          <UIcon name="i-lucide-panel-right-open" class="size-3.5 shrink-0" />
          Coluna à direita
        </button>
        <div class="editor-column-menu-sep" />
        <button type="button" class="danger" @click="deleteColumn">
          <UIcon name="i-lucide-trash-2" class="size-3.5 shrink-0" />
          Excluir coluna
        </button>
      </div>
    </div>

    <!-- Editable content -->
    <NodeViewContent as="div" class="editor-column-content" />

    <!-- Empty placeholder -->
    <div
      v-if="isEmpty && editor.isEditable"
      class="editor-column-placeholder"
      contenteditable="false"
    >
      Pressione "/" para adicionar conteúdo
    </div>

    <!-- Resize handle (between columns) -->
    <div
      v-if="!isLastCol && editor.isEditable"
      class="editor-column-resizer"
      contenteditable="false"
      @mousedown="onResizeDown"
    />
  </NodeViewWrapper>
</template>
