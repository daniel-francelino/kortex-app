<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  shake?: boolean
}>()

const emit = defineEmits<{
  submit: [pin: string]
}>()

const digits = ref('')
const inputRef = ref<HTMLInputElement | null>(null)

function focus() {
  inputRef.value?.focus()
}

function onInput(event: Event) {
  const target = event.target as HTMLInputElement
  const next = target.value.replace(/\D/g, '').slice(0, 4)
  digits.value = next
  target.value = next
  if (next.length === 4 && !props.loading) {
    emit('submit', next)
  }
}

function clear() {
  digits.value = ''
  if (inputRef.value) inputRef.value.value = ''
  focus()
}

defineExpose({ clear, focus })

onMounted(() => focus())
</script>

<template>
  <div class="flex flex-col items-center gap-4">
    <div
      class="flex items-center gap-3"
      :class="shake ? 'kortex-pin-shake' : ''"
      @click="focus"
    >
      <span
        v-for="i in 4"
        :key="i"
        class="size-3.5 rounded-full border-2 transition-colors"
        :class="digits.length >= i ? 'border-primary bg-primary' : 'border-default bg-transparent'"
      />
    </div>
    <input
      ref="inputRef"
      type="tel"
      inputmode="numeric"
      autocomplete="off"
      maxlength="4"
      aria-label="PIN de 4 dígitos"
      class="sr-only"
      :disabled="loading"
      @input="onInput"
    >
  </div>
</template>
