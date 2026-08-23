<script setup lang="ts">
import * as z from "zod";
import type { FormError, FormSubmitEvent } from "@nuxt/ui";

definePageMeta({
  layout: "app",
});

useSeoMeta({
  title: "Segurança",
});

const toast = useToast();

const passwordSchema = z.object({
  current: z.string().min(8, "Deve ter pelo menos 8 caracteres"),
  new: z.string().min(8, "Deve ter pelo menos 8 caracteres"),
});

type PasswordSchema = z.output<typeof passwordSchema>;

const password = reactive<Partial<PasswordSchema>>({
  current: "",
  new: "",
});

const isChangingPassword = ref(false);

const validate = (state: Partial<PasswordSchema>): FormError[] => {
  const errors: FormError[] = [];
  if (state.current && state.new && state.current === state.new) {
    errors.push({ name: "new", message: "As senhas devem ser diferentes" });
  }
  return errors;
};

async function onSubmitPassword(_event: FormSubmitEvent<PasswordSchema>) {
  if (isChangingPassword.value) return;
  isChangingPassword.value = true;

  try {
    await $fetch("/api/auth/password", {
      method: "PUT",
      body: {
        current_password: password.current,
        new_password: password.new,
      },
    });

    toast.add({
      title: "Senha alterada",
      description: "Sua senha foi atualizada com sucesso.",
      color: "success",
    });

    password.current = "";
    password.new = "";
  } catch (error: unknown) {
    const err = error as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    const message =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Não foi possível alterar a senha";
    toast.add({ title: "Erro", description: message, color: "error" });
  } finally {
    isChangingPassword.value = false;
  }
}

// ─── Journal PIN lock ────────────────────────────────────────────────────────
const {
  enabled: pinEnabled,
  mode: pinMode,
  statusLoaded: pinStatusLoaded,
  refreshStatus: refreshPinStatus,
  disablePin,
} = useJournalLock();

onMounted(() => {
  refreshPinStatus();
});

const pinModeLabels: Record<string, string> = {
  module: "Diário inteiro",
  entries: "Entradas específicas",
};

const pinSetupOpen = ref(false);
const isDisablingPin = ref(false);
const confirmDisablePinOpen = ref(false);

async function onDisablePin() {
  if (isDisablingPin.value) return;
  isDisablingPin.value = true;
  try {
    const ok = await disablePin();
    if (ok) confirmDisablePinOpen.value = false;
  } finally {
    isDisablingPin.value = false;
  }
}

// ─── Journal end-to-end encryption ──────────────────────────────────────────
const {
  enabled: encryptionEnabled,
  isUnlocked: encryptionUnlocked,
  statusLoaded: encryptionStatusLoaded,
  refreshStatus: refreshEncryptionStatus,
  changePassphrase,
  migrateToEncrypted,
  disable: disableEncryption,
} = useJournalEncryption();

onMounted(() => {
  refreshEncryptionStatus();
});

const encryptionSetupOpen = ref(false);
const changingPassphrase = ref(false);
const newPassphrase = ref("");
const confirmNewPassphrase = ref("");
const passphraseError = ref("");
const isChangingPassphrase = ref(false);
const isDisablingEncryption = ref(false);
const confirmDisableEncryptionOpen = ref(false);

// A migração roda sozinha na ativação (JournalEncryptionSetupModal), mas se
// a aba fechar no meio dela algumas entradas ficam em texto claro sem
// nenhum jeito de retomar — este botão existe pra isso. É seguro rodar
// mesmo sem nada pendente: pula qualquer entrada que já esteja cifrada.
const isMigrating = ref(false);
const migrationProgress = ref({ done: 0, total: 0 });

async function onMigrateExisting() {
  if (isMigrating.value) return;
  isMigrating.value = true;
  migrationProgress.value = { done: 0, total: 0 };
  try {
    const ok = await migrateToEncrypted((p) => {
      migrationProgress.value = p;
    });
    if (ok) {
      toast.add({
        title: "Migração concluída",
        description:
          migrationProgress.value.total > 0
            ? `${migrationProgress.value.total} entrada(s) verificada(s) — nenhuma ficou em texto claro.`
            : "Nenhuma entrada para migrar.",
        color: "success",
      });
    }
  } finally {
    isMigrating.value = false;
  }
}

