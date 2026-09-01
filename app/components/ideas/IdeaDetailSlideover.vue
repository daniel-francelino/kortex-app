<script setup lang="ts">
import type { IdeaDetail, IdeaList, IdeaTag, IdeaPriority } from '~/types/ideas'
import { IDEA_STATUS_META, IdeaStatus } from '~/types/ideas'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  ideaId: string | null
  open: boolean
  lists: IdeaList[]
  tags: IdeaTag[]
}>()

const emit = defineEmits<{
  'update:open': [val: boolean]
  'updated': []
  'deleted': []
}>()

const {
  fetchIdeaDetail,
  updateIdea,
  deleteIdea,
  createSubtask,
  updateSubtask,
  deleteSubtask,
  statusOptions,
  priorityOptions
} = useIdeas()

const detail = ref<IdeaDetail | null>(null)
const loading = ref(false)
const saving = ref(false)

// ─── Editable state ──────────────────────────────────────────────────────────

const editTitle = ref('')
const editDescription = ref('')
const editStatus = ref<IdeaStatus>(IdeaStatus.Backlog)
const editPriority = ref<string>('')
const editListId = ref<string>('')
const editDueDate = ref<string>('')
const editTagIds = ref<string[]>([])

// Subtask form
const newSubtaskTitle = ref('')
const addingSubtask = ref(false)

const listOptions = computed(() => [
  { label: 'Sem lista', value: '' },
  ...props.lists.map(l => ({ label: l.name, value: l.id }))
])

const tagSelectOptions = computed(() =>
  props.tags.map(t => ({ label: `#${t.name}`, value: t.id }))
)

const prioritySelectOptions = computed(() => [
  { label: 'Sem prioridade', value: '' },
  ...priorityOptions
])

// ─── Load detail ──────────────────────────────────────────────────────────────

watch(() => props.ideaId, async (id) => {
  if (!id) {
    detail.value = null
    return
  }
  loading.value = true
  try {
    const d = await fetchIdeaDetail(id)
    detail.value = d
    if (d) {
      editTitle.value = d.title
      editDescription.value = d.description ?? ''
      editStatus.value = d.status as IdeaStatus
      editPriority.value = d.priority ?? ''
      editListId.value = d.listId ?? ''
      editDueDate.value = d.dueDate ?? ''
      editTagIds.value = (d.tags ?? []).map((t: IdeaTag) => t.id)
    }
  } finally {
    loading.value = false
  }
}, { immediate: true })

// ─── Save ─────────────────────────────────────────────────────────────────────

async function save(): Promise<void> {
  if (!detail.value) return
  saving.value = true
  try {
    await updateIdea(detail.value.id, {
      title: editTitle.value,
      description: editDescription.value || undefined,
      status: editStatus.value,
      priority: editPriority.value ? editPriority.value as IdeaPriority : null,
      listId: editListId.value || null,
      dueDate: editDueDate.value || null,
      tagIds: editTagIds.value
    })
    // Reload
    const d = await fetchIdeaDetail(detail.value.id)
    detail.value = d
    emit('updated')
  } finally {
    saving.value = false
  }
}

async function onDelete(): Promise<void> {
  if (!detail.value) return
  const success = await deleteIdea(detail.value.id)
  if (success) {
    emit('update:open', false)
    emit('deleted')
  }
}

// ─── Subtasks ─────────────────────────────────────────────────────────────────

async function addSubtask(): Promise<void> {
  if (!detail.value || !newSubtaskTitle.value.trim()) return
  addingSubtask.value = true
  const success = await createSubtask(detail.value.id, { title: newSubtaskTitle.value.trim() })
  if (success) {
    newSubtaskTitle.value = ''
    const d = await fetchIdeaDetail(detail.value.id)
    detail.value = d
  }
  addingSubtask.value = false
}

async function toggleSubtask(subtaskId: string, completed: boolean): Promise<void> {
  if (!detail.value) return
  await updateSubtask(subtaskId, { completed })
  const d = await fetchIdeaDetail(detail.value.id)
  detail.value = d
  emit('updated')
}

async function removeSubtask(subtaskId: string): Promise<void> {
  if (!detail.value) return
  await deleteSubtask(subtaskId)
  const d = await fetchIdeaDetail(detail.value.id)
  detail.value = d
}

function formatDate(dateStr: string): string {
  return formatDisplay(dateStr, "dd 'de' MMM'.' 'de' yyyy, HH:mm")
}

const subtaskProgress = computed(() => {
  if (!detail.value?.subtasks?.length) return 0
  const done = detail.value.subtasks.filter(s => s.completed).length
  return Math.round((done / detail.value.subtasks.length) * 100)
})

// Auto-save debounce
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    save()
  }, 1500)
}

watch([editTitle, editDescription, editStatus, editPriority, editListId, editDueDate, editTagIds], () => {
  if (detail.value) scheduleSave()
}, { deep: true })

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
})
</script>

