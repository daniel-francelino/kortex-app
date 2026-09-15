<script setup lang="ts">
import { CSS_DEBUG_ENABLED, startCssDiagnostics } from '~/utils/css-diagnostics'

const enabled = useState('css-diagnostics-enabled', () => false)
const route = useRoute()
const expanded = ref(false)
const count = ref(0)
const status = ref('')
const fallbackText = ref('')
const manualCopy = ref<HTMLTextAreaElement | null>(null)
let recorder: ReturnType<typeof startCssDiagnostics> | undefined
let stopWatching: (() => void) | undefined

onMounted(() => {
  try {
    const query = new URLSearchParams(location.search).get('cssDebug')
    enabled.value = query === '1' || (query !== '0' && (enabled.value || localStorage.getItem(CSS_DEBUG_ENABLED) === '1'))
  } catch { /* Recording still works without local storage. */ }
  stopWatching = watch(enabled, (active) => {
    try { localStorage.setItem(CSS_DEBUG_ENABLED, active ? '1' : '0') } catch { /* Optional persistence. */ }
    if (active && !recorder) {
      recorder = startCssDiagnostics(value => { count.value = value })
      expanded.value = false
      status.value = 'Gravando medidas de layout.'
    } else if (!active) {
      recorder?.stop()
      recorder = undefined
      fallbackText.value = ''
    }
  }, { immediate: true })
})

watch(() => route.fullPath, () => recorder?.routeChanged())
onBeforeUnmount(() => {
  stopWatching?.()
  recorder?.stop()
})

function markGap() {
  recorder?.capture()
  status.value = 'Momento do espaço marcado no relatório.'
}

function reportFile() {
  const text = recorder?.export()
  if (!text) return null
  return new File([text], `kortex-css-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, { type: 'application/json' })
}

async function share() {
  const file = reportFile()
  if (!file) return
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'Diagnóstico CSS Kortex' })
      status.value = 'Relatório compartilhado.'
    } else {
      download(file)
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') return
    status.value = 'Não foi possível compartilhar. Use Baixar ou Copiar.'
  }
}

function download(file = reportFile()) {
  if (!file) return
  const url = URL.createObjectURL(file)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = file.name
  anchor.dataset.cssDebug = 'download'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  status.value = 'Download solicitado. No iPhone, Compartilhar permite salvar em Arquivos.'
}

async function copy() {
  const text = recorder?.export()
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    status.value = 'Relatório completo copiado.'
  } catch {
    fallbackText.value = text
    status.value = 'Selecione o texto abaixo e use Copiar.'
    await nextTick()
    manualCopy.value?.focus()
    manualCopy.value?.select()
  }
}
</script>

<template>
  <Teleport to="body">
    <aside v-if="enabled" data-css-debug="panel" class="css-diagnostics" aria-label="Diagnóstico CSS">
      <button type="button" :aria-expanded="expanded" @click="expanded = !expanded">
        CSS · {{ count }} capturas · {{ expanded ? 'Recolher' : 'Abrir' }}
      </button>
      <div v-if="expanded" class="css-diagnostics-body">
        <strong>Diagnóstico do espaço inferior</strong>
        <p>Recolha este painel e reproduza o problema. Depois marque o espaço e compartilhe o relatório.</p>
        <p>Continua gravando ao navegar e reabrir o app. Coleta medidas e CSS, sem textos ou valores dos campos.</p>
        <div class="css-diagnostics-actions">
          <button type="button" @click="markGap">Marcar espaço agora</button>
          <button type="button" @click="share">Compartilhar relatório</button>
          <button type="button" @click="download()">Baixar JSON</button>
          <button type="button" @click="copy">Copiar tudo</button>
          <button type="button" @click="enabled = false">Desativar diagnóstico</button>
        </div>
        <p role="status">{{ status }}</p>
        <textarea v-if="fallbackText" ref="manualCopy" :value="fallbackText" readonly aria-label="Relatório para copiar" />
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.css-diagnostics {
  position: fixed;
  top: max(env(safe-area-inset-top, 0px), 8px);
  right: max(env(safe-area-inset-right, 0px), 8px);
  z-index: 2147483647;
  width: max-content;
  max-width: calc(100vw - 16px);
  color: #fff;
  background: #162536;
  border: 1px solid #67e8f9;
  border-radius: 10px;
  font: 12px/1.5 system-ui, sans-serif;
  box-shadow: 0 2px 12px #0006;
}

.css-diagnostics button {
  min-height: 44px;
  padding: 8px 12px;
  cursor: pointer;
  color: inherit;
  font: inherit;
}

.css-diagnostics-body {
  width: 330px;
  max-width: calc(100vw - 18px);
  max-height: 65dvh;
  overflow-y: auto;
  padding: 12px;
  border-top: 1px solid #67e8f9;
}

.css-diagnostics-body p { margin: 8px 0; }
.css-diagnostics-actions { display: grid; gap: 6px; }
.css-diagnostics-actions button { background: #29445e; border-radius: 6px; text-align: left; }
.css-diagnostics textarea { width: 100%; height: 120px; font-size: 16px; }
</style>