async function onChangePassphrase() {
  if (newPassphrase.value.length < 12) {
    passphraseError.value =
      "A frase-secreta precisa ter pelo menos 12 caracteres.";
    return;
  }
  if (newPassphrase.value !== confirmNewPassphrase.value) {
    passphraseError.value = "As frases não coincidem.";
    return;
  }
  passphraseError.value = "";
  isChangingPassphrase.value = true;
  try {
    const ok = await changePassphrase(newPassphrase.value);
    if (ok) {
      changingPassphrase.value = false;
      newPassphrase.value = "";
      confirmNewPassphrase.value = "";
    }
  } finally {
    isChangingPassphrase.value = false;
  }
}

async function onDisableEncryption() {
  if (isDisablingEncryption.value) return;
  isDisablingEncryption.value = true;
  try {
    const ok = await disableEncryption();
    if (ok) confirmDisableEncryptionOpen.value = false;
  } finally {
    isDisablingEncryption.value = false;
  }
}

const isDeletingAccount = ref(false);

async function deleteAccount() {
  if (isDeletingAccount.value) return;
  isDeletingAccount.value = true;

  try {
    await $fetch("/api/auth/account", { method: "DELETE" });

    toast.add({
      title: "Conta excluída",
      description: "Sua conta foi removida permanentemente.",
      color: "success",
    });

    await navigateTo("/login");
  } catch (error: unknown) {
    const err = error as {
      data?: { statusMessage?: string };
      statusMessage?: string;
    };
    const message =
      err?.data?.statusMessage ||
      err?.statusMessage ||
      "Não foi possível excluir a conta";
    toast.add({ title: "Erro", description: message, color: "error" });
  } finally {
    isDeletingAccount.value = false;
  }
}
</script>

