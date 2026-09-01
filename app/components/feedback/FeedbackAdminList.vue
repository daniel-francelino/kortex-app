<script setup lang="ts">
import type { Feedback } from '~/types/feedback'
import {
  FeedbackStatus,
  FeedbackPriority,
  feedbackTypeLabels,
  feedbackTypeIcons,
  feedbackTypeColors,
  feedbackStatusLabels,
  feedbackPriorityLabels
} from '~/types/feedback'
import { formatDisplay } from '#shared/utils/dateTime'

defineProps<{
  feedbacks: Feedback[]
  loading: boolean
  total: number
  page: number
  pageSize: number
}>()

const emit = defineEmits<{
  'select': [feedback: Feedback]
  'updateStatus': [id: string, status: FeedbackStatus]
  'updatePriority': [id: string, priority: FeedbackPriority]
  'update:page': [page: number]
}>()

const statusOptions = Object.values(FeedbackStatus).map(s => ({
  label: feedbackStatusLabels[s],
  value: s
}))

const priorityOptions = Object.values(FeedbackPriority).map(p => ({
  label: feedbackPriorityLabels[p],
  value: p
}))

function formatDate(iso: string) {
  return formatDisplay(iso, "dd 'de' MMM'.' 'de' yyyy")
}
</script>

<template>
  <div class="space-y-3">
    <template v-if="loading">
      <div v-for="i in 5" :key="i" class="flex flex-col gap-2 p-4 rounded-lg border border-default">
        <USkeleton class="h-5 w-2/3" />
        <USkeleton class="h-4 w-1/3" />
        <USkeleton class="h-4 w-full" />
      </div>
    </template>

    <template v-else-if="feedbacks.length === 0">
      <div class="text-center py-12 text-dimmed">
        <UIcon name="i-lucide-inbox" class="text-4xl mb-2" />
        <p>Nenhum feedback recebido.</p>
      </div>
    </template>

    <template v-else>
      <div
        v-for="fb in feedbacks"
        :key="fb.id"
        class="flex flex-col gap-3 p-4 rounded-lg border border-default hover:bg-elevated/50 transition-colors"
      >
        <div class="flex items-center gap-2 cursor-pointer" @click="emit('select', fb)">
          <UIcon :name="feedbackTypeIcons[fb.type]" :class="`text-${feedbackTypeColors[fb.type]}`" />
          <span class="font-medium text-sm flex-1 truncate">{{ fb.title }}</span>
          <span class="text-xs text-dimmed">{{ formatDate(fb.createdAt) }}</span>
        </div>

        <p class="text-xs text-dimmed line-clamp-2">
          {{ fb.description }}
        </p>

        <div class="flex items-center gap-3 flex-wrap">
          <UBadge
            :label="feedbackTypeLabels[fb.type]"
            :color="feedbackTypeColors[fb.type]"
            variant="subtle"
            size="xs"
          />

          <USelect
            :model-value="fb.status"
            :items="statusOptions"
            value-key="value"
            size="xs"
            class="w-32"
            @update:model-value="emit('updateStatus', fb.id, $event as FeedbackStatus)"
          />

          <USelect
            :model-value="fb.priority"
            :items="priorityOptions"
            value-key="value"
            size="xs"
            class="w-28"
            @update:model-value="emit('updatePriority', fb.id, $event as FeedbackPriority)"
          />
        </div>
      </div>

      <div v-if="total > pageSize" class="flex justify-center pt-4">
        <UPagination
          :page="page"
          :total="total"
          :items-per-page="pageSize"
          @update:page="emit('update:page', $event)"
        />
      </div>
    </template>
  </div>
</template>
