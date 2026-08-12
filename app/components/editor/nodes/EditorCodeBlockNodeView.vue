<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()

const editable = computed(() => props.editor.isEditable)

// Curated subset of the languages registered via lowlight's `common` grammar
// set (app/composables/useNotionEditor.ts) — the full set has ~35 entries,
// more than useful in a dropdown for the overwhelming majority of notes.
const LANGUAGES = [
  { value: '', label: 'Texto simples' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'bash', label: 'Bash' },
  { value: 'sql', label: 'SQL' },
  { value: 'xml', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'yaml', label: 'YAML' }
]

const language = computed<string>({
  get: () => String(props.node.attrs.language || ''),
  set: value => props.updateAttributes({ language: value || null })
})
</script>

<template>
  <NodeViewWrapper class="kortex-code-block" as="div">
    <div
      v-if="editable"
      class="kortex-code-block-lang"
      contenteditable="false"
    >
      <select
        v-model="language"
        class="kortex-code-block-lang-select"
      >
        <option
          v-for="lang in LANGUAGES"
          :key="lang.value"
          :value="lang.value"
        >
          {{ lang.label }}
        </option>
      </select>
    </div>
    <pre><NodeViewContent as="code" /></pre>
  </NodeViewWrapper>
</template>

<style scoped>
.kortex-code-block {
  position: relative;
}

.kortex-code-block-lang {
  position: absolute;
  top: 6px;
  right: 8px;
  z-index: 1;
  opacity: 0.6;
  transition: opacity 0.1s;
}

.kortex-code-block:hover .kortex-code-block-lang,
.kortex-code-block-lang:focus-within {
  opacity: 1;
}

.kortex-code-block-lang-select {
  font-size: 0.7rem;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--ui-border);
  background: var(--ui-bg-elevated);
  color: var(--ui-text-muted);
  cursor: pointer;
}

.kortex-code-block-lang-select:hover {
  color: var(--ui-text-highlighted);
}
</style>
