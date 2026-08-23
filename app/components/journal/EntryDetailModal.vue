<script setup lang="ts">
import { AnimatePresence, motion } from 'motion-v'
import type { JournalEntry } from '~/types/journal'
import { getMoodOption } from '~/types/journal'
import { isEditorContentEmpty } from '~/utils/editor/content'
import { tiptapJsonToMarkdown } from '~/utils/tiptap-markdown'
import { downloadTextFile, printHtmlAsPdf } from '~/utils/export-download'
import { getWeatherInfo } from '~/utils/weather-codes'
import type { EntityLink } from '~/types/life-os'
import { EntityType } from '~/types/life-os'

const props = defineProps<{
  open: boolean
  date: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updated': []
}>()

const { fetchEntryByDate, upsertEntry, deleteEntry } = useJournal()
const { createLink, deleteLink } = useLifeOS()
const { mode: pinMode, isEntryLocked, toggleEntryLock } = useJournalLock()
const {
  enabled: encryptionEnabled,
  isUnlocked: encryptionUnlocked,
  encryptEntryFields,
  decryptEntryFields
} = useJournalEncryption()

// Prioridade sobre o cadeado do PIN — sem a Data Key não dá nem pra saber
// se essa data já tem entrada em texto legível (mesma razão do TodayEditor).
const needsEncryptionUnlock = computed(() => encryptionEnabled.value && !encryptionUnlocked.value)

const isMobile = useIsMobile()

const loading = ref(false)
const entry = ref<JournalEntry | null>(null)

const content = ref('')
// Snapshot do texto claro já decifrado — usado por `cancelEditing()` em vez
// de reler `entry.value.content` (que é ciphertext quando a entrada está
// cifrada; ler direto de lá quebraria o cancelar).
const savedContent = ref('')
const mood = ref<string | null>(null)
const editing = ref(false)
const saving = ref(false)
const deleting = ref(false)
const confirmDeleteOpen = ref(false)
const togglingLock = ref(false)
const goalLinks = ref<EntityLink[]>([])
const goalLinksLoading = ref(false)
const showGoalLinker = ref(false)

const isLockedForViewing = computed(() => isEntryLocked(entry.value))

async function loadGoalLinks() {
  if (!entry.value) {
    goalLinks.value = []
    return
  }
  goalLinksLoading.value = true
  try {
    const response = await $fetch<{ data: EntityLink[] }>('/api/life/links', {
      query: { targetType: EntityType.JournalEntry, targetId: entry.value.id, sourceType: EntityType.Goal, pageSize: 50 }
    })
    goalLinks.value = response.data ?? []
  } catch {
    goalLinks.value = []
  } finally {
    goalLinksLoading.value = false
  }
}

async function onLinkGoal(goalId: string) {
  if (!entry.value) return
  const result = await createLink({
    sourceType: EntityType.Goal,
    sourceId: goalId,
    targetType: EntityType.JournalEntry,
    targetId: entry.value.id
  })
  if (result) {
    showGoalLinker.value = false
    await loadGoalLinks()
  }
}

async function onUnlinkGoal(linkId: string) {
  await deleteLink(linkId)
  await loadGoalLinks()
}

async function onToggleLock() {
  if (!entry.value || togglingLock.value) return
  togglingLock.value = true
  try {
    const updated = await toggleEntryLock(props.date, !entry.value.locked)
    if (updated) entry.value = updated
  } finally {
    togglingLock.value = false
  }
}

watch(() => props.open, async (isOpen) => {
  if (isOpen && props.date) await loadEntry()
}, { immediate: true })

watch(() => props.date, async () => {
  if (props.open && props.date) {
    editing.value = false
    await loadEntry()
  }
})

// Reabre a busca assim que a Data Key entra em memória (evento de desbloqueio
// da tela de criptografia) — sem isso, quem desbloqueia dentro do modal
// ficaria preso vendo o gate mesmo depois de já ter provado a frase.
watch(encryptionUnlocked, async (isUnlocked) => {
  if (isUnlocked && props.open && props.date) await loadEntry()
})

async function loadEntry() {
  if (needsEncryptionUnlock.value) return
  loading.value = true
  try {
    const data = await fetchEntryByDate(props.date)
    entry.value = data?.entry ?? null
    if (data?.entry?.isEncrypted) {
      try {
        content.value = (await decryptEntryFields(data.entry)).content
      } catch {
        content.value = ''
      }
    } else {
      content.value = data?.entry?.content ?? ''
    }
    savedContent.value = content.value
    mood.value = data?.entry?.mood ?? null
    await loadGoalLinks()
  } finally {
    loading.value = false
  }
}

