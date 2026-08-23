<script setup lang="ts">
import type { JournalPinMode } from '~/types/journal'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'saved': []
}>()

const { setupPin } = useJournalLock()

type Step = 'mode' | 'enter' | 'confirm'
const step = ref<Step>('mode')
const mode = ref<JournalPinMode>('module')
const firstPin = ref('')
const error = ref('')
const shake = ref(false)
const saving = ref(false)
const pinPadRef = ref<{ clear: () => void, focus: () => void } | null>(null)

const modeOptions: { value: JournalPinMode, label: string, description: string }[] = [
  { value: 'module', label: 'Diário inteiro', description: 'Pede o PIN toda vez que você abrir o Diário de Bordo.' },
  { value: 'entries', label: 'Entradas específicas', description: 'Sem trava geral — você escolhe quais entradas protege, uma a uma, dentro do Diário.' }
]

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    step.value = 'mode'
    mode.value = 'module'
    firstPin.value = ''
    error.value = ''
    saving.value = false
  }
})

function goToEnter() {
  step.value = 'enter'
  nextTick(() => pinPadRef.value?.clear())
}

function onFirstPin(pin: string) {
  firstPin.value = pin
  step.value = 'confirm'
  error.value = ''
  nextTick(() => pinPadRef.value?.clear())
}

async function onConfirmPin(pin: string) {
  if (pin !== firstPin.value) {
    error.value = 'Os PINs não coincidem. Tente de novo.'
    shake.value = true
    pinPadRef.value?.clear()
    setTimeout(() => { shake.value = false }, 400)
    step.value = 'enter'
    firstPin.value = ''
    return
  }

  saving.value = true
  try {
    const ok = await setupPin(pin, mode.value)
    if (ok) {
      emit('saved')
      emit('update:open', false)
    }
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Proteger o Diário com PIN"
    :ui="{ content: 'z-[260]', overlay: 'z-[250]' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <!-- Step 1: choose mode -->
      <div v-if="step === 'mode'" class="space-y-3">
        <URadioGroup
          v-model="mode"
          :items="modeOptions"
          value-key="value"
        />
        <UButton
          label="Continuar"
          block
          @click="goToEnter"
        />
      </div>

      <!-- Step 2/3: enter + confirm PIN -->
      <div v-else class="flex flex-col items-center gap-3 py-4">
        <p class="text-sm text-muted">
          {{ step === 'enter' ? 'Digite um PIN de 4 dígitos' : 'Confirme o PIN' }}
        </p>
        <JournalPinPad
          ref="pinPadRef"
          :loading="saving"
          :shake="shake"
          @submit="step === 'enter' ? onFirstPin($event) : onConfirmPin($event)"
        />
        <p v-if="error" class="text-xs text-error">
          {{ error }}
        </p>
      </div>
    </template>
  </UModal>
