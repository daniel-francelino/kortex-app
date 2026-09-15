<script setup lang="ts">
import {
  ONBOARDING_STEPS,
  type OnboardingExperienceLevel,
  type OnboardingGuidanceStyle,
  type OnboardingPrimaryGoal,
  type OnboardingStep,
} from "~/types/onboarding";
import { PostHogEvent } from "~/types/analytics";

const { user } = useAuth();
const isMobile = useMediaQuery("(max-width: 1023px)");
const toast = useToast();
const { capture } = usePostHog();
const {
  close,
  completeAndStartFirstHabit,
  continueLater,
  isCompleted,
  load,
  open,
  saveProgress,
  state,
} = useOnboarding();

const isSaving = ref(false);

const profile = reactive<{
  primaryGoal: OnboardingPrimaryGoal | null;
  experienceLevel: OnboardingExperienceLevel | null;
  guidanceStyle: OnboardingGuidanceStyle | null;
}>({
  primaryGoal: null,
  experienceLevel: null,
  guidanceStyle: null,
});

const selectedTimezone = ref("UTC");

const goalOptions = [
  {
    value: "consistency" as const,
    icon: "i-lucide-flame",
    label: "Criar constância",
    description: "Quero manter hábitos simples sem perder ritmo.",
  },
  {
    value: "productivity" as const,
    icon: "i-lucide-zap",
    label: "Organizar rotina",
    description: "Quero estruturar melhor o meu dia.",
  },
  {
    value: "wellbeing" as const,
    icon: "i-lucide-leaf",
    label: "Cuidar de mim",
    description: "Quero melhorar energia, saúde e bem-estar.",
  },
  {
    value: "identity" as const,
    icon: "i-lucide-sparkles",
    label: "Mudar identidade",
    description: "Quero reforçar quem eu quero me tornar.",
  },
];

const experienceOptions = [
  {
    value: "new" as const,
    icon: "i-lucide-sprout",
    label: "Primeira vez",
    description: "Ainda estou começando a organizar meus hábitos.",
  },
  {
    value: "returning" as const,
    icon: "i-lucide-refresh-cw",
    label: "Já tentei antes",
    description: "Preciso voltar a ter consistência.",
  },
  {
    value: "structured" as const,
    icon: "i-lucide-chart-column",
    label: "Já tenho método",
    description: "Quero um sistema melhor para acompanhar.",
  },
];

const guidanceOptions = [
  {
    value: "guided" as const,
    icon: "i-lucide-compass",
    label: "Mais guiado",
    description: "Prefiro passos mais claros e sugeridos.",
  },
  {
    value: "flexible" as const,
    icon: "i-lucide-sliders-horizontal",
    label: "Mais flexível",
    description: "Prefiro ajustar o sistema do meu jeito.",
  },
];

const productTourCards = [
  {
    title: "Hoje",
    icon: "i-lucide-sun",
    description:
      "É a operação diária. Você vê o que precisa fazer e registra a execução.",
  },
  {
    title: "Todos",
    icon: "i-lucide-list-tree",
    description:
      "É a visão completa do sistema de hábitos, com busca, filtros e organização.",
  },
  {
    title: "Revisão",
    icon: "i-lucide-notebook-pen",
    description:
      "É onde você aprende com a semana e ajusta o que precisa melhorar.",
  },
  {
    title: "Insights",
    icon: "i-lucide-bar-chart-3",
    description:
      "É onde o sistema mostra padrões, consistência e sinais de evolução.",
  },
];

// Shared with Settings/Scheduling (docs/timezone/ANALISE_TIMEZONE.md, seção 5)
// instead of a third independent copy of this list-building logic.
const { browserTimezone, options: timezoneOptions } =
  useTimezoneOptions(selectedTimezone);

const currentStep = computed<OnboardingStep>(
  () => state.value.onboarding.currentStep,
);
const currentStepIndex = computed(() =>
  ONBOARDING_STEPS.indexOf(currentStep.value),
);
const isFirstStep = computed(() => currentStepIndex.value <= 0);
const isLastStep = computed(() => currentStep.value === "first_action");
const isOpen = computed({
  get: () => state.value.open,
  set: (value: boolean) => {
    if (!value) close();
  },
});

const canAdvance = computed(() => {
  if (currentStep.value !== "profile") return true;

  return Boolean(
    profile.primaryGoal && profile.experienceLevel && profile.guidanceStyle,
  );
});

