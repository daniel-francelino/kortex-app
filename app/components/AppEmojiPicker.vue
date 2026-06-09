<script setup lang="ts">
const emit = defineEmits<{
  select: [emoji: string, name: string]
}>()

const colorMode = useColorMode()
const containerRef = ref<HTMLElement | null>(null)

const theme = computed(() => colorMode.value === 'dark' ? 'dark' : 'light')

let picker: HTMLElement | null = null

async function createPicker() {
  if (!containerRef.value) return

  const [{ Picker }, data] = await Promise.all([
    import('emoji-mart'),
    import('@emoji-mart/data').then(m => m.default)
  ])

  if (!containerRef.value) return
  containerRef.value.innerHTML = ''

  picker = new Picker({
    data,
    theme: theme.value,
    locale: 'pt',
    previewPosition: 'none',
    skinTonePosition: 'none',
    onEmojiSelect(emoji: { native: string, id: string }) {
      emit('select', emoji.native, emoji.id)
    }
  }) as unknown as HTMLElement

  containerRef.value.appendChild(picker)
}

onMounted(() => {
  createPicker()
})

watch(theme, () => {
  createPicker()
})
</script>

<template>
  <div ref="containerRef" class="kortex-emoji-mart" />
</template>

<style>
.kortex-emoji-mart em-emoji-picker {
  --border-radius: 0px;
  --shadow: none;
  --border-color: transparent;
  width: 100%;
  min-width: 0;
}
</style>
