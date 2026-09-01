<script setup lang="ts">
import {
  ONBOARDING_STEPS,
  type OnboardingExperienceLevel,
  type OnboardingGuidanceStyle,
  type OnboardingPrimaryGoal,
  type OnboardingStep
} from '~/types/onboarding'

const { user } = useAuth()
const {
  close,
  completeAndStartFirstHabit,
  continueLater,
  isCompleted,
  load,
  open,
  saveProgress,
  state
} = useOnboarding()

const profile = reactive<{
  primaryGoal: OnboardingPrimaryGoal | null
  experienceLevel: OnboardingExperienceLevel | null
  guidanceStyle: OnboardingGuidanceStyle | null
}>({
  primaryGoal: null,
  experienceLevel: null,
  guidanceStyle: null
})

const selectedTimezone = ref('UTC')

const goalOptions = [
  {
    value: 'consistency' as const,
    emoji: '🔥',
    icon: 'i-lucide-flame',
    label: 'Criar constância',
    description: 'Quero manter hábitos simples sem perder ritmo.'
  },
  {
    value: 'productivity' as const,
    emoji: '⚡',
    icon: 'i-lucide-zap',
    label: 'Organizar rotina',
    description: 'Quero estruturar melhor o meu dia.'
  },
  {
    value: 'wellbeing' as const,
    emoji: '🧘',
    icon: 'i-lucide-leaf',
    label: 'Cuidar de mim',
    description: 'Quero melhorar energia, saúde e bem-estar.'
  },
  {
    value: 'identity' as const,
    emoji: '🧠',
    icon: 'i-lucide-sparkles',
    label: 'Mudar identidade',
    description: 'Quero reforçar quem eu quero me tornar.'
  }
]

const experienceOptions = [
  {
    value: 'new' as const,
    emoji: '🌱',
    icon: 'i-lucide-sprout',
    label: 'Primeira vez',
    description: 'Ainda estou começando a organizar meus hábitos.'
  },
  {
    value: 'returning' as const,
    emoji: '🔁',
    icon: 'i-lucide-refresh-cw',
    label: 'Já tentei antes',
    description: 'Preciso voltar a ter consistência.'
  },
  {
    value: 'structured' as const,
    emoji: '📊',
    icon: 'i-lucide-chart-column',
    label: 'Já tenho método',
    description: 'Quero um sistema melhor para acompanhar.'
  }
]

const guidanceOptions = [
  {
    value: 'guided' as const,
    emoji: '🧭',
    icon: 'i-lucide-compass',
    label: 'Mais guiado',
    description: 'Prefiro passos mais claros e sugeridos.'
  },
  {
    value: 'flexible' as const,
    emoji: '🎛️',
    icon: 'i-lucide-sliders-horizontal',
    label: 'Mais flexível',
    description: 'Prefiro ajustar o sistema do meu jeito.'
  }
]

const productTourCards = [
  {
    title: 'Hoje',
    emoji: '☀️',
    icon: 'i-lucide-sun',
    description: 'É a operação diária. Você vê o que precisa fazer e registra a execução.'
  },
  {
    title: 'Todos',
    emoji: '🗂️',
    icon: 'i-lucide-list-tree',
    description: 'É a visão completa do sistema de hábitos, com busca, filtros e organização.'
  },
  {
    title: 'Revisão',
    emoji: '📝',
    icon: 'i-lucide-notebook-pen',
    description: 'É onde você aprende com a semana e ajusta o que precisa melhorar.'
  },
  {
    title: 'Insights',
    emoji: '📈',
    icon: 'i-lucide-bar-chart-3',
    description: 'É onde o sistema mostra padrões, consistência e sinais de evolução.'
  }
]

// Shared with Settings/Scheduling (docs/timezone/ANALISE_TIMEZONE.md, seção 5)
// instead of a third independent copy of this list-building logic.
const { browserTimezone, options: timezoneOptions } = useTimezoneOptions(selectedTimezone)

const currentStep = computed<OnboardingStep>(() => state.value.onboarding.currentStep)
const currentStepIndex = computed(() => ONBOARDING_STEPS.indexOf(currentStep.value))
const isFirstStep = computed(() => currentStepIndex.value <= 0)
const isLastStep = computed(() => currentStep.value === 'first_action')
const isOpen = computed({
  get: () => state.value.open,
  set: (value: boolean) => {
    if (!value)
      close()
  }
})

const canAdvance = computed(() => {
  if (currentStep.value !== 'profile')
    return true

  return Boolean(
    profile.primaryGoal
    && profile.experienceLevel
    && profile.guidanceStyle
  )
})

