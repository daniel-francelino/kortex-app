<script setup lang="ts">
const props = defineProps<{
  compact?: boolean
  entryDate?: string
}>()

const emit = defineEmits<{
  unlocked: []
}>()

const { verifyPin } = useJournalLock()

const pinPadRef = ref<{ clear: () => void, focus: () => void } | null>(null)
const loading = ref(false)
const shake = ref(false)
const errorMessage = ref('')
const lockedUntil = ref<Date | null>(null)
const now = ref(Date.now())

let tickTimer: ReturnType<typeof setInterval> | null = null

const remainingSeconds = computed(() => {
  if (!lockedUntil.value) return 0
  return Math.max(0, Math.ceil((lockedUntil.value.getTime() - now.value) / 1000))
})

const isLockedOut = computed(() => remainingSeconds.value > 0)

watch(isLockedOut, (locked) => {
  if (locked && !tickTimer) {
    tickTimer = setInterval(() => { now.value = Date.now() }, 1000)
  } else if (!locked && tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
    lockedUntil.value = null
  }
})

onBeforeUnmount(() => {
  if (tickTimer) clearInterval(tickTimer)
})

async function onSubmit(pin: string) {
  if (isLockedOut.value || loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const result = await verifyPin(pin, props.entryDate)
    if (result.valid) {
      emit('unlocked')
      return
    }
    if (result.lockedUntil) {
      lockedUntil.value = new Date(result.lockedUntil)
      errorMessage.value = 'Muitas tentativas erradas.'
    } else {
      errorMessage.value = 'PIN incorreto.'
    }
    shake.value = true
    pinPadRef.value?.clear()
    setTimeout(() => { shake.value = false }, 400)
  } catch {
    errorMessage.value = 'Não foi possível verificar o PIN.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="flex flex-col items-center justify-center gap-4 text-center"
    :class="compact ? 'py-10' : 'py-24'"
  >
    <UIcon
      name="i-lucide-lock"
      class="text-dimmed"
      :class="compact ? 'size-8' : 'size-10'"
    />
    <div>
      <p class="text-sm font-medium text-highlighted">
        {{ entryDate ? 'Entrada protegida' : 'Diário protegido' }}
      </p>
      <p class="text-xs text-muted">
        Digite o PIN para continuar.
      </p>
    </div>

    <JournalPinPad
      ref="pinPadRef"
      :loading="loading || isLockedOut"
      :shake="shake"
      @submit="onSubmit"
    />

    <p
      v-if="isLockedOut"
      class="text-xs text-warning"
    >
      Muitas tentativas. Tente novamente em {{ remainingSeconds }}s.
    </p>
    <p
      v-else-if="errorMessage"
      class="text-xs text-error"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>
