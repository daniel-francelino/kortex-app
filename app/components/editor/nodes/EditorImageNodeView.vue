<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper } from '@tiptap/vue-3'

interface EditorUploadResponse {
  bucket: string
  path: string
  url: string
  name: string
  size: number
  type: string
  kind: 'image' | 'file'
}

const props = defineProps<NodeViewProps>()

const fileInputRef = ref<HTMLInputElement | null>(null)
const replacing = ref(false)
const error = ref('')

const editable = computed(() => props.editor.isEditable)
const attrs = computed(() => props.node.attrs)
const width = computed(() => attrs.value.width || '100%')
const caption = computed({
  get: () => String(attrs.value.caption || attrs.value.name || ''),
  set: value => props.updateAttributes({ caption: value })
})

function setWidth(value: string) {
  props.updateAttributes({ width: value })
}

function openReplacePicker() {
  fileInputRef.value?.click()
}

async function onReplaceChange(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  replacing.value = true
  error.value = ''

  try {
    const uploaded = await uploadImage(file)
    const oldPath = typeof attrs.value.path === 'string' ? attrs.value.path : ''
    const oldBucket = typeof attrs.value.bucket === 'string' ? attrs.value.bucket : ''

    props.updateAttributes({
      src: uploaded.url,
      name: uploaded.name,
      alt: uploaded.name,
      title: uploaded.name,
      size: uploaded.size,
      mimeType: uploaded.type,
      path: uploaded.path,
      bucket: uploaded.bucket
    })

    if (oldPath && oldBucket) {
      void cleanupOldImage(oldBucket, oldPath)
    }
  } catch {
    error.value = 'Nao foi possivel substituir a imagem.'
  } finally {
    replacing.value = false
  }
}

async function uploadImage(file: File) {
  const form = new FormData()
  form.append('file', file)
  form.append('kind', 'image')

  return await $fetch<EditorUploadResponse>('/api/editor/uploads', {
    method: 'POST',
    body: form
  })
}

async function cleanupOldImage(bucket: string, path: string) {
  await $fetch('/api/editor/uploads/delete', {
    method: 'POST',
    body: {
      files: [{ bucket, path }]
    }
  })
}
</script>

<template>
  <NodeViewWrapper
    as="figure"
    class="editor-image-node"
    data-type="editor-image"
    :data-path="attrs.path"
    :data-bucket="attrs.bucket"
    :style="{ '--editor-image-width': width }"
  >
    <div class="editor-image-frame">
      <img
        :src="attrs.src"
        :alt="attrs.alt || attrs.name || ''"
        :title="attrs.title || attrs.name || ''"
        loading="lazy"
      >

      <div
        v-if="editable"
        class="editor-image-controls"
      >
        <button
          type="button"
          :class="{ active: width === '50%' }"
          title="Largura 50%"
          @click="setWidth('50%')"
        >
          50
        </button>
        <button
          type="button"
          :class="{ active: width === '75%' }"
          title="Largura 75%"
          @click="setWidth('75%')"
        >
          75
        </button>
        <button
          type="button"
          :class="{ active: width === '100%' }"
          title="Largura total"
          @click="setWidth('100%')"
        >
          100
        </button>
        <button
          type="button"
          title="Substituir imagem"
          :disabled="replacing"
          @click="openReplacePicker"
        >
          <UIcon
            :name="replacing ? 'i-lucide-loader-circle' : 'i-lucide-refresh-cw'"
            :class="['size-3.5', { 'animate-spin': replacing }]"
          />
        </button>
      </div>
    </div>

    <input
      ref="fileInputRef"
      class="sr-only"
      type="file"
      accept="image/*"
      @change="onReplaceChange"
    >

    <input
      v-if="editable"
      v-model="caption"
      class="editor-image-caption-input"
      placeholder="Adicionar legenda"
    >
    <figcaption v-else-if="caption">
      {{ caption }}
    </figcaption>

    <p
      v-if="error"
      class="editor-image-error"
    >
      {{ error }}
    </p>
  </NodeViewWrapper>
</template>
