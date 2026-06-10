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

interface GroupedItems {
  label: string
  items: { item: NotionCommandItem; index: number }[]
}

const groupOrder = ['Texto', 'Lista', 'Midia', 'Avancado', 'Inline']

const groupedItems = computed<GroupedItems[]>(() => {
  const map = new Map<string, GroupedItems>()

  props.items.forEach((item, index) => {
    const key = item.group ?? 'Geral'
    if (!map.has(key)) map.set(key, { label: key, items: [] })
    map.get(key)!.items.push({ item, index })
  })

  // Preserve defined order, then any extra groups at the end
  const ordered: GroupedItems[] = []
  for (const key of groupOrder) {
    const g = map.get(key)
    if (g) ordered.push(g)
  }
  for (const [key, g] of map) {
    if (!groupOrder.includes(key)) ordered.push(g)
  }

  return ordered
})

watch(() => props.selectedIndex, (index) => {
  nextTick(() => {
    const item = menuRef.value?.querySelector<HTMLElement>(`[data-item-index="${index}"]`)
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
      <template v-for="group in groupedItems" :key="group.label">
        <p class="kortex-menu-label">
          {{ group.label }}
        </p>
        <button
          v-for="{ item, index } in group.items"
          :key="item.title"
          type="button"
          :data-item-index="index"
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
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.kortex-slash-menu {
  position: fixed;
  z-index: 9999;
  width: 280px;
  max-height: 380px;
  overflow-y: auto;
  border-radius: 8px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 6px;
}

.kortex-menu-label {
  font-size: 0.68rem;
  font-weight: 600;
  color: var(--ui-text-dimmed);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  padding: 8px 8px 4px;
  margin: 0;
}

.kortex-menu-label:first-child {
  padding-top: 4px;
}

.kortex-command-item {
  display: flex;
  align-items: center;
  width: 100%;
  gap: 10px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ui-text-highlighted);
  cursor: pointer;
  text-align: left;
  padding: 5px 6px;
  transition: background 0.08s;
}

.kortex-command-item:hover,
.kortex-command-item.selected {
  background: var(--ui-bg-muted);
}

.kortex-command-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 6px;
  background: var(--ui-bg-elevated);
  border: 1px solid var(--ui-border);
  flex-shrink: 0;
  color: var(--ui-text-muted);
}

.kortex-command-item.selected .kortex-command-icon,
.kortex-command-item:hover .kortex-command-icon {
  background: var(--ui-bg);
  color: var(--ui-text-highlighted);
}

.kortex-command-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.kortex-command-title {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--ui-text-highlighted);
  line-height: 1.3;
}

.kortex-command-desc {
  font-size: 0.75rem;
  color: var(--ui-text-muted);
  line-height: 1.3;
}
</style>
