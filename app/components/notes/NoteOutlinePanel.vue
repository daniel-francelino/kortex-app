<script setup lang="ts">
type OutlineItem = { level: number, text: string, blockId: string }

defineProps<{
  outline: OutlineItem[]
  activeHeadingId: string | null
}>()

const emit = defineEmits<{
  'click-item': [blockId: string]
}>()
</script>

<template>
  <div class="p-3 space-y-0.5">
    <p
      v-if="outline.length < 2"
      class="text-xs text-muted px-1 py-2"
    >
      Adicione títulos (H1/H2/H3) para gerar um sumário.
    </p>

    <template v-else>
      <UTooltip
        v-for="item in outline"
        :key="item.blockId"
        :text="item.text || 'Sem título'"
      >
        <button
          type="button"
          class="w-full text-left text-xs rounded px-2 py-1.5 truncate transition-colors"
          :class="activeHeadingId === item.blockId
            ? 'text-primary font-medium bg-primary/5'
            : 'text-muted hover:text-highlighted hover:bg-elevated'"
          :style="{ paddingLeft: `${8 + (item.level - 1) * 12}px` }"
          @click="emit('click-item', item.blockId)"
        >
          {{ item.text || 'Sem título' }}
        </button>
      </UTooltip>
    </template>
  </div>
</template>
