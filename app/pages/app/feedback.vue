<script setup lang="ts">
import type { Feedback, CreateFeedbackPayload } from "~/types/feedback";
import {
  FeedbackType,
  FeedbackStatus,
  feedbackTypeLabels,
  feedbackStatusLabels,
  feedbackTypeIcons,
} from "~/types/feedback";

definePageMeta({ layout: "app" });
useSeoMeta({ title: "Meus feedbacks" });
const {
  listData,
  listFetchStatus,
  listError,
  listPage,
  listPageSize,
  listType,
  listStatus,
  listSearch,
  createFeedback,
  fetchFeedback,
  deleteFeedback,
  addResponse,
  refreshList,
} = useFeedback();
const createModalOpen = ref(false);
const detailOpen = ref(false);
const selectedFeedback = ref<Feedback | null>(null);
const initialType = ref(FeedbackType.Suggestion);
const userFeedbacks = computed(() => listData.value?.data ?? []);
const userTotal = computed(() => listData.value?.total ?? 0);
const filtered = computed(
  () => !!(listType.value || listStatus.value || listSearch.value),
);
const typeOptions = [
  { label: "Todos os tipos", value: "__all__" },
  ...Object.values(FeedbackType).map((value) => ({
    label: feedbackTypeLabels[value],
    value,
  })),
];
const statusOptions = [
  { label: "Todos os status", value: "__all__" },
  ...Object.values(FeedbackStatus).map((value) => ({
    label: feedbackStatusLabels[value],
    value,
  })),
];
const typeModel = computed({
  get: () => listType.value || "__all__",
  set: (value) => {
    listType.value = value === "__all__" ? "" : value;
  },
});
const statusModel = computed({
  get: () => listStatus.value || "__all__",
  set: (value) => {
    listStatus.value = value === "__all__" ? "" : value;
  },
});
const shortcuts = [
  {
    type: FeedbackType.Bug,
    title: "Algo não funcionou",
    description: "Conte o que aconteceu e onde.",
  },
  {
    type: FeedbackType.Suggestion,
    title: "Tenho uma ideia",
    description: "O que faria diferença na sua rotina?",
  },
  {
    type: FeedbackType.Improvement,
    title: "Pode ficar melhor",
    description: "Ajude a aprimorar um recurso.",
  },
  {
    type: FeedbackType.Praise,
    title: "Gostei de algo",
    description: "Compartilhe o que está ajudando.",
  },
];
function openCreate(type = FeedbackType.Suggestion) {
  initialType.value = type;
  createModalOpen.value = true;
}
async function submitFeedback(payload: CreateFeedbackPayload, files: File[]) {
  await createFeedback(payload, files);
}
function selectFeedback(feedback: Feedback) {
  selectedFeedback.value = feedback;
  detailOpen.value = true;
}
async function removeFeedback(id: string) {
  await deleteFeedback(id);
  detailOpen.value = false;
  selectedFeedback.value = null;
}
async function respond(id: string, content: string) {
  await addResponse(id, { content });
  selectedFeedback.value = await fetchFeedback(id);
}
function clearFilters() {
  listSearch.value = "";
  listType.value = "";
  listStatus.value = "";
}
</script>

