<script setup lang="ts">
export interface EditorUploadTaskView {
  id: string
  name: string
  progress: number
  status: 'uploading' | 'done' | 'error' | 'canceled'
  error?: string
}

defineProps<{
  tasks: EditorUploadTaskView[]
}>()

const emit = defineEmits<{
  cancel: [id: string]
  retry: [id: string]
  dismiss: [id: string]
}>()
</script>

<template>
  <div
    v-if="tasks.length"
    class="kortex-upload-panel"
  >
    <div
      v-for="task in tasks"
      :key="task.id"
      class="kortex-upload-task"
    >
      <div class="kortex-upload-task-row">
        <UIcon
          :name="task.status === 'uploading' ? 'i-lucide-loader-circle' : task.status === 'error' ? 'i-lucide-alert-circle' : 'i-lucide-check-circle'"
          :class="['size-3.5 shrink-0', { 'animate-spin': task.status === 'uploading' }]"
        />
        <span class="kortex-upload-name">{{ task.name }}</span>
        <button
          v-if="task.status === 'uploading'"
          type="button"
          class="kortex-upload-action"
          title="Cancelar upload"
          @click="emit('cancel', task.id)"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
        <button
          v-else-if="task.status === 'error'"
          type="button"
          class="kortex-upload-action"
          title="Tentar novamente"
          @click="emit('retry', task.id)"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
        </button>
        <button
          v-else
          type="button"
          class="kortex-upload-action"
          title="Dispensar"
          @click="emit('dismiss', task.id)"
        >
          <UIcon name="i-lucide-x" class="size-3.5" />
        </button>
      </div>

      <div
        v-if="task.status === 'uploading'"
        class="kortex-upload-progress"
      >
        <span :style="{ width: `${task.progress}%` }" />
      </div>
      <p
        v-else-if="task.status === 'error'"
        class="kortex-upload-error"
      >
        {{ task.error || 'Nao foi possivel enviar.' }}
      </p>
    </div>
  </div>
</template>
