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

const title = computed(() => props.entryDate ? 'Entrada protegida' : 'Diário protegido')
const description = computed(() =>
  props.entryDate
    ? 'Digite o PIN para abrir esta entrada.'
    : 'Digite o PIN para acessar o Diário de Bordo.'
)

const remainingSeconds = computed(() => {
  if (!lockedUntil.value) return 0
  return Math.max(0, Math.ceil((lockedUntil.value.getTime() - now.value) / 1000))
})

const isLockedOut = computed(() => remainingSeconds.value > 0)

watch(isLockedOut, (locked) => {
  if (locked && !tickTimer) {
    tickTimer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
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
    setTimeout(() => {
      shake.value = false
    }, 400)
  } catch {
    errorMessage.value = 'Não foi possível verificar o PIN.'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div
    class="flex items-center justify-center px-4"
    :class="compact ? 'py-8' : 'min-h-[60vh] py-16'"
  >
    <UCard
      class="w-full max-w-sm"
      :ui="{ body: 'p-6 sm:p-7' }"
    >
      <div class="flex flex-col items-center gap-5 text-center">
        <div class="flex size-14 items-center justify-center rounded-full border border-primary/20 bg-primary/10">
          <UIcon name="i-lucide-lock-keyhole" class="size-7 text-primary" />
        </div>

        <div class="space-y-1">
          <div class="flex items-center justify-center gap-2">
            <h3 class="text-base font-semibold text-highlighted">
              {{ title }}
            </h3>
            <UBadge
              v-if="entryDate"
              color="neutral"
              variant="subtle"
              size="sm"
            >
              entrada
            </UBadge>
          </div>
          <p class="text-sm text-muted">
            {{ description }}
          </p>
        </div>

        <JournalPinPad
          ref="pinPadRef"
          :loading="loading || isLockedOut"
          :shake="shake"
          @submit="onSubmit"
        />

        <div class="min-h-10 w-full">
          <UAlert
            v-if="isLockedOut"
            color="warning"
            variant="soft"
            icon="i-lucide-timer"
            :description="`Muitas tentativas. Tente novamente em ${remainingSeconds}s.`"
            :ui="{ description: 'text-xs' }"
          />
          <UAlert
            v-else-if="errorMessage"
            color="error"
            variant="soft"
            icon="i-lucide-circle-alert"
            :description="errorMessage"
            :ui="{ description: 'text-xs' }"
          />
        </div>
      </div>
    </UCard>
  </div>
</template>
