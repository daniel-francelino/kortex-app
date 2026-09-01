<script setup lang="ts">
import type { Feedback } from '~/types/feedback'
import {
  feedbackTypeLabels,
  feedbackTypeIcons,
  feedbackTypeColors,
  feedbackPriorityLabels,
  feedbackPriorityColors
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
  'delete': [id: string]
  'update:page': [page: number]
}>()

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
        <UIcon name="i-lucide-message-circle" class="text-4xl mb-2" />
        <p>Nenhum feedback encontrado.</p>
      </div>
    </template>

    <template v-else>
      <div
        v-for="fb in feedbacks"
        :key="fb.id"
        class="flex flex-col gap-2 p-4 rounded-lg border border-default hover:bg-elevated/50 cursor-pointer transition-colors"
        @click="emit('select', fb)"
      >
        <div class="flex items-center gap-2">
          <UIcon :name="feedbackTypeIcons[fb.type]" :class="`text-${feedbackTypeColors[fb.type]}`" />
          <span class="font-medium text-sm flex-1 truncate">{{ fb.title }}</span>
          <FeedbackStatusBadge :status="fb.status" />
        </div>
        <div class="flex items-center gap-3 text-xs text-dimmed">
          <UBadge
            :label="feedbackTypeLabels[fb.type]"
            :color="feedbackTypeColors[fb.type]"
            variant="subtle"
            size="xs"
          />
          <UBadge
            :label="feedbackPriorityLabels[fb.priority]"
            :color="feedbackPriorityColors[fb.priority]"
            variant="outline"
            size="xs"
          />
          <span>{{ formatDate(fb.createdAt) }}</span>
        </div>
        <p class="text-xs text-dimmed line-clamp-2">
          {{ fb.description }}
        </p>
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
