<script setup lang="ts">
import type { NotionCommandItem } from '~/composables/useNotionEditor'

const props = defineProps<{
  visible: boolean
  items: NotionCommandItem[]
  selectedIndex: number
  pos: { x: number, y: number }
}>()

const emit = defineEmits<{
  hover: [index: number]
  select: [item: NotionCommandItem]
}>()

const menuRef = ref<HTMLElement | null>(null)

watch(() => props.selectedIndex, (index) => {
  nextTick(() => {
    const item = menuRef.value?.children[index] as HTMLElement | undefined
    item?.scrollIntoView({ block: 'nearest' })
  })
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible && items.length > 0"
      ref="menuRef"
      class="kortex-slash-menu"
      :style="{ top: `${pos.y}px`, left: `${pos.x}px` }"
    >
      <p class="kortex-menu-label">
        Blocos basicos
      </p>
      <button
        v-for="(item, index) in items"
        :key="item.title"
        type="button"
        :class="['kortex-command-item', { selected: index === selectedIndex }]"
        @mouseenter="emit('hover', index)"
        @click="emit('select', item)"
      >
        <span class="kortex-command-icon">
          <UIcon :name="item.icon" class="size-4" />
        </span>
        <span class="kortex-command-text">
          <span class="kortex-command-title">{{ item.title }}</span>
          <span class="kortex-command-desc">{{ item.description }}</span>
        </span>
      </button>
    </div>
  </Teleport>
</template>
