<script setup lang="ts">
import type { Feedback } from '~/types/feedback'
import {
  FeedbackStatus,
  FeedbackPriority,
  feedbackStatusLabels,
  feedbackPriorityLabels
} from '~/types/feedback'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  open: boolean
  feedback: Feedback | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'updateStatus': [id: string, status: FeedbackStatus]
  'updatePriority': [id: string, priority: FeedbackPriority]
  'respond': [feedbackId: string, content: string]
  'linkEntity': [feedbackId: string, entityType: string, entityId: string | undefined, externalUrl: string | undefined]
}>()

const detailData = ref<Feedback | null>(null)
const loadingDetail = ref(false)

watch(() => props.feedback, async (fb) => {
  if (fb) {
    loadingDetail.value = true
    try {
      detailData.value = await $fetch<Feedback>(`/api/feedback/${fb.id}`)
    } catch {
      detailData.value = fb
    } finally {
      loadingDetail.value = false
    }
  } else {
    detailData.value = null
  }
}, { immediate: true })

const statusOptions = Object.values(FeedbackStatus).map(s => ({
  label: feedbackStatusLabels[s],
  value: s
}))

const priorityOptions = Object.values(FeedbackPriority).map(p => ({
  label: feedbackPriorityLabels[p],
  value: p
}))

const responseText = ref('')
const sendingResponse = ref(false)

const linkEntityType = ref('')
const linkEntityId = ref('')
const linkExternalUrl = ref('')

const entityTypeOptions = [
  { label: 'Tarefa', value: 'task' },
  { label: 'Meta', value: 'goal' },
  { label: 'Hábito', value: 'habit' },
  { label: 'Evento', value: 'event' },
  { label: 'Externo', value: 'external' }
]

function formatDate(iso: string) {
  return formatDisplay(iso, "dd 'de' MMM'.' 'de' yyyy, HH:mm")
}

function onSendResponse() {
  if (!detailData.value || !responseText.value.trim()) return
  if (sendingResponse.value) return
  sendingResponse.value = true
  emit('respond', detailData.value.id, responseText.value.trim())
  responseText.value = ''
  sendingResponse.value = false
}

function onLinkEntity() {
  if (!detailData.value || !linkEntityType.value) return
  emit(
    'linkEntity',
    detailData.value.id,
    linkEntityType.value,
    linkEntityType.value !== 'external' ? linkEntityId.value || undefined : undefined,
    linkEntityType.value === 'external' ? linkExternalUrl.value || undefined : undefined
  )
  linkEntityType.value = ''
  linkEntityId.value = ''
  linkExternalUrl.value = ''
}

function onClose() {
  emit('update:open', false)
}
</script>

<template>
  <USlideover :open="props.open" title="Gerenciar feedback" @update:open="onClose">
    <template #body>
      <div v-if="loadingDetail" class="space-y-4 p-4">
        <USkeleton class="h-6 w-3/4" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-20 w-full" />
      </div>

      <div v-else-if="detailData" class="space-y-6 p-4">
        <!-- Info -->
        <div>
          <h3 class="text-lg font-semibold mb-1">
            {{ detailData.title }}
          </h3>
          <p class="text-sm text-dimmed whitespace-pre-wrap">
            {{ detailData.description }}
          </p>
          <p class="text-xs text-dimmed mt-2">
            Criado em {{ formatDate(detailData.createdAt) }}
          </p>
        </div>

        <!-- Tech Context -->
        <div v-if="detailData.techContext">
          <h4 class="text-sm font-medium mb-1">
            Contexto técnico
          </h4>
          <div class="bg-elevated rounded-lg p-3 text-xs space-y-1">
            <p><span class="font-medium">Rota:</span> {{ detailData.techContext.route }}</p>
            <p><span class="font-medium">Resolução:</span> {{ detailData.techContext.screenResolution }}</p>
            <p><span class="font-medium">User Agent:</span> {{ detailData.techContext.userAgent }}</p>
          </div>
        </div>

        <!-- Status / Priority controls -->
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium mb-1 block">Status</label>
            <USelect
              :model-value="detailData.status"
              :items="statusOptions"
              value-key="value"
              size="sm"
              class="w-full"
              @update:model-value="emit('updateStatus', detailData!.id, $event as FeedbackStatus)"
            />
          </div>
          <div>
            <label class="text-xs font-medium mb-1 block">Prioridade</label>
            <USelect
              :model-value="detailData.priority"
              :items="priorityOptions"
              value-key="value"
              size="sm"
              class="w-full"
              @update:model-value="emit('updatePriority', detailData!.id, $event as FeedbackPriority)"
            />
          </div>
        </div>

        <!-- Responses -->
        <div>
          <h4 class="text-sm font-medium mb-2">
            Respostas
          </h4>

          <div v-if="detailData.responses && detailData.responses.length > 0" class="space-y-2 mb-3">
            <div
              v-for="resp in detailData.responses"
              :key="resp.id"
              class="border border-default rounded-lg p-3"
              :class="resp.isAdmin ? 'bg-primary/5 border-primary/20' : 'bg-elevated'"
            >
              <div class="flex items-center gap-2 mb-1">
                <UBadge
                  v-if="resp.isAdmin"
                  label="Admin"
                  color="primary"
                  variant="subtle"
                  size="xs"
                />
                <UBadge
                  v-else
                  label="Usuário"
                  color="neutral"
                  variant="subtle"
                  size="xs"
                />
                <span class="text-xs text-dimmed">{{ formatDate(resp.createdAt) }}</span>
              </div>
              <p class="text-sm whitespace-pre-wrap">
                {{ resp.content }}
              </p>
            </div>
          </div>

          <div class="flex gap-2">
            <UTextarea
              v-model="responseText"
              placeholder="Responder ao feedback..."
              :rows="2"
              class="flex-1"
            />
            <UButton
              size="sm"
              label="Enviar"
              :loading="sendingResponse"
              :disabled="sendingResponse || !responseText.trim()"
              @click="onSendResponse"
            />
          </div>
        </div>

        <!-- Link Entity -->
        <div>
          <h4 class="text-sm font-medium mb-2">
            Vincular entidade
          </h4>

          <div v-if="detailData.entityLinks && detailData.entityLinks.length > 0" class="space-y-1 mb-3">
            <div
              v-for="link in detailData.entityLinks"
              :key="link.id"
              class="flex items-center gap-2 text-sm"
            >
              <UBadge
                :label="link.entityType"
                variant="outline"
                size="xs"
              />
              <a
                v-if="link.externalUrl"
                :href="link.externalUrl"
                target="_blank"
                class="text-primary hover:underline truncate"
              >
                {{ link.externalUrl }}
              </a>
              <span v-else class="text-dimmed text-xs">{{ link.entityId }}</span>
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <USelect
              :model-value="linkEntityType"
              :items="entityTypeOptions"
              value-key="value"
              placeholder="Tipo de entidade"
              size="sm"
              class="w-full"
              @update:model-value="linkEntityType = $event"
            />
            <UInput
              v-if="linkEntityType && linkEntityType !== 'external'"
              v-model="linkEntityId"
              placeholder="ID da entidade"
              size="sm"
              class="w-full"
            />
            <UInput
              v-if="linkEntityType === 'external'"
              v-model="linkExternalUrl"
              placeholder="URL externa (ex: GitHub issue)"
              size="sm"
              class="w-full"
            />
            <UButton
              size="sm"
              variant="outline"
              label="Vincular"
              :disabled="!linkEntityType"
              @click="onLinkEntity"
            />
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