const stepPresentation = computed(() => {
  const map: Record<
    OnboardingStep,
    { emoji: string; eyebrow: string; title: string; description: string }
  > = {
    welcome: {
      emoji: "👋",
      eyebrow: "Bora começar",
      title: "Setup rápido, sem enrolação",
      description: "",
    },
    profile: {
      emoji: "🎯",
      eyebrow: "Seu perfil",
      title: "Vamos calibrar isso para o seu momento",
      description: "",
    },
    minimum_setup: {
      emoji: "🌍",
      eyebrow: "Configuração mínima",
      title: "Deixa o básico redondo",
      description:
        "Timezone certo para hábitos, agenda e notificações baterem.",
    },
    product_tour: {
      emoji: "🗺️",
      eyebrow: "Mapa rápido",
      title: "Entenda a lógica em um minuto",
      description: "Criar, executar, revisar e ajustar. Esse é o loop.",
    },
    first_action: {
      emoji: "🚀",
      eyebrow: "Primeira ação",
      title: "Agora é mão na massa",
      description: "A próxima etapa já te leva para criar o primeiro hábito.",
    },
  };

  return map[currentStep.value];
});

// The header (progress badge, title) and footer (Continuar depois/Próximo)
// stay pinned; the step content in between scrolls (the header can also
// scroll on very short screens). Without this, a
// step taller than the viewport (the `profile` step's 9 option cards, on a
// short mobile screen) clipped the footer buttons out of reach — there's no
// close button on this modal by design (see `:close="false"` below), so an
// unreachable footer meant no way out at all.
const modalUi = computed(() => ({
  overlay: "z-[220]",
  content: isMobile.value
    ? "onboarding-flow-modal z-[230] flex min-h-0 flex-col overflow-hidden"
    : "onboarding-flow-modal z-[230] max-w-3xl max-h-[85dvh] flex flex-col overflow-hidden",
  header: "onboarding-flow-header shrink-0",
  body: "min-h-0 flex-1 overflow-y-auto overscroll-contain",
  footer: "onboarding-flow-footer shrink-0",
}));

function selectPrimaryGoal(value: OnboardingPrimaryGoal) {
  profile.primaryGoal = value;
  capture(PostHogEvent.OnboardingProfileOptionSelected, {
    question: "primary_goal",
    value,
  });
}

function selectExperienceLevel(value: OnboardingExperienceLevel) {
  profile.experienceLevel = value;
  capture(PostHogEvent.OnboardingProfileOptionSelected, {
    question: "experience_level",
    value,
  });
}

function selectGuidanceStyle(value: OnboardingGuidanceStyle) {
  profile.guidanceStyle = value;
  capture(PostHogEvent.OnboardingProfileOptionSelected, {
    question: "guidance_style",
    value,
  });
}

function showSaveError() {
  toast.add({
    title: "Erro",
    description: "Não foi possível salvar seu progresso. Tente novamente.",
    color: "error",
  });
}

function hydrateLocalState() {
  profile.primaryGoal = state.value.onboarding.profile.primaryGoal;
  profile.experienceLevel = state.value.onboarding.profile.experienceLevel;
  profile.guidanceStyle = state.value.onboarding.profile.guidanceStyle;
  // `state.value.timezone` can be `null` (never chosen yet — Regra 2) —
  // fall back to the detected browser zone rather than a hardcoded 'UTC',
  // so the very first save (any step, not just the dedicated timezone one)
  // doesn't lock in the wrong value.
  selectedTimezone.value = state.value.timezone || browserTimezone.value;
}

function getNextStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]!;
}

function getPreviousStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step);
  return ONBOARDING_STEPS[Math.max(index - 1, 0)]!;
}

async function persistCurrentStep(
  targetStep: OnboardingStep,
): Promise<boolean> {
  const response = await saveProgress({
    currentStep: targetStep,
    profile: {
      primaryGoal: profile.primaryGoal,
      experienceLevel: profile.experienceLevel,
      guidanceStyle: profile.guidanceStyle,
    },
    status: "in_progress",
    timezone: selectedTimezone.value,
  });

  return Boolean(response);
}

