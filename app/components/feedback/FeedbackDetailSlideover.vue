<script setup lang="ts">
import { z } from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Feedback } from '~/types/feedback'
import {
  feedbackTypeLabels,
  feedbackTypeIcons,
  feedbackTypeColors,
  feedbackPriorityLabels,
  feedbackPriorityColors
} from '~/types/feedback'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  open: boolean
  feedback: Feedback | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'delete': [id: string]
  'respond': [feedbackId: string, content: string]
}>()

const responseSchema = z.object({
  content: z.string().min(1, 'Resposta é obrigatória').max(5000)
})

type ResponseSchema = z.infer<typeof responseSchema>

const responseState = reactive<ResponseSchema>({ content: '' })
const sendingResponse = ref(false)

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

function formatDate(iso: string) {
  return formatDisplay(iso, "dd 'de' MMM'.' 'de' yyyy, HH:mm")
}

async function onSubmitResponse(evt: FormSubmitEvent<ResponseSchema>) {
  if (!detailData.value) return
  if (sendingResponse.value) return
  sendingResponse.value = true
  try {
    emit('respond', detailData.value.id, evt.data.content)
    responseState.content = ''
  } finally {
    sendingResponse.value = false
  }
}

function onClose() {
  emit('update:open', false)
  responseState.content = ''
}
</script>

<template>
  <USlideover :open="props.open" title="Detalhes do feedback" @update:open="onClose">
    <template #body>
      <div v-if="loadingDetail" class="space-y-4 p-4">
        <USkeleton class="h-6 w-3/4" />
        <USkeleton class="h-4 w-1/2" />
        <USkeleton class="h-20 w-full" />
      </div>

      <div v-else-if="detailData" class="space-y-6 p-4">
        <!-- Header -->
        <div>
          <div class="flex items-center gap-2 mb-2">
            <UIcon :name="feedbackTypeIcons[detailData.type]" :class="`text-${feedbackTypeColors[detailData.type]}`" class="text-lg" />
            <h3 class="text-lg font-semibold">
              {{ detailData.title }}
            </h3>
          </div>
          <div class="flex items-center gap-2 flex-wrap">
            <UBadge
              :label="feedbackTypeLabels[detailData.type]"
              :color="feedbackTypeColors[detailData.type]"
              variant="subtle"
              size="sm"
            />
            <FeedbackStatusBadge :status="detailData.status" />
            <UBadge
              :label="feedbackPriorityLabels[detailData.priority]"
              :color="feedbackPriorityColors[detailData.priority]"
              variant="outline"
              size="sm"
            />
          </div>
          <p class="text-xs text-dimmed mt-2">
            Criado em {{ formatDate(detailData.createdAt) }}
            <span v-if="detailData.updatedAt !== detailData.createdAt"> · Atualizado em {{ formatDate(detailData.updatedAt) }}</span>
          </p>
        </div>

        <!-- Description -->
        <div>
          <h4 class="text-sm font-medium mb-1">
            Descrição
          </h4>
          <p class="text-sm text-dimmed whitespace-pre-wrap">
            {{ detailData.description }}
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
            <p><span class="font-medium">Versão:</span> {{ detailData.techContext.appVersion }}</p>
            <p><span class="font-medium">Data:</span> {{ detailData.techContext.timestamp }}</p>
          </div>
        </div>

        <!-- Attachments -->
        <div v-if="detailData.attachments && detailData.attachments.length > 0">
          <h4 class="text-sm font-medium mb-1">
            Anexos
          </h4>
          <div class="space-y-1">
            <a
              v-for="att in detailData.attachments"
              :key="att.id"
              :href="att.fileUrl"
              target="_blank"
              class="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <UIcon name="i-lucide-paperclip" class="text-xs" />
              {{ att.fileName }}
            </a>
          </div>
        </div>

        <!-- Entity Links -->
        <div v-if="detailData.entityLinks && detailData.entityLinks.length > 0">
          <h4 class="text-sm font-medium mb-1">
            Entidades vinculadas
          </h4>
          <div class="space-y-1">
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
        </div>

        <!-- Responses -->
        <div>
          <h4 class="text-sm font-medium mb-2">
            Respostas
            <span v-if="detailData.responses" class="text-dimmed">({{ detailData.responses.length }})</span>
          </h4>

          <div v-if="detailData.responses && detailData.responses.length > 0" class="space-y-3 mb-4">
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
                  label="Você"
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

          <div v-else class="text-sm text-dimmed mb-4">
            Nenhuma resposta ainda.
          </div>

          <!-- Add response form -->
          <UForm :schema="responseSchema" :state="responseState" @submit="onSubmitResponse">
            <UFormField name="content" label="Adicionar resposta">
              <UTextarea
                v-model="responseState.content"
                placeholder="Escreva uma resposta..."
                :rows="3"
                class="w-full"
              />
            </UFormField>
            <div class="flex justify-end mt-2">
              <UButton
                type="submit"
                size="sm"
                label="Enviar resposta"
                :loading="sendingResponse"
                :disabled="sendingResponse"
              />
            </div>
          </UForm>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 pt-2 border-t border-default">
          <UButton
            v-if="detailData.status === 'submitted'"
            color="error"
            variant="ghost"
            size="sm"
            label="Excluir"
            icon="i-lucide-trash-2"
            @click="emit('delete', detailData.id)"
          />
        </div>
      </div>
    </template>
  </USlideover>
</template>
