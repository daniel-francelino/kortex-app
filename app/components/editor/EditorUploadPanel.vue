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

<style scoped>
.kortex-upload-panel {
  position: absolute;
  right: 0.75rem;
  top: 0.625rem;
  z-index: 2;
  width: min(320px, calc(100% - 1.5rem));
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  pointer-events: auto;
}

.kortex-upload-task {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg);
  color: var(--ui-text-muted);
  padding: 0.45rem 0.5rem;
  font-size: 0.75rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.kortex-upload-task-row {
  display: inline-flex;
  align-items: center;
  width: 100%;
  gap: 0.4rem;
}

.kortex-upload-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kortex-upload-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.35rem;
  height: 1.35rem;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-text-muted);
  cursor: pointer;
}

.kortex-upload-action:hover {
  background: var(--ui-bg-muted);
  color: var(--ui-text-highlighted);
}

.kortex-upload-progress {
  height: 3px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--ui-bg-muted);
  margin-top: 0.4rem;
}

.kortex-upload-progress span {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--ui-color-primary, #18b981);
}

.kortex-upload-error {
  margin: 0.35rem 0 0;
  color: var(--ui-color-error, #ef4444);
  line-height: 1.35;
}
</style>