async function onNext() {
  if (isSaving.value) return;

  isSaving.value = true;
  try {
    if (isLastStep.value) {
      const success = await completeAndStartFirstHabit({
        profile: {
          primaryGoal: profile.primaryGoal,
          experienceLevel: profile.experienceLevel,
          guidanceStyle: profile.guidanceStyle,
        },
        timezone: selectedTimezone.value,
      });

      if (!success) {
        showSaveError();
        return;
      }

      capture(PostHogEvent.OnboardingCompleted, {
        primary_goal: profile.primaryGoal,
        experience_level: profile.experienceLevel,
        guidance_style: profile.guidanceStyle,
        timezone: selectedTimezone.value,
      });

      await navigateTo("/app/habits");
      return;
    }

    const fromStep = currentStep.value;
    const nextStep = getNextStep(fromStep);
    const success = await persistCurrentStep(nextStep);

    if (!success) {
      showSaveError();
      return;
    }

    capture(PostHogEvent.OnboardingStepChanged, {
      direction: "next",
      from_step: fromStep,
      to_step: nextStep,
    });
  } finally {
    isSaving.value = false;
  }
}

async function onPrevious() {
  if (isFirstStep.value || isSaving.value) return;

  isSaving.value = true;
  try {
    const fromStep = currentStep.value;
    const previousStep = getPreviousStep(fromStep);
    const success = await persistCurrentStep(previousStep);

    if (!success) {
      showSaveError();
      return;
    }

    capture(PostHogEvent.OnboardingStepChanged, {
      direction: "previous",
      from_step: fromStep,
      to_step: previousStep,
    });
  } finally {
    isSaving.value = false;
  }
}

async function onContinueLater() {
  if (isSaving.value) return;

  isSaving.value = true;
  try {
    const step = currentStep.value;
    const success = await continueLater({
      currentStep: step,
      profile: {
        primaryGoal: profile.primaryGoal,
        experienceLevel: profile.experienceLevel,
        guidanceStyle: profile.guidanceStyle,
      },
      timezone: selectedTimezone.value,
    });

    if (!success) {
      showSaveError();
      return;
    }

    capture(PostHogEvent.OnboardingPaused, { step });
  } finally {
    isSaving.value = false;
  }
}

