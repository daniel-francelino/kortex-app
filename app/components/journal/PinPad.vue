<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  shake?: boolean
}>()

const emit = defineEmits<{
  submit: [pin: string]
}>()

const digits = ref<string[]>([])
const pinInputRef = ref<{ inputsRef?: Array<{ $el?: HTMLInputElement }> } | null>(null)

function focus() {
  pinInputRef.value?.inputsRef?.[0]?.$el?.focus()
}

function clear() {
  digits.value = []
  nextTick(focus)
}

function onComplete(value: string[]) {
  const pin = value.join('').replace(/\D/g, '').slice(0, 4)
  if (pin.length === 4 && !props.loading) emit('submit', pin)
}

defineExpose({ clear, focus })

onMounted(() => focus())
</script>

<template>
  <div
    class="flex flex-col items-center gap-3"
    :class="shake ? 'kortex-pin-shake' : ''"
  >
    <UPinInput
      ref="pinInputRef"
      v-model="digits"
      length="4"
      mask
      otp
      autofocus
      type="number"
      size="xl"
      :disabled="loading"
      :color="shake ? 'error' : 'primary'"
      :highlight="shake"
      aria-label="PIN de 4 digitos"
      :ui="{
        root: 'gap-2',
        base: 'size-11 rounded-lg text-lg font-semibold shadow-sm'
      }"
      @complete="onComplete"
    />
  </div>
</template>