<template>
  <UPageCard
    title="Senha"
    description="Confirme sua senha atual antes de definir uma nova."
    variant="subtle"
  >
    <UForm
      :schema="passwordSchema"
      :state="password"
      :validate="validate"
      class="flex flex-col gap-4 max-w-xs"
      @submit="onSubmitPassword"
    >
      <UFormField name="current" label="Senha atual">
        <UInput
          v-model="password.current"
          type="password"
          placeholder="Senha atual"
          class="w-full"
        />
      </UFormField>

      <UFormField name="new" label="Nova senha">
        <UInput
          v-model="password.new"
          type="password"
          placeholder="Nova senha"
          class="w-full"
        />
      </UFormField>

      <UButton
        label="Alterar senha"
        class="w-fit"
        type="submit"
        :loading="isChangingPassword"
        :disabled="isChangingPassword"
      />
    </UForm>
  </UPageCard>

  <UPageCard
    title="PIN do Diário de Bordo"
    description="Uma trava extra para o conteúdo mais sensível do app — pedida antes de mostrar o Diário (ou entradas específicas), separada do login da conta."
    variant="subtle"
  >
    <div
      v-if="!pinStatusLoaded"
      class="flex items-center gap-2 text-sm text-muted"
    >
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
      Carregando...
    </div>

    <div v-else-if="pinEnabled" class="flex flex-col gap-3">
      <div class="flex items-center gap-2 text-sm text-highlighted">
        <UIcon name="i-lucide-lock" class="size-4 text-success" />
        PIN ativo — modo: {{ pinModeLabels[pinMode ?? ""] ?? pinMode }}
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          label="Alterar PIN"
          color="neutral"
          variant="outline"
          @click="pinSetupOpen = true"
        />
        <UButton
          label="Desativar"
          color="error"
          variant="outline"
          @click="confirmDisablePinOpen = true"
        />
      </div>
    </div>

    <div v-else class="flex flex-col gap-3">
      <p class="text-sm text-muted">
        Desativado — o Diário abre normalmente, sem PIN.
      </p>
      <UButton label="Ativar PIN" class="w-fit" @click="pinSetupOpen = true" />
    </div>
  </UPageCard>

  <JournalPinSetupModal v-model:open="pinSetupOpen" @saved="refreshPinStatus" />

  <UModal
    :open="confirmDisablePinOpen"
    @update:open="confirmDisablePinOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-lock-open" class="size-4 text-warning" />
        <span class="text-sm font-semibold text-highlighted"
          >Desativar PIN do Diário</span
        >
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        O Diário de Bordo (e qualquer entrada protegida individualmente) deixará
        de pedir PIN. Deseja continuar?
      </p>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          @click="confirmDisablePinOpen = false"
        />
        <UButton
          label="Desativar"
          color="error"
          :loading="isDisablingPin"
          @click="onDisablePin"
        />
      </div>
    </template>
  </UModal>

  <UPageCard
    title="Criptografia ponta-a-ponta"
    description="Cifra o título e o texto das suas entradas no seu navegador antes de qualquer coisa sair para o servidor — nem o Kortex consegue ler o conteúdo. Diferente do PIN: uma frase-secreta de verdade, não um código de 4 dígitos."
    variant="subtle"
  >
    <div
      v-if="!encryptionStatusLoaded"
      class="flex items-center gap-2 text-sm text-muted"
    >
      <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
      Carregando...
    </div>

    <div v-else-if="!encryptionEnabled" class="flex flex-col gap-3">
      <p class="text-sm text-muted">
        Desativado — as entradas são gravadas em texto claro, como hoje.
      </p>
      <UButton
        label="Ativar criptografia"
        class="w-fit"
        @click="encryptionSetupOpen = true"
      />
    </div>

    <div v-else-if="!encryptionUnlocked" class="flex flex-col gap-3">
      <p class="text-sm text-muted">
        Ativa, mas bloqueada nesta sessão. Desbloqueie para trocar a
        frase-secreta ou desativar.
      </p>
      <JournalEncryptionUnlockScreen compact />
    </div>

    <div v-else class="flex flex-col gap-3">
      <div class="flex items-center gap-2 text-sm text-highlighted">
        <UIcon name="i-lucide-shield-check" class="size-4 text-success" />
        Criptografia ativa e desbloqueada
      </div>

      <div v-if="!changingPassphrase" class="flex flex-col gap-2">
        <div class="flex flex-wrap gap-2">
          <UButton
            label="Trocar frase-secreta"
            color="neutral"
            variant="outline"
            @click="changingPassphrase = true"
          />
          <UButton
            label="Migrar entradas antigas"
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="outline"
            :loading="isMigrating"
            @click="onMigrateExisting"
          />
          <UButton
            label="Desativar"
            color="error"
            variant="outline"
            @click="confirmDisableEncryptionOpen = true"
          />
        </div>
        <p v-if="isMigrating" class="text-xs text-muted">
          Verificando entradas... {{ migrationProgress.done }}/{{
            migrationProgress.total
          }}
        </p>
        <p v-else class="text-xs text-dimmed">
          A migração roda sozinha ao ativar — use este botão só se ela foi
          interrompida (ex.: fechou a aba no meio) ou se quer conferir que não
          sobrou nada em texto claro.
        </p>
      </div>

      <div v-else class="flex flex-col gap-3 max-w-xs">
        <UFormField label="Nova frase-secreta">
          <UInput
            v-model="newPassphrase"
            type="password"
            class="w-full"
            placeholder="Pelo menos 12 caracteres"
          />
        </UFormField>
        <UFormField label="Confirme a nova frase-secreta">
          <UInput
            v-model="confirmNewPassphrase"
            type="password"
            class="w-full"
          />
        </UFormField>
        <p v-if="passphraseError" class="text-xs text-error">
          {{ passphraseError }}
        </p>
        <div class="flex gap-2">
          <UButton
            label="Cancelar"
            color="neutral"
            variant="ghost"
            @click="
              changingPassphrase = false;
              newPassphrase = '';
              confirmNewPassphrase = '';
              passphraseError = '';
            "
          />
          <UButton
            label="Salvar"
            :loading="isChangingPassphrase"
            @click="onChangePassphrase"
          />
        </div>
      </div>
    </div>
  </UPageCard>

  <JournalEncryptionSetupModal
    v-model:open="encryptionSetupOpen"
    @activated="refreshEncryptionStatus"
  />

  <UModal
    :open="confirmDisableEncryptionOpen"
    @update:open="confirmDisableEncryptionOpen = $event"
  >
    <template #header>
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-shield-off" class="size-4 text-warning" />
        <span class="text-sm font-semibold text-highlighted"
          >Desativar criptografia</span
        >
      </div>
    </template>

    <template #body>
      <p class="text-sm text-muted">
        Todas as entradas serão decifradas e voltam a ser gravadas em texto
        claro no servidor. Deseja continuar?
      </p>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-end gap-2">
        <UButton
          label="Cancelar"
          variant="ghost"
          color="neutral"
          @click="confirmDisableEncryptionOpen = false"
        />
        <UButton
          label="Desativar"
          color="error"
          :loading="isDisablingEncryption"
          @click="onDisableEncryption"
        />
      </div>
    </template>
  </UModal>

  <UPageCard
    title="Conta"
    description="Deseja encerrar sua conta? Essa ação é irreversível. Todos os dados associados serão excluídos permanentemente."
    class="bg-gradient-to-tl from-error/10 from-5% to-default"
  >
    <template #footer>
      <UButton
        label="Excluir conta"
        color="error"
        :loading="isDeletingAccount"
        :disabled="isDeletingAccount"
        @click="deleteAccount"
      />
    </template>
  </UPageCard>
</template>