onMounted(async () => {
  await load();
  hydrateLocalState();

  if (!isCompleted.value) {
    open();
    capture(PostHogEvent.OnboardingOpened, { step: currentStep.value });
  }
});
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :dismissible="false"
    :close="false"
    :fullscreen="isMobile"
    :ui="modalUi"
  >
    <template #header>
      <div
        class="w-full min-w-0 rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent p-3 lg:p-5"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div class="flex min-w-0 items-start gap-3">
            <div
              class="flex size-10 lg:size-14 shrink-0 items-center justify-center rounded-2xl bg-white/10 text-2xl lg:text-3xl shadow-sm ring-1 ring-white/10"
            >
              <span>{{ stepPresentation.emoji }}</span>
            </div>

            <div class="min-w-0 space-y-1">
              <p
                class="text-xs font-semibold uppercase tracking-[0.24em] text-primary"
              >
                {{ stepPresentation.eyebrow }}
              </p>
              <h2 class="text-lg lg:text-2xl font-semibold text-highlighted">
                {{ stepPresentation.title }}
              </h2>
              <p v-if="stepPresentation.description" class="text-sm text-muted">
                {{ stepPresentation.description }}
              </p>
            </div>
          </div>

          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <UBadge color="neutral" variant="subtle" size="lg">
              {{ currentStepIndex + 1 }} / {{ ONBOARDING_STEPS.length }}
            </UBadge>

            <UBadge color="primary" variant="soft" size="lg">
              <span class="mr-1">⚡</span>
              Menos de 2 min
            </UBadge>
          </div>
        </div>
      </div>
    </template>

    <template #body>
      <div v-if="currentStep === 'welcome'" class="space-y-6">
        <div class="rounded-2xl border border-primary/15 bg-primary/5 p-5">
          <div class="space-y-3">
            <p class="text-sm font-medium text-primary">
              {{
                user?.user_metadata?.name
                  ? `Boa, ${String(user.user_metadata.name)}.`
                  : "Boa."
              }}
            </p>
            <h3 class="text-2xl font-semibold text-highlighted">
              Você está a poucos cliques do primeiro hábito
            </h3>
            <p class="text-base text-muted">
              A ideia aqui é simples: entender seu momento, acertar o essencial
              e te jogar direto para a prática.
            </p>
          </div>
        </div>

        <div class="grid gap-3 lg:grid-cols-3">
          <UCard class="border-primary/10 bg-primary/5">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🎯</span>
              <p class="max-lg:text-base text-sm font-medium text-highlighted">
                Perfil
              </p>
            </div>
            <p class="mt-2 max-lg:text-base lg:text-sm text-muted">
              Entender o seu objetivo principal e o nível de orientação ideal.
            </p>
          </UCard>

          <UCard class="border-primary/10 bg-primary/5">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🌍</span>
              <p class="max-lg:text-base text-sm font-medium text-highlighted">
                Configuração mínima
              </p>
            </div>
            <p class="mt-2 max-lg:text-base lg:text-sm text-muted">
              Ajustar timezone para agenda, hábitos e notificações funcionarem
              certo.
            </p>
          </UCard>

          <UCard class="border-primary/10 bg-primary/5">
            <div class="flex items-center gap-3">
              <span class="text-2xl">🚀</span>
              <p class="max-lg:text-base text-sm font-medium text-highlighted">
                Primeira ação
              </p>
            </div>
            <p class="mt-2 max-lg:text-base lg:text-sm text-muted">
              Ir para Hábitos e começar com um fluxo guiado de criação.
            </p>
          </UCard>
        </div>
      </div>

      <div v-else-if="currentStep === 'profile'" class="space-y-6">
        <div class="space-y-2">
          <h3 class="text-2xl font-semibold text-highlighted">
            Entender seu perfil
          </h3>
          <p class="text-sm text-muted">
            São escolhas rápidas para adaptar o produto ao seu momento atual.
          </p>
        </div>

        <div class="space-y-5">
          <div class="space-y-3">
            <p class="text-sm font-medium text-highlighted">
              Qual é o principal objetivo agora?
            </p>
            <div class="grid gap-3 lg:grid-cols-2">
              <button
                v-for="option in goalOptions"
                :key="option.value"
                type="button"
                class="rounded-xl border px-4 max-lg:py-5 lg:py-4 text-left transition"
                :class="
                  profile.primaryGoal === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-default hover:border-primary/60'
                "
                :aria-pressed="profile.primaryGoal === option.value"
                @click="selectPrimaryGoal(option.value)"
              >
                <div class="flex items-center gap-3">
                  <UIcon
                    :name="option.icon"
                    class="size-6 shrink-0 text-primary"
                  />
                  <p class="max-lg:text-base font-medium text-highlighted">
                    {{ option.label }}
                  </p>
                </div>
                <p class="mt-1 max-lg:text-base lg:text-sm text-muted">
                  {{ option.description }}
                </p>
              </button>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm font-medium text-highlighted">
              Como você está chegando no Kortex?
            </p>
            <div class="grid gap-3 lg:grid-cols-3">
              <button
                v-for="option in experienceOptions"
                :key="option.value"
                type="button"
                class="rounded-xl border px-4 max-lg:py-5 lg:py-4 text-left transition"
                :class="
                  profile.experienceLevel === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-default hover:border-primary/60'
                "
                :aria-pressed="profile.experienceLevel === option.value"
                @click="selectExperienceLevel(option.value)"
              >
                <div class="flex items-center gap-3">
                  <UIcon
                    :name="option.icon"
                    class="size-6 shrink-0 text-primary"
                  />
                  <p class="max-lg:text-base font-medium text-highlighted">
                    {{ option.label }}
                  </p>
                </div>
                <p class="mt-1 max-lg:text-base lg:text-sm text-muted">
                  {{ option.description }}
                </p>
              </button>
            </div>
          </div>

          <div class="space-y-3">
            <p class="text-sm font-medium text-highlighted">
              Qual estilo de orientação funciona melhor?
            </p>
            <div class="grid gap-3 lg:grid-cols-2">
              <button
                v-for="option in guidanceOptions"
                :key="option.value"
                type="button"
                class="rounded-xl border px-4 max-lg:py-5 lg:py-4 text-left transition"
                :class="
                  profile.guidanceStyle === option.value
                    ? 'border-primary bg-primary/10'
                    : 'border-default hover:border-primary/60'
                "
                :aria-pressed="profile.guidanceStyle === option.value"
                @click="selectGuidanceStyle(option.value)"
              >
                <div class="flex items-center gap-3">
                  <UIcon
                    :name="option.icon"
                    class="size-6 shrink-0 text-primary"
                  />
                  <p class="max-lg:text-base font-medium text-highlighted">
                    {{ option.label }}
                  </p>
                </div>
                <p class="mt-1 max-lg:text-base lg:text-sm text-muted">
                  {{ option.description }}
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div v-else-if="currentStep === 'minimum_setup'" class="space-y-6">
        <div class="space-y-2">
          <h3 class="text-2xl font-semibold text-highlighted">
            Configuração mínima
          </h3>
          <p class="text-sm text-muted">
            O essencial aqui é o timezone. Ele afeta agenda, hábitos, revisões e
            notificações.
          </p>
        </div>

        <UFormField
          label="Timezone"
          description="Use o fuso que representa a rotina real do usuário."
        >
          <USelectMenu
            v-model="selectedTimezone"
            :items="timezoneOptions"
            value-key="value"
            searchable
            class="w-full"
          />
        </UFormField>

        <UCard>
          <div class="flex items-start gap-3">
            <span class="text-2xl">🕒</span>
            <p class="text-sm text-muted">
              Se quiser, isso pode ser alterado depois em
              <strong>Configurações</strong>.
            </p>
          </div>
        </UCard>
      </div>

      <div v-else-if="currentStep === 'product_tour'" class="space-y-6">
        <div class="space-y-2">
          <h3 class="text-2xl font-semibold text-highlighted">
            Como o produto funciona
          </h3>
          <p class="text-sm text-muted">
            O fluxo é simples: criar, executar, revisar e melhorar com base nos
            sinais da própria rotina.
          </p>
        </div>

        <div class="grid gap-3 lg:grid-cols-2">
          <UCard
            v-for="card in productTourCards"
            :key="card.title"
            class="border-primary/10 bg-primary/5"
          >
            <div class="flex items-center gap-3">
              <UIcon :name="card.icon" class="size-6 shrink-0 text-primary" />
              <p class="max-lg:text-base font-medium text-highlighted">
                {{ card.title }}
              </p>
            </div>
            <p class="mt-3 max-lg:text-base lg:text-sm text-muted">
              {{ card.description }}
            </p>
          </UCard>
        </div>
      </div>

      <div v-else class="space-y-6">
        <div class="space-y-2">
          <h3 class="text-2xl font-semibold text-highlighted">Primeira ação</h3>
          <p class="text-sm text-muted">
            Agora vamos te levar para a criação do primeiro hábito. O fluxo
            seguinte vai te mostrar o botão certo e depois o formulário por
            dentro.
          </p>
        </div>

        <UCard class="border-primary/10 bg-primary/5">
          <div class="space-y-3 text-sm text-muted">
            <div class="flex items-center gap-3">
              <span class="text-xl">1️⃣</span>
              <p>Abrir a tela de Hábitos.</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xl">2️⃣</span>
              <p>Destacar o botão de criação do primeiro hábito.</p>
            </div>
            <div class="flex items-center gap-3">
              <span class="text-xl">3️⃣</span>
              <p>
                Guiar você dentro do formulário para preencher os campos
                principais.
              </p>
            </div>
          </div>
        </UCard>
      </div>
    </template>

    <template #footer>
      <div
        class="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <UButton
          color="neutral"
          variant="ghost"
          label="Continuar depois"
          icon="i-lucide-coffee"
          class="min-h-11 justify-center"
          :size="isMobile ? 'lg' : 'md'"
          :disabled="isSaving"
          @click="onContinueLater"
        />
        <div class="flex items-center justify-end gap-2 max-sm:*:flex-1">
          <UButton
            v-if="!isFirstStep"
            color="neutral"
            variant="subtle"
            label="Anterior"
            class="min-h-11 justify-center"
            :size="isMobile ? 'lg' : 'md'"
            :disabled="isSaving"
            @click="onPrevious"
          />
          <UButton
            :label="isLastStep ? 'Ir para hábitos' : 'Próximo'"
            class="min-h-11 justify-center"
            :disabled="!canAdvance || isSaving"
            :loading="isSaving"
            :size="isMobile ? 'lg' : 'md'"
            @click="onNext"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

<style>
/* Override the app's centered-modal max-height, including its responsive
   utility. Fullscreen dialogs must cover the navigation and include safe areas. */
@media (max-width: 1023px) {
  .onboarding-flow-modal {
    inset: 0;
    box-sizing: border-box;
    width: 100%;
    height: 100dvh;
    max-height: 100dvh;
    padding-top: var(--safe-area-top, 0px);
    padding-right: var(--safe-area-right, 0px);
    padding-bottom: var(--safe-area-bottom, 0px);
    padding-left: var(--safe-area-left, 0px);
  }

  .onboarding-flow-header {
    min-height: 0;
    max-height: 40%;
    overflow-y: auto;
    padding: 0.75rem;
  }

  .onboarding-flow-footer {
    padding: 0.75rem;
  }
}

/* Match the installed iPhone shell's viewport reference; see
   docs/appointments/CORRECAO_VIEWPORT_IPHONE.md. */
@supports (-webkit-touch-callout: none) {
  @media (max-width: 1023px) {
    html.pwa-standalone .onboarding-flow-modal {
      height: 100vh;
      max-height: 100vh;
    }
  }
}
</style>
