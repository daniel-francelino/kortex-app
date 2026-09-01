<script setup lang="ts">
import type { Idea } from '~/types/ideas'
import { IDEA_STATUS_META, IdeaStatus } from '~/types/ideas'
import { formatDisplay } from '#shared/utils/dateTime'

defineProps<{
  ideas: Idea[]
  total: number
  page: number
  loading: boolean
}>()

const emit = defineEmits<{
  'select': [idea: Idea]
  'update:page': [page: number]
  'update-status': [id: string, status: IdeaStatus]
  'create': []
}>()

const { deleteIdea, getStatusMeta, getPriorityMeta } = useIdeas()

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  return formatDisplay(dateStr, "dd 'de' MMM'.'")
}

function isOverdue(dueDate: string | null, status: string): boolean {
  if (!dueDate || status === 'done' || status === 'archived') return false
  return new Date(dueDate) < new Date()
}

async function onDelete(e: Event, id: string): Promise<void> {
  e.stopPropagation()
  await deleteIdea(id)
}
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- Loading -->
    <div v-if="loading" class="p-4 space-y-2">
      <USkeleton v-for="i in 8" :key="i" class="h-12 w-full" />
    </div>

    <!-- Empty -->
    <div v-else-if="ideas.length === 0" class="flex flex-col items-center justify-center flex-1 gap-4 py-20">
      <UIcon name="i-lucide-lightbulb" class="size-16 text-dimmed" />
      <div class="text-center">
        <p class="font-medium text-highlighted">
          Nenhuma ideia encontrada
        </p>
        <p class="text-sm text-muted mt-1">
          Crie sua primeira ideia para organizar seus pensamentos
        </p>
      </div>
      <UButton icon="i-lucide-plus" label="Nova ideia" @click="emit('create')" />
    </div>

    <!-- Table -->
    <div v-else class="flex-1 overflow-auto">
      <table class="w-full text-sm">
        <thead class="sticky top-0 z-10">
          <tr class="border-b border-default bg-elevated/80 backdrop-blur-sm text-xs text-muted uppercase tracking-wide">
            <th class="text-left py-2 px-3 font-medium w-8">
              Status
            </th>
            <th class="text-left py-2 px-3 font-medium">
              Título
            </th>
            <th class="text-left py-2 px-3 font-medium w-24">
              Prioridade
            </th>
            <th class="text-left py-2 px-3 font-medium w-28">
              Lista
            </th>
            <th class="text-left py-2 px-3 font-medium w-24">
              Data
            </th>
            <th class="text-left py-2 px-3 font-medium w-20">
              Subtarefas
            </th>
            <th class="text-left py-2 px-3 font-medium w-16" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="idea in ideas"
            :key="idea.id"
            class="border-b border-default hover:bg-elevated/50 cursor-pointer transition-colors group"
            :class="idea.status === 'done' ? 'opacity-60' : ''"
            @click="emit('select', idea)"
          >
            <!-- Status -->
            <td class="py-2 px-3">
              <UDropdownMenu
                :items="[
                  Object.values(IdeaStatus).map(s => ({
                    label: IDEA_STATUS_META[s].label,
                    icon: IDEA_STATUS_META[s].icon,
                    onSelect: () => emit('update-status', idea.id, s)
                  }))
                ]"
              >
                <button
                  class="flex items-center"
                  @click.stop
                >
                  <UIcon
                    :name="getStatusMeta(idea.status).icon"
                    :class="`text-${getStatusMeta(idea.status).color}-500`"
                    class="size-4"
                  />
                </button>
              </UDropdownMenu>
            </td>

            <!-- Title + Tags -->
            <td class="py-2 px-3">
              <div class="flex items-center gap-2">
                <span :class="idea.status === 'done' ? 'line-through text-muted' : 'text-highlighted'" class="font-medium truncate max-w-md">
                  {{ idea.title }}
                </span>
                <UBadge
                  v-for="tag in (idea.tags ?? []).slice(0, 2)"
                  :key="tag.id"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                >
                  #{{ tag.name }}
                </UBadge>
                <UBadge
                  v-if="(idea.tags ?? []).length > 2"
                  size="xs"
                  color="neutral"
                  variant="subtle"
                >
                  +{{ (idea.tags ?? []).length - 2 }}
                </UBadge>
              </div>
            </td>

            <!-- Priority -->
            <td class="py-2 px-3">
              <UBadge
                v-if="getPriorityMeta(idea.priority)"
                size="xs"
                :color="getPriorityMeta(idea.priority)!.color"
                variant="subtle"
              >
                <UIcon :name="getPriorityMeta(idea.priority)!.icon" class="size-3 mr-0.5" />
                {{ getPriorityMeta(idea.priority)!.label }}
              </UBadge>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- List -->
            <td class="py-2 px-3">
              <span v-if="idea.list" class="text-xs text-default truncate">
                {{ idea.list.name }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- Due Date -->
            <td class="py-2 px-3">
              <span
                v-if="idea.dueDate"
                class="text-xs"
                :class="isOverdue(idea.dueDate, idea.status) ? 'text-error font-medium' : 'text-muted'"
              >
                {{ formatDate(idea.dueDate) }}
              </span>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- Subtasks progress -->
            <td class="py-2 px-3">
              <div v-if="(idea.subtaskCount ?? 0) > 0" class="flex items-center gap-1.5">
                <div class="w-12 h-1.5 rounded-full bg-default overflow-hidden">
                  <div
                    class="h-full rounded-full bg-primary transition-all"
                    :style="{ width: `${((idea.subtaskDoneCount ?? 0) / (idea.subtaskCount ?? 1)) * 100}%` }"
                  />
                </div>
                <span class="text-xs text-muted">
                  {{ idea.subtaskDoneCount }}/{{ idea.subtaskCount }}
                </span>
              </div>
              <span v-else class="text-muted">—</span>
            </td>

            <!-- Actions -->
            <td class="py-2 px-3">
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                color="error"
                variant="ghost"
                class="opacity-100 transition-opacity lg:opacity-0 lg:group-hover:opacity-100"
                @click="(e: MouseEvent) => onDelete(e, idea.id)"
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Pagination -->
    <div v-if="total > 30" class="flex justify-center py-3 border-t border-default">
      <UPagination
        :model-value="page"
        :page-count="30"
        :total="total"
        @update:model-value="emit('update:page', $event)"
      />
    </div>
  </div>
</template>