const stepPresentation = computed(() => {
  const map: Record<OnboardingStep, { emoji: string, eyebrow: string, title: string, description: string }> = {
    welcome: {
      emoji: '👋',
      eyebrow: 'Bora começar',
      title: 'Setup rápido, sem enrolação',
      description: 'Menos de 2 minutos para te colocar em movimento.'
    },
    profile: {
      emoji: '🎯',
      eyebrow: 'Seu perfil',
      title: 'Vamos calibrar isso para o seu momento',
      description: 'Três escolhas rápidas e o produto já fica mais alinhado.'
    },
    minimum_setup: {
      emoji: '🌍',
      eyebrow: 'Configuração mínima',
      title: 'Deixa o básico redondo',
      description: 'Timezone certo para hábitos, agenda e notificações baterem.'
    },
    product_tour: {
      emoji: '🗺️',
      eyebrow: 'Mapa rápido',
      title: 'Entenda a lógica em um minuto',
      description: 'Criar, executar, revisar e ajustar. Esse é o loop.'
    },
    first_action: {
      emoji: '🚀',
      eyebrow: 'Primeira ação',
      title: 'Agora é mão na massa',
      description: 'A próxima etapa já te leva para criar o primeiro hábito.'
    }
  }

  return map[currentStep.value]
})

function hydrateLocalState() {
  profile.primaryGoal = state.value.onboarding.profile.primaryGoal
  profile.experienceLevel = state.value.onboarding.profile.experienceLevel
  profile.guidanceStyle = state.value.onboarding.profile.guidanceStyle
  // `state.value.timezone` can be `null` (never chosen yet — Regra 2) —
  // fall back to the detected browser zone rather than a hardcoded 'UTC',
  // so the very first save (any step, not just the dedicated timezone one)
  // doesn't lock in the wrong value.
  selectedTimezone.value = state.value.timezone || browserTimezone.value
}

function getNextStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step)
  return ONBOARDING_STEPS[Math.min(index + 1, ONBOARDING_STEPS.length - 1)]!
}

function getPreviousStep(step: OnboardingStep): OnboardingStep {
  const index = ONBOARDING_STEPS.indexOf(step)
  return ONBOARDING_STEPS[Math.max(index - 1, 0)]!
}

async function persistCurrentStep(targetStep: OnboardingStep) {
  await saveProgress({
    currentStep: targetStep,
    profile: {
      primaryGoal: profile.primaryGoal,
      experienceLevel: profile.experienceLevel,
      guidanceStyle: profile.guidanceStyle
    },
    status: 'in_progress',
    timezone: selectedTimezone.value
  })
}

async function onNext() {
  if (isLastStep.value) {
    await completeAndStartFirstHabit({
      profile: {
        primaryGoal: profile.primaryGoal,
        experienceLevel: profile.experienceLevel,
        guidanceStyle: profile.guidanceStyle
      },
      timezone: selectedTimezone.value
    })

    await navigateTo('/app/habits')
    return
  }

  const nextStep = getNextStep(currentStep.value)
  await persistCurrentStep(nextStep)
}

async function onPrevious() {
  if (isFirstStep.value)
    return

  const previousStep = getPreviousStep(currentStep.value)
  await persistCurrentStep(previousStep)
}

async function onContinueLater() {
  await continueLater({
    currentStep: currentStep.value,
    profile: {
      primaryGoal: profile.primaryGoal,
      experienceLevel: profile.experienceLevel,
      guidanceStyle: profile.guidanceStyle
    },
    timezone: selectedTimezone.value
  })
}

onMounted(async () => {
  await load()
  hydrateLocalState()

  if (!isCompleted.value)
    open()
})
</script>