<template>
  <UDashboardPanel id="feedback">
    <template #header>
      <UDashboardNavbar title="Feedback">
        <template #leading><AppSidebarCollapse /></template>
        <template #right><NotificationsButton /></template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto w-full max-w-5xl space-y-8 p-1 sm:p-4">
        <section
          class="rounded-2xl border border-primary/20 bg-primary/5 p-5 sm:p-8"
        >
          <p
            class="text-xs font-semibold uppercase tracking-widest text-primary"
          >
            Construído com você
          </p>
          <h1 class="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
            Sua experiência melhora o Kortex.
          </h1>
          <p class="mt-3 max-w-2xl text-sm leading-7 text-muted">
            Uma ideia, um problema ou um detalhe que faz falta. Conte para nós e
            acompanhe as respostas por aqui.
          </p>
          <div class="mt-6 grid gap-3 sm:grid-cols-2">
            <button
              v-for="shortcut in shortcuts"
              :key="shortcut.type"
              type="button"
              class="flex items-start gap-3 rounded-xl border border-default bg-default p-4 text-left transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
              @click="openCreate(shortcut.type)"
            >
              <UIcon
                :name="feedbackTypeIcons[shortcut.type]"
                class="mt-0.5 size-5 shrink-0 text-primary"
              />
              <span
                ><span class="block text-sm font-medium">{{
                  shortcut.title
                }}</span
                ><span class="mt-1 block text-xs leading-5 text-muted">{{
                  shortcut.description
                }}</span></span
              >
              <UIcon
                name="i-lucide-arrow-up-right"
                class="ml-auto size-4 shrink-0 text-dimmed"
              />
            </button>
          </div>
          <p class="mt-4 flex items-center gap-2 text-xs leading-5 text-muted">
            <UIcon name="i-lucide-paperclip" class="shrink-0" />Você pode
            incluir imagens, vídeos curtos ou PDF para explicar melhor.
          </p>
        </section>
        <section class="space-y-5" aria-labelledby="my-feedbacks">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="my-feedbacks" class="text-lg font-semibold">
                Meus feedbacks
              </h2>
              <p class="mt-1 text-sm text-muted">
                Somente seus envios e as respostas que você recebeu.
              </p>
            </div>
            <UButton
              label="Novo feedback"
              icon="i-lucide-plus"
              class="min-h-11"
              @click="openCreate()"
            />
          </div>
          <div class="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <UInput
              v-model="listSearch"
              icon="i-lucide-search"
              placeholder="Buscar nos meus feedbacks"
              aria-label="Buscar nos meus feedbacks"
              class="w-full"
            />
            <USelect
              v-model="typeModel"
              :items="typeOptions"
              aria-label="Filtrar por tipo"
              class="w-full sm:w-44"
            />
            <USelect
              v-model="statusModel"
              :items="statusOptions"
              aria-label="Filtrar por status"
              class="w-full sm:w-44"
            />
          </div>
          <div
            v-if="listError"
            role="alert"
            class="rounded-xl border border-error/30 p-6 text-center"
          >
            <p>Não foi possível carregar seus feedbacks.</p>
            <UButton
              label="Tentar novamente"
              variant="outline"
              class="mt-3"
              @click="refreshList()"
            />
          </div>
          <div
            v-else-if="listFetchStatus !== 'pending' && !userFeedbacks.length"
            class="rounded-2xl border border-dashed border-default px-5 py-12 text-center"
          >
            <UIcon
              name="i-lucide-messages-square"
              class="size-8 text-primary"
            />
            <h3 class="mt-3 font-medium">
              {{
                filtered
                  ? "Nenhum envio com esses filtros"
                  : "Sua primeira contribuição começa aqui"
              }}
            </h3>
            <p class="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
              {{
                filtered
                  ? "Tente buscar outro termo ou limpar os filtros."
                  : "Não precisa escrever muito. Um exemplo do que aconteceu ou do que você gostaria já ajuda."
              }}
            </p>
            <UButton
              v-if="filtered"
              label="Limpar filtros"
              variant="outline"
              class="mt-5"
              @click="clearFilters"
            />
            <UButton
              v-else
              label="Enviar meu primeiro feedback"
              class="mt-5"
              @click="openCreate()"
            />
          </div>
          <FeedbackList
            v-else
            :feedbacks="userFeedbacks"
            :loading="listFetchStatus === 'pending'"
            :total="userTotal"
            :page="listPage"
            :page-size="listPageSize"
            @select="selectFeedback"
            @update:page="listPage = $event"
          />
        </section>
      </div>
    </template>
  </UDashboardPanel>
  <FeedbackCreateModal
    v-model:open="createModalOpen"
    :initial-type="initialType"
    :submit-feedback="submitFeedback"
  />
  <FeedbackDetailSlideover
    v-model:open="detailOpen"
    :feedback="selectedFeedback"
    :submit-response="respond"
    @delete="removeFeedback"
  />
</template>