<template>
  <USlideover
    :open="open"
    side="right"
    @update:open="emit('update:open', $event)"
  >
    <template #content>
      <div class="flex flex-col h-full">
        <!-- Loading -->
        <div v-if="loading" class="p-6 space-y-4">
          <USkeleton class="h-8 w-3/4" />
          <USkeleton class="h-4 w-1/2" />
          <USkeleton class="h-32 w-full" />
          <USkeleton class="h-20 w-full" />
        </div>

        <template v-else-if="detail">
          <!-- Header -->
          <div class="flex items-center justify-between px-5 py-3 border-b border-default">
            <div class="flex items-center gap-2">
              <UIcon
                :name="IDEA_STATUS_META[editStatus]?.icon ?? 'i-lucide-circle'"
                :class="`text-${IDEA_STATUS_META[editStatus]?.color ?? 'neutral'}-500`"
                class="size-5"
              />
              <span v-if="saving" class="text-xs text-muted">
                <UIcon name="i-lucide-loader-2" class="size-3 animate-spin inline mr-1" />
                Salvando...
              </span>
            </div>
            <div class="flex items-center gap-1">
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="error"
                variant="ghost"
                @click="onDelete"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                variant="ghost"
                @click="emit('update:open', false)"
              />
            </div>
          </div>

          <!-- Content -->
          <div class="flex-1 overflow-y-auto">
            <div class="px-5 py-4 space-y-5">
              <!-- Title -->
              <input
                v-model="editTitle"
                class="w-full text-xl font-bold bg-transparent border-none outline-none placeholder-muted text-highlighted"
                placeholder="Título da ideia..."
              >

              <!-- Properties grid (Notion-style) -->
              <div class="space-y-3">
                <!-- Status -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Status</span>
                  <USelect
                    v-model="editStatus"
                    :items="statusOptions"
                    value-key="value"
                    size="xs"
                    class="flex-1"
                  />
                </div>

                <!-- Priority -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Prioridade</span>
                  <USelect
                    v-model="editPriority"
                    :items="prioritySelectOptions"
                    value-key="value"
                    size="xs"
                    class="flex-1"
                  />
                </div>

                <!-- List -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Lista</span>
                  <USelect
                    v-model="editListId"
                    :items="listOptions"
                    value-key="value"
                    size="xs"
                    class="flex-1"
                  />
                </div>

                <!-- Due date -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Data</span>
                  <input
                    v-model="editDueDate"
                    type="date"
                    class="flex-1 text-sm bg-transparent border border-default rounded px-2 py-1 outline-none focus:ring-1 focus:ring-primary text-default"
                  >
                </div>

                <!-- Tags -->
                <div class="flex items-start gap-3">
                  <span class="text-xs text-muted w-20 shrink-0 pt-1">Tags</span>
                  <USelect
                    v-model="editTagIds"
                    :items="tagSelectOptions"
                    value-key="value"
                    multiple
                    size="xs"
                    placeholder="Selecionar tags..."
                    class="flex-1"
                  />
                </div>

                <!-- Dates info -->
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Criado</span>
                  <span class="text-xs text-muted">{{ formatDate(detail.createdAt) }}</span>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-xs text-muted w-20 shrink-0">Atualizado</span>
                  <span class="text-xs text-muted">{{ formatDate(detail.updatedAt) }}</span>
                </div>
              </div>

              <!-- Divider -->
              <div class="border-t border-default" />

              <!-- Description -->
              <div>
                <h4 class="text-xs font-semibold text-muted uppercase tracking-wide mb-2">
                  Descrição
                </h4>
                <textarea
                  v-model="editDescription"
                  class="w-full min-h-[120px] bg-transparent border border-default rounded-md resize-none outline-none text-sm leading-relaxed p-3 placeholder-muted text-default focus:ring-1 focus:ring-primary"
                  placeholder="Adicione uma descrição detalhada..."
                />
              </div>

              <!-- Divider -->
              <div class="border-t border-default" />

              <!-- Subtasks -->
              <div>
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-xs font-semibold text-muted uppercase tracking-wide">
                    Subtarefas
                    <span v-if="detail.subtasks?.length" class="text-default ml-1">
                      ({{ detail.subtasks.filter(s => s.completed).length }}/{{ detail.subtasks.length }})
                    </span>
                  </h4>
                </div>

                <!-- Progress bar -->
                <div v-if="detail.subtasks && detail.subtasks.length > 0" class="mb-3">
                  <div class="w-full h-1.5 rounded-full bg-default overflow-hidden">
                    <div
                      class="h-full rounded-full transition-all"
                      :class="subtaskProgress === 100 ? 'bg-success' : 'bg-primary'"
                      :style="{ width: `${subtaskProgress}%` }"
                    />
                  </div>
                </div>

                <!-- Subtask items -->
                <div class="space-y-1">
                  <div
                    v-for="subtask in detail.subtasks"
                    :key="subtask.id"
                    class="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-elevated group"
                  >
                    <button
                      class="shrink-0"
                      @click="toggleSubtask(subtask.id, !subtask.completed)"
                    >
                      <UIcon
                        :name="subtask.completed ? 'i-lucide-check-square' : 'i-lucide-square'"
                        :class="subtask.completed ? 'text-success' : 'text-muted'"
                        class="size-4"
                      />
                    </button>
                    <span
                      class="flex-1 text-sm"
                      :class="subtask.completed ? 'line-through text-muted' : 'text-default'"
                    >
                      {{ subtask.title }}
                    </span>
                    <UButton
                      icon="i-lucide-x"
                      size="xs"
                      color="error"
                      variant="ghost"
                      class="opacity-100 lg:opacity-0 lg:group-hover:opacity-100"
                      @click="removeSubtask(subtask.id)"
                    />
                  </div>
                </div>

                <!-- Add subtask -->
                <div class="flex items-center gap-2 mt-2">
                  <UInput
                    v-model="newSubtaskTitle"
                    placeholder="Nova subtarefa..."
                    size="xs"
                    class="flex-1"
                    @keydown.enter="addSubtask"
                  />
                  <UButton
                    icon="i-lucide-plus"
                    size="xs"
                    :loading="addingSubtask"
                    :disabled="!newSubtaskTitle.trim()"
                    @click="addSubtask"
                  />
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </template>
  </USlideover>
</template>
