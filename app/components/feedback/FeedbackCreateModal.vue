<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import {
  FeedbackType,
  feedbackTypeLabels,
  feedbackTypeIcons,
} from "~/types/feedback";
import type { CreateFeedbackPayload, TechContext } from "~/types/feedback";
import {
  FEEDBACK_ACCEPT,
  validateFeedbackFiles,
} from "#shared/utils/feedback-attachments";

const props = defineProps<{
  open: boolean;
  initialType?: FeedbackType;
  submitFeedback: (
    payload: CreateFeedbackPayload,
    files: File[],
  ) => Promise<void>;
}>();
const emit = defineEmits<{ "update:open": [value: boolean] }>();
const schema = z.object({
  type: z.nativeEnum(FeedbackType),
  title: z.string().trim().min(1, "Dê um título ao seu feedback").max(200),
  description: z
    .string()
    .trim()
    .min(1, "Conte um pouco mais para entendermos")
    .max(5000),
  includeTechContext: z.boolean(),
});
type Schema = z.infer<typeof schema>;
const state = reactive<Schema>({
  type: FeedbackType.Suggestion,
  title: "",
  description: "",
  includeTechContext: false,
});
const route = useRoute();
const saving = ref(false);
const files = ref<File[]>([]);
const fileError = ref("");
const submitError = ref("");
const totalSize = computed(() =>
  files.value.reduce((total, file) => total + file.size, 0),
);
const typeOptions = Object.values(FeedbackType).map((value) => ({
  label: feedbackTypeLabels[value],
  value,
  icon: feedbackTypeIcons[value],
}));
const prompts: Record<FeedbackType, string> = {
  bug: "Em qual tela aconteceu? O que você tentou fazer, o que esperava e o que aconteceu?",
  suggestion:
    "O que você gostaria de fazer no Kortex? Conte um exemplo de como isso ajudaria sua rotina.",
  improvement:
    "Qual recurso pode melhorar? O que está difícil e como você gostaria que funcionasse?",
  praise:
    "O que você gostou de usar? Conte como isso fez diferença no seu dia.",
};
watch(
  () => props.open,
  (open) => {
    if (open && !state.title && !state.description && !files.value.length)
      state.type = props.initialType ?? FeedbackType.Suggestion;
  },
);
function formatSize(bytes: number) {
  return bytes < 1024 * 1024
    ? Math.max(1, Math.round(bytes / 1024)) + " KB"
    : (bytes / 1024 / 1024).toFixed(1) + " MB";
}
function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  const next = [...files.value, ...Array.from(input.files ?? [])];
  fileError.value = validateFeedbackFiles(next) ?? "";
  if (!fileError.value) files.value = next;
  input.value = "";
}
function removeFile(index: number) {
  files.value.splice(index, 1);
  fileError.value = "";
}
function getTechContext(): TechContext {
  return {
    route: route.path,
    userAgent: navigator.userAgent,
    appVersion: "",
    screenResolution: window.innerWidth + "x" + window.innerHeight,
    timestamp: new Date().toISOString(),
  };
}
async function onSubmit(event: FormSubmitEvent<Schema>) {
  if (saving.value) return;
  fileError.value = validateFeedbackFiles(files.value) ?? "";
  if (fileError.value) return;
  saving.value = true;
  submitError.value = "";
  try {
    await props.submitFeedback(
      {
        type: event.data.type,
        title: event.data.title,
        description: event.data.description,
        techContext: event.data.includeTechContext ? getTechContext() : null,
      },
      files.value,
    );
    state.title = "";
    state.description = "";
    state.includeTechContext = false;
    files.value = [];
    emit("update:open", false);
  } catch {
    submitError.value =
      "Não foi possível enviar. Seu texto e seus anexos continuam aqui. Tente novamente.";
  } finally {
    saving.value = false;
  }
}
function close() {
  if (!saving.value) emit("update:open", false);
}
</script>

