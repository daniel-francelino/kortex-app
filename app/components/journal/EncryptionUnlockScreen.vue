<script setup lang="ts">
const props = defineProps<{
  compact?: boolean
}>()

const emit = defineEmits<{
  unlocked: []
}>()

const { unlock } = useJournalEncryption()

const usingRecovery = ref(false)
const secret = ref('')
const loading = ref(false)
const errorMessage = ref('')

function toggleMode() {
  usingRecovery.value = !usingRecovery.value
  secret.value = ''
  errorMessage.value = ''
}

async function onSubmit() {
  if (!secret.value || loading.value) return
  loading.value = true
  errorMessage.value = ''
  try {
    const ok = await unlock(secret.value, usingRecovery.value ? 'recovery' : 'password')
    if (ok) {
      emit('unlocked')
    } else {
      errorMessage.value = usingRecovery.value ? 'Código de recuperação incorreto.' : 'Frase-secreta incorreta.'
    }
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
      name="i-lucide-shield-check"
      class="text-dimmed"
      :class="compact ? 'size-8' : 'size-10'"
    />
    <div>
      <p class="text-sm font-medium text-highlighted">
        Diário criptografado
      </p>
      <p class="text-xs text-muted">
        Digite {{ usingRecovery ? 'seu código de recuperação' : 'a frase-secreta' }} para continuar.
      </p>
    </div>

    <form
      class="flex w-full max-w-xs flex-col gap-2"
      @submit.prevent="onSubmit"
    >
      <UInput
        v-model="secret"
        :type="usingRecovery ? 'text' : 'password'"
        :placeholder="usingRecovery ? 'XXXX-XXXX-XXXX-...' : 'Frase-secreta'"
        autofocus
        class="w-full"
      />
      <UButton
        label="Desbloquear"
        type="submit"
        block
        :loading="loading"
        :disabled="!secret"
      />
    </form>

    <p
      v-if="errorMessage"
      class="text-xs text-error"
    >
      {{ errorMessage }}
    </p>

    <button
      type="button"
      class="text-xs text-primary underline underline-offset-2 cursor-pointer"
      @click="toggleMode"
    >
      {{ usingRecovery ? 'Usar frase-secreta' : 'Usar código de recuperação' }}
    </button>
  </div>
</template>