async function onDeleteEntry() {
  if (deleting.value) return
  deleting.value = true
  try {
    const ok = await deleteEntry(props.date)
    if (ok) {
      confirmDeleteOpen.value = false
      emit('updated')
      onOpenChange(false)
    }
  } finally {
    deleting.value = false
  }
}

function isContentEmpty(val: string): boolean {
  return isEditorContentEmpty(val)
}

function cancelEditing() {
  editing.value = false
  content.value = savedContent.value
  mood.value = entry.value?.mood ?? null
}

async function onSave() {
  if (isContentEmpty(content.value) || saving.value) return
  saving.value = true
  try {
    const payload = encryptionEnabled.value
      ? { entryDate: props.date, mood: mood.value, ...(await encryptEntryFields(null, content.value)) }
      : { entryDate: props.date, title: null, content: content.value, mood: mood.value }
    const result = await upsertEntry(payload)
    if (result) {
      editing.value = false
      await loadEntry()
      emit('updated')
    }
  } finally {
    saving.value = false
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  })
}

function onOpenChange(value: boolean) {
  emit('update:open', value)
}

// ─── Exportar ────────────────────────────────────────────────────────────────
const viewContentRef = ref<{ $el: HTMLElement } | null>(null)

function exportMarkdown() {
  const md = tiptapJsonToMarkdown(content.value)
  downloadTextFile(`diario-${props.date}.md`, `# ${formatDate(props.date)}\n\n${md}\n`)
}

function exportPdf() {
  const html = viewContentRef.value?.$el?.querySelector('.ProseMirror')?.innerHTML ?? ''
  printHtmlAsPdf(formatDate(props.date), html)
}

const exportMenuItems = computed(() => [
  { label: 'Markdown (.md)', icon: 'i-lucide-file-text', onSelect: exportMarkdown },
  { label: 'PDF (imprimir)', icon: 'i-lucide-printer', onSelect: exportPdf }
])
</script>