<template>
  <UModal
    :open="open"
    title="Compartilhe seu feedback"
    description="Conte com suas palavras. Os anexos são opcionais."
    :dismissible="!saving"
    :ui="{ content: 'sm:max-w-xl' }"
    @update:open="close"
  >
    <template #body>
      <UForm
        :schema="schema"
        :state="state"
        class="space-y-5"
        @submit="onSubmit"
      >
        <fieldset :disabled="saving" class="min-w-0 space-y-5">
          <UFormField name="type" label="Como podemos ajudar?">
            <USelect v-model="state.type" :items="typeOptions" class="w-full" />
          </UFormField>
          <UFormField name="title" label="Resuma em uma frase" required>
            <UInput
              v-model="state.title"
              :maxlength="200"
              placeholder="Ex.: Não consigo mover um evento na agenda"
              class="w-full"
            />
          </UFormField>
          <UFormField
            name="description"
            label="Conte um pouco mais"
            required
            :hint="state.description.length + '/5000'"
          >
            <UTextarea
              v-model="state.description"
              :maxlength="5000"
              :placeholder="prompts[state.type]"
              :rows="5"
              class="w-full"
            />
          </UFormField>
          <div class="rounded-xl border border-dashed border-default p-4">
            <label for="feedback-files" class="block text-sm font-medium"
              >Material de apoio
              <span class="font-normal text-muted">(opcional)</span></label
            >
            <p
              id="feedback-file-help"
              class="mt-1 text-xs leading-5 text-muted"
            >
              Até 3 arquivos. Máximo de 10 MB por arquivo e 20 MB no total. PNG,
              JPG, WebP, PDF, MP4 ou MOV.
            </p>
            <input
              id="feedback-files"
              type="file"
              :accept="FEEDBACK_ACCEPT"
              multiple
              aria-describedby="feedback-file-help feedback-file-error"
              class="mt-3 block w-full min-w-0 text-xs text-muted file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-elevated file:px-3 file:py-3 file:text-sm file:font-medium file:text-highlighted"
              @change="selectFiles"
            />
            <ul v-if="files.length" class="mt-3 space-y-2">
              <li
                v-for="(file, index) in files"
                :key="index"
                class="flex min-w-0 items-center gap-2 rounded-lg bg-elevated p-2"
              >
                <UIcon name="i-lucide-paperclip" class="shrink-0 text-muted" />
                <span class="min-w-0 flex-1 truncate text-xs"
                  >{{ file.name }}
                  <span class="text-muted"
                    >· {{ formatSize(file.size) }}</span
                  ></span
                >
                <UButton
                  icon="i-lucide-x"
                  :aria-label="'Remover ' + file.name"
                  color="neutral"
                  variant="ghost"
                  :disabled="saving"
                  @click="removeFile(index)"
                />
              </li>
            </ul>
            <p v-if="files.length" class="mt-2 text-xs text-muted">
              {{ formatSize(totalSize) }} de 20 MB utilizados
            </p>
            <p
              v-if="fileError"
              id="feedback-file-error"
              role="alert"
              class="mt-2 text-sm text-error"
            >
              {{ fileError }}
            </p>
          </div>
          <UCheckbox
            v-model="state.includeTechContext"
            label="Incluir informações do dispositivo"
            description="Envia a tela atual, o tamanho da janela e o navegador para ajudar a entender problemas."
          />
        </fieldset>
        <p v-if="submitError" role="alert" class="text-sm text-error">
          {{ submitError }}
        </p>
        <p v-if="saving" role="status" class="text-sm text-muted">
          Enviando seu feedback e os anexos. Aguarde a confirmação.
        </p>
        <div class="flex justify-end gap-2 border-t border-default pt-4">
          <UButton
            label="Voltar"
            variant="ghost"
            color="neutral"
            :disabled="saving"
            @click="close"
          />
          <UButton
            type="submit"
            label="Enviar feedback"
            icon="i-lucide-send"
            :loading="saving"
            :disabled="saving"
          />
        </div>
      </UForm>
    </template>
  </UModal>
</template>
