<script setup lang="ts">
import type { MigrationProgress } from '~/composables/useJournalEncryption'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'activated': []
}>()

const { activate, migrateToEncrypted } = useJournalEncryption()

const MIN_LENGTH = 12

type Step = 'passphrase' | 'recovery-code' | 'migrating' | 'done'
const step = ref<Step>('passphrase')
const passphrase = ref('')
const confirmPassphrase = ref('')
const error = ref('')
const recoveryCode = ref('')
const savedConfirmed = ref(false)
const saving = ref(false)
const progress = ref<MigrationProgress>({ done: 0, total: 0 })

watch(() => props.open, (isOpen) => {
  if (isOpen) {
    step.value = 'passphrase'
    passphrase.value = ''
    confirmPassphrase.value = ''
    error.value = ''
    recoveryCode.value = ''
    savedConfirmed.value = false
    saving.value = false
    progress.value = { done: 0, total: 0 }
  }
})

async function onSubmitPassphrase() {
  if (passphrase.value.length < MIN_LENGTH) {
    error.value = `A frase-secreta precisa ter pelo menos ${MIN_LENGTH} caracteres.`
    return
  }
  if (passphrase.value !== confirmPassphrase.value) {
    error.value = 'As frases não coincidem.'
    return
  }
  error.value = ''
  saving.value = true
  const result = await activate(passphrase.value)
  saving.value = false
  if (!result) return
  recoveryCode.value = result.recoveryCode
  step.value = 'recovery-code'
}

async function onConfirmRecoveryCode() {
  step.value = 'migrating'
  await migrateToEncrypted((p) => { progress.value = p })
  step.value = 'done'
}

function onFinish() {
  emit('activated')
  emit('update:open', false)
}
</script>

<template>
  <UModal
    :open="props.open"
    title="Ativar criptografia ponta-a-ponta"
    :close="step !== 'migrating'"
    :prevent-close="step === 'migrating'"
    :ui="{ content: 'z-[260]', overlay: 'z-[250]' }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div
        v-if="step === 'passphrase'"
        class="space-y-3"
      >
        <p class="text-xs text-muted">
          Essa frase é diferente do PIN e da senha da sua conta — só você a conhece, e nem o Kortex consegue recuperá-la sozinho se for perdida (por isso o próximo passo gera um código de recuperação).
        </p>
        <UFormField label="Frase-secreta">
          <UInput
            v-model="passphrase"
            type="password"
            class="w-full"
            :placeholder="`Pelo menos ${MIN_LENGTH} caracteres`"
          />
        </UFormField>
        <UFormField label="Confirme a frase-secreta">
          <UInput
            v-model="confirmPassphrase"
            type="password"
            class="w-full"
          />
        </UFormField>
        <p
          v-if="error"
          class="text-xs text-error"
        >
          {{ error }}
        </p>
        <UButton
          label="Ativar"
          block
          :loading="saving"
          @click="onSubmitPassphrase"
        />
      </div>

      <div
        v-else-if="step === 'recovery-code'"
        class="space-y-3"
      >
        <p class="text-sm text-highlighted">
          Guarde este código de recuperação em lugar seguro — é a única forma de recuperar o acesso se você esquecer a frase-secreta, sem precisar do suporte.
        </p>
        <p class="select-all rounded-lg border border-default bg-elevated/40 p-3 text-center font-mono text-sm">
          {{ recoveryCode }}
        </p>
        <UCheckbox
          v-model="savedConfirmed"
          label="Eu salvei este código em lugar seguro"
        />
        <UButton
          label="Continuar"
          block
          :disabled="!savedConfirmed"
          @click="onConfirmRecoveryCode"
        />
      </div>

      <div
        v-else-if="step === 'migrating'"
        class="flex flex-col items-center gap-3 py-6"
      >
        <UIcon
          name="i-lucide-loader-2"
          class="size-8 animate-spin text-primary"
        />
        <p class="text-sm text-muted">
          Cifrando suas entradas existentes... {{ progress.done }}/{{ progress.total }}
        </p>
        <UProgress :model-value="progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0" />
      </div>

      <div
        v-else
        class="flex flex-col items-center gap-3 py-6 text-center"
      >
        <UIcon
          name="i-lucide-check-circle"
          class="size-8 text-success"
        />
        <p class="text-sm text-highlighted">
          Criptografia ativada.
        </p>
        <UButton
          label="Concluir"
          @click="onFinish"
        />
      </div>
    </template>
  </UModal>
</template>
