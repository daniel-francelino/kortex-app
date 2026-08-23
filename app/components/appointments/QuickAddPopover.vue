<script setup lang="ts">
import { parseQuickAddText } from '~/utils/quick-add-parser'

const emit = defineEmits<{
  parsed: [result: { title: string, startAt: Date | null, location: string | null }]
}>()

const open = ref(false)
const text = ref('')

function onSubmit() {
  if (!text.value.trim()) return
  const result = parseQuickAddText(text.value)
  emit('parsed', result)
  text.value = ''
  open.value = false
}
</script>

<template>
  <UPopover v-model:open="open" :content="{ align: 'end', side: 'bottom', sideOffset: 8 }">
    <UTooltip text="Adicionar rápido">
      <UButton
        square
        color="neutral"
        variant="ghost"
        icon="i-lucide-sparkles"
      />
    </UTooltip>

    <template #content>
      <div class="w-80 space-y-2 p-3">
        <p class="text-xs text-muted">
          Descreva o evento em texto livre — vamos tentar identificar data, horário e local.
        </p>
        <UInput
          v-model="text"
          placeholder="Ex: Café com Ben terça às 15h no Verve"
          size="sm"
          class="w-full"
          autofocus
          @keydown.enter="onSubmit"
        />
        <div class="flex justify-end">
          <UButton
            label="Continuar"
            size="xs"
            :disabled="!text.trim()"
            @click="onSubmit"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>