<template>
  <UModal
    v-model:open="isOpen"
    :prevent-close="true"
    :ui="{ content: 'max-w-3xl' }"
  >
    <template #content>
      <UCard class="overflow-hidden border-default/70 bg-elevated/70">
        <template #header>
          <div class="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/20 via-primary/8 to-transparent p-5">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div class="flex items-start gap-4">
                <div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-3xl shadow-sm ring-1 ring-white/10">
                  <span>{{ stepPresentation.emoji }}</span>
                </div>

                <div class="space-y-1">
                  <p class="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                    {{ stepPresentation.eyebrow }}
                  </p>
                  <h2 class="text-2xl font-semibold text-highlighted">
                    {{ stepPresentation.title }}
                  </h2>
                  <p class="text-sm text-muted">
                    {{ stepPresentation.description }}
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
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

        <div v-if="currentStep === 'welcome'" class="space-y-6">
          <div class="rounded-2xl border border-primary/15 bg-primary/5 p-5">
            <div class="space-y-3">
              <p class="text-sm font-medium text-primary">
                {{ user?.user_metadata?.name ? `Boa, ${String(user.user_metadata.name)}.` : 'Boa.' }}
              </p>
              <h3 class="text-2xl font-semibold text-highlighted">
                Você está a poucos cliques do primeiro hábito
              </h3>
              <p class="text-base text-muted">
                A ideia aqui é simples: entender seu momento, acertar o essencial e te jogar direto para a prática.
              </p>
            </div>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <UCard class="border-primary/10 bg-primary/5">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🎯</span>
                <p class="text-sm font-medium text-highlighted">
                  Perfil
                </p>
              </div>
              <p class="mt-2 text-sm text-muted">
                Entender o seu objetivo principal e o nível de orientação ideal.
              </p>
            </UCard>

            <UCard class="border-primary/10 bg-primary/5">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🌍</span>
                <p class="text-sm font-medium text-highlighted">
                  Configuração mínima
                </p>
              </div>
              <p class="mt-2 text-sm text-muted">
                Ajustar timezone para agenda, hábitos e notificações funcionarem certo.
              </p>
            </UCard>

            <UCard class="border-primary/10 bg-primary/5">
              <div class="flex items-center gap-3">
                <span class="text-2xl">🚀</span>
                <p class="text-sm font-medium text-highlighted">
                  Primeira ação
                </p>
              </div>
              <p class="mt-2 text-sm text-muted">
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
              <div class="grid gap-3 md:grid-cols-2">
                <button
                  v-for="option in goalOptions"
                  :key="option.value"
                  type="button"
                  class="rounded-xl border px-4 py-4 text-left transition"
                  :class="profile.primaryGoal === option.value ? 'border-primary bg-primary/10' : 'border-default hover:border-primary/60'"
                  @click="profile.primaryGoal = option.value"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">{{ option.emoji }}</span>
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ option.label }}
                      </p>
                      <UIcon :name="option.icon" class="mt-1 text-base text-primary" />
                    </div>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    {{ option.description }}
                  </p>
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-sm font-medium text-highlighted">
                Como você está chegando no Kortex?
              </p>
              <div class="grid gap-3 md:grid-cols-3">
                <button
                  v-for="option in experienceOptions"
                  :key="option.value"
                  type="button"
                  class="rounded-xl border px-4 py-4 text-left transition"
                  :class="profile.experienceLevel === option.value ? 'border-primary bg-primary/10' : 'border-default hover:border-primary/60'"
                  @click="profile.experienceLevel = option.value"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">{{ option.emoji }}</span>
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ option.label }}
                      </p>
                      <UIcon :name="option.icon" class="mt-1 text-base text-primary" />
                    </div>
                  </div>
                  <p class="mt-1 text-sm text-muted">
                    {{ option.description }}
                  </p>
                </button>
              </div>
            </div>

            <div class="space-y-3">
              <p class="text-sm font-medium text-highlighted">
                Qual estilo de orientação funciona melhor?
              </p>
              <div class="grid gap-3 md:grid-cols-2">
                <button
                  v-for="option in guidanceOptions"
                  :key="option.value"
                  type="button"
                  class="rounded-xl border px-4 py-4 text-left transition"
                  :class="profile.guidanceStyle === option.value ? 'border-primary bg-primary/10' : 'border-default hover:border-primary/60'"
                  @click="profile.guidanceStyle = option.value"
                >
                  <div class="flex items-center gap-3">
                    <span class="text-2xl">{{ option.emoji }}</span>
                    <div>
                      <p class="font-medium text-highlighted">
                        {{ option.label }}
                      </p>
                      <UIcon :name="option.icon" class="mt-1 text-base text-primary" />
                    </div>
                  </div>
                  <p class="mt-1 text-sm text-muted">
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
              O essencial aqui é o timezone. Ele afeta agenda, hábitos, revisões e notificações.
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
                Se quiser, isso pode ser alterado depois em <strong>Configurações</strong>.
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
              O fluxo é simples: criar, executar, revisar e melhorar com base nos sinais da própria rotina.
            </p>
          </div>

          <div class="grid gap-3 md:grid-cols-2">
            <UCard
              v-for="card in productTourCards"
              :key="card.title"
              class="border-primary/10 bg-primary/5"
            >
              <div class="flex items-center gap-3">
                <span class="text-2xl">{{ card.emoji }}</span>
                <div>
                  <p class="font-medium text-highlighted">
                    {{ card.title }}
                  </p>
                  <UIcon :name="card.icon" class="mt-1 text-base text-primary" />
                </div>
              </div>
              <p class="mt-3 text-sm text-muted">
                {{ card.description }}
              </p>
            </UCard>
          </div>
        </div>

        <div v-else class="space-y-6">
          <div class="space-y-2">
            <h3 class="text-2xl font-semibold text-highlighted">
              Primeira ação
            </h3>
            <p class="text-sm text-muted">
              Agora vamos te levar para a criação do primeiro hábito. O fluxo seguinte vai te mostrar o botão certo e depois o formulário por dentro.
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
                <p>Guiar você dentro do formulário para preencher os campos principais.</p>
              </div>
            </div>
          </UCard>
        </div>

        <template #footer>
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <UButton
              color="neutral"
              variant="ghost"
              label="Continuar depois"
              icon="i-lucide-coffee"
              @click="onContinueLater"
            />
            <div class="flex items-center justify-end gap-2">
              <UButton
                v-if="!isFirstStep"
                color="neutral"
                variant="subtle"
                label="Anterior"
                @click="onPrevious"
              />
              <UButton
                :label="isLastStep ? 'Ir para hábitos' : 'Próximo'"
                :disabled="!canAdvance"
                @click="onNext"
              />
            </div>
          </div>
        </template>
      </UCard>
    </template>
  </UModal>
</template>