<template>
  <UModal
    :open="props.open"
    fullscreen
    :title="formatDate(props.date)"
    :description="editing ? 'Editando entrada do diario.' : 'Entrada do diario.'"
    :ui="{
      overlay: 'z-[220] bg-elevated/80',
      content: 'z-[230] flex h-dvh max-h-dvh flex-col',
      header: 'shrink-0 px-4 pb-3 pt-[max(0.75rem,var(--safe-area-top))] sm:px-8',
      body: 'min-h-0 flex-1 overflow-y-auto p-0',
      footer: 'shrink-0 px-4 pb-[max(0.75rem,var(--safe-area-bottom))] pt-3 sm:px-8'
    }"
    @update:open="onOpenChange"
  >
    <template #body>
      <AnimatePresence mode="wait">
        <!-- Loading -->
        <motion.div
          v-if="loading"
          class="mx-auto w-full max-w-4xl space-y-4 px-4 py-8 sm:px-8"
          :initial="{ opacity: 0 }"
          :animate="{ opacity: 1 }"
          :exit="{ opacity: 0 }"
          :transition="{ duration: 0.16 }"
        >
          <USkeleton class="h-4 w-full" />
          <USkeleton class="h-4 w-5/6" />
          <USkeleton class="h-4 w-4/5" />
          <USkeleton class="h-40 w-full" />
        </motion.div>

        <motion.div
          v-else
          class="mx-auto flex min-h-full w-full max-w-4xl flex-col gap-6 px-4 py-8 sm:px-8"
          :initial="{ opacity: 0, y: 10 }"
          :animate="{ opacity: 1, y: 0 }"
          :transition="{ duration: 0.18 }"
        >
          <!-- Criptografia ligada e ainda não desbloqueada nesta sessão —
             prioridade sobre tudo, inclusive "nenhuma entrada ainda", já
             que criar uma entrada nova também exige a Data Key. -->
          <motion.div
            v-if="needsEncryptionUnlock"
            :initial="{ opacity: 0, y: 8, scale: 0.99 }"
            :animate="{ opacity: 1, y: 0, scale: 1 }"
            :transition="{ duration: 0.18 }"
          >
            <JournalEncryptionUnlockScreen compact />
          </motion.div>

          <!-- No entry yet -->
          <motion.div
            v-else-if="!entry && !editing"
            class="flex flex-1 flex-col items-center justify-center gap-3 py-16"
            :initial="{ opacity: 0, y: 10, scale: 0.98 }"
            :animate="{ opacity: 1, y: 0, scale: 1 }"
            :exit="{ opacity: 0, y: -6, scale: 0.98 }"
            :transition="{ duration: 0.18 }"
          >
            <UIcon
              name="i-lucide-book-open"
              class="size-12 text-dimmed"
            />
            <p class="text-sm text-muted">
              Nenhuma entrada para este dia.
            </p>
            <UButton
              label="Criar entrada"
              icon="i-lucide-plus"
              @click="editing = true"
            />
          </motion.div>

          <!-- View mode -->
          <template v-else-if="entry && !editing">
            <!-- Mood display + actions -->
            <motion.div
              class="flex items-center justify-between gap-3 border-b border-default pb-4"
              :initial="{ opacity: 0, y: 8 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.18 }"
            >
              <div
                v-if="!isLockedForViewing && getMoodOption(entry.mood)"
                class="flex items-center gap-2"
              >
                <span class="text-2xl leading-none">{{ getMoodOption(entry.mood)?.emoji }}</span>
                <span
                  class="text-sm font-medium"
                  :style="{ color: getMoodOption(entry.mood)?.color }"
                >{{ getMoodOption(entry.mood)?.label }}</span>
                <UBadge
                  v-if="entry.weatherCode !== null"
                  color="neutral"
                  variant="subtle"
                  size="sm"
                  class="gap-1"
                >
                  <UIcon :name="getWeatherInfo(entry.weatherCode).icon" class="size-3.5" />
                  {{ entry.weatherTempC !== null ? `${Math.round(entry.weatherTempC)}°C` : getWeatherInfo(entry.weatherCode).label }}
                </UBadge>
              </div>
              <div v-else />
              <div class="flex items-center gap-2">
                <UDropdownMenu
                  v-if="!isLockedForViewing"
                  :items="exportMenuItems"
                  :content="{ align: 'end' }"
                >
                  <UButton
                    icon="i-lucide-download"
                    label="Exportar"
                    color="neutral"
                    variant="ghost"
                    :size="isMobile ? 'md' : 'sm'"
                  />
                </UDropdownMenu>
                <!-- Per-entry lock toggle — "entradas específicas" mode only,
                   and only once already unlocked (otherwise this would let
                   anyone turn the lock off without ever entering the PIN). -->
                <UButton
                  v-if="pinMode === 'entries' && !isLockedForViewing"
                  :icon="entry.locked ? 'i-lucide-lock' : 'i-lucide-lock-open'"
                  :color="entry.locked ? 'warning' : 'neutral'"
                  variant="ghost"
                  :size="isMobile ? 'md' : 'sm'"
                  :loading="togglingLock"
                  :title="entry.locked ? 'Remover proteção desta entrada' : 'Proteger esta entrada com PIN'"
                  @click="onToggleLock"
                />
                <UButton
                  icon="i-lucide-trash-2"
                  label="Excluir"
                  color="error"
                  variant="ghost"
                  :size="isMobile ? 'md' : 'sm'"
                  @click="confirmDeleteOpen = true"
                />
                <UButton
                  v-if="!isLockedForViewing"
                  icon="i-lucide-pencil"
                  label="Editar"
                  color="neutral"
                  variant="ghost"
                  :size="isMobile ? 'md' : 'sm'"
                  @click="editing = true"
                />
              </div>
            </motion.div>

            <!-- Locked entry — hides mood/content until the PIN is entered -->
            <motion.div
              v-if="isLockedForViewing"
              :initial="{ opacity: 0, y: 8, scale: 0.99 }"
              :animate="{ opacity: 1, y: 0, scale: 1 }"
              :transition="{ duration: 0.18 }"
            >
              <JournalLockScreen
                compact
                :entry-date="props.date"
              />
            </motion.div>

            <!-- Rich content (read-only) -->
            <motion.div
              v-else
              :initial="{ opacity: 0, y: 10 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.2, delay: 0.04 }"
            >
              <ClientOnly>
                <NotionEditor
                  ref="viewContentRef"
                  :key="props.date + '-view'"
                  :model-value="content"
                  :editable="false"
                  min-height="60vh"
                />
                <template #fallback>
                  <USkeleton class="h-32 w-full" />
                </template>
              </ClientOnly>
            </motion.div>

            <!-- Linked goals -->
            <motion.div
              v-if="!isLockedForViewing"
              class="space-y-3 border-t border-default pt-4"
              :initial="{ opacity: 0, y: 10 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.2, delay: 0.06 }"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-target" class="size-4 text-primary" />
                  <h4 class="text-sm font-semibold text-highlighted">
                    Metas vinculadas
                  </h4>
                  <span class="text-xs text-muted">{{ goalLinks.length }}</span>
                </div>
                <UButton
                  v-if="!showGoalLinker"
                  icon="i-lucide-link"
                  label="Vincular"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                  @click="showGoalLinker = true"
                />
              </div>

              <div v-if="goalLinksLoading" class="space-y-2">
                <USkeleton class="h-10 w-full" />
              </div>

              <div v-else-if="goalLinks.length > 0" class="space-y-2">
                <div
                  v-for="link in goalLinks"
                  :key="link.id"
                  class="flex items-center justify-between gap-3 rounded-xl border border-default/60 bg-default/30 p-3"
                >
                  <div class="flex min-w-0 items-center gap-3">
                    <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <UIcon name="i-lucide-target" class="size-4" />
                    </div>
                    <p class="truncate text-sm font-medium text-highlighted">
                      {{ link.sourceLabel ?? 'Meta' }}
                    </p>
                  </div>
                  <UButton
                    icon="i-lucide-unlink"
                    color="neutral"
                    variant="ghost"
                    size="xs"
                    aria-label="Desvincular meta"
                    @click="onUnlinkGoal(link.id)"
                  />
                </div>
              </div>

              <p v-else-if="!showGoalLinker" class="text-xs text-muted">
                Nenhuma meta vinculada a esta entrada.
              </p>

              <JournalGoalLinker
                v-if="showGoalLinker"
                :existing-goal-ids="goalLinks.map(l => l.sourceId)"
                @link="onLinkGoal"
                @cancel="showGoalLinker = false"
              />
            </motion.div>
          </template>

          <!-- Edit mode -->
          <template v-else-if="editing">
            <motion.div
              :initial="{ opacity: 0, y: 8 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.18 }"
            >
              <JournalMoodSelector v-model="mood" />
            </motion.div>

            <motion.div
              :initial="{ opacity: 0, y: 10 }"
              :animate="{ opacity: 1, y: 0 }"
              :transition="{ duration: 0.2, delay: 0.04 }"
            >
              <ClientOnly>
                <NotionEditor
                  :key="props.date + '-edit'"
                  v-model="content"
                  placeholder="Escreva sua entrada... use '/' para inserir blocos."
                  min-height="60vh"
                />
                <template #fallback>
                  <USkeleton class="h-40 w-full" />
                </template>
              </ClientOnly>
            </motion.div>
          </template>
        </motion.div>
      </AnimatePresence>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <template v-if="editing">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="outline"
            @click="cancelEditing"
          />
          <UButton
            label="Salvar"
            icon="i-lucide-check"
            :loading="saving"
            :disabled="saving || isContentEmpty(content)"
            @click="onSave"
          />
        </template>

        <UButton
          v-else
          label="Fechar"
          icon="i-lucide-x"
          color="neutral"
          variant="subtle"
          @click="onOpenChange(false)"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation -->
  <UModal
    :open="confirmDeleteOpen"
    :ui="{ overlay: 'z-[240]', content: 'z-[250]' }"
    @update:open="confirmDeleteOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-trash-2" class="size-4 text-error" />
        <span class="text-sm font-semibold text-highlighted">Excluir entrada</span>
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Tem certeza que deseja excluir a entrada de {{ formatDate(props.date) }}? Essa ação não pode ser desfeita pela interface.
      </p>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          :size="isMobile ? 'md' : 'sm'"
          @click="confirmDeleteOpen = false"
        />
        <UButton
          label="Excluir"
          color="error"
          icon="i-lucide-trash-2"
          :size="isMobile ? 'md' : 'sm'"
          :loading="deleting"
          @click="onDeleteEntry"
        />
      </div>
    </template>
  </UModal>
</template>
