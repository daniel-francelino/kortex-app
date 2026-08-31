<script setup lang="ts">
definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Visão geral'
})

const {
  dashboard,
  dashboardStatus,
  insights,
  insightsStatus
} = useLifeOS()

const isLoading = computed(() => dashboardStatus.value === 'pending')
const isInsightsLoading = computed(() => insightsStatus.value === 'pending')
const todayFormatted = useState('life-os-today-formatted', () =>
  new Intl.DateTimeFormat('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Fortaleza'
  }).format(new Date())
)
</script>

<template>
  <UDashboardPanel id="life-os">
    <template #header>
      <UDashboardNavbar title="Visão geral" :ui="{ right: 'gap-3' }">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <NotificationsButton />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading skeleton -->
      <DashboardSkeleton v-if="isLoading && !dashboard" />

      <div v-else class="space-y-6 p-4 md:p-6">
        <!-- Greeting -->
        <div>
          <h2 class="text-lg font-semibold text-highlighted">
            Seu dia — {{ todayFormatted }}
          </h2>
          <p class="text-sm text-muted">
            Capturar → Planejar → Executar → Refletir → Aprender
          </p>
        </div>

        <!-- Quick stats -->
        <div v-if="dashboard" class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-calendar-check" class="size-5 shrink-0 text-success" />
              <div>
                <p class="text-lg font-bold leading-tight">
                  {{ dashboard.habits.completedCount }}/{{ dashboard.habits.totalCount }}
                </p>
                <p class="text-xs text-muted">
                  Hábitos
                </p>
              </div>
            </div>
          </UCard>
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-check-square" class="size-5 shrink-0 text-primary" />
              <div>
                <p class="text-lg font-bold leading-tight">
                  {{ dashboard.tasks.pendingCount }}
                </p>
                <p class="text-xs text-muted">
                  Tarefas pendentes
                </p>
              </div>
            </div>
          </UCard>
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="flex items-center gap-3">
              <UIcon name="i-lucide-calendar" class="size-5 shrink-0 text-info" />
              <div>
                <p class="text-lg font-bold leading-tight">
                  {{ dashboard.events.totalCount }}
                </p>
                <p class="text-xs text-muted">
                  Eventos hoje
                </p>
              </div>
            </div>
          </UCard>
          <UCard :ui="{ body: 'p-3 sm:p-4' }">
            <div class="flex items-center gap-3">
              <UIcon
                :name="dashboard.journal.exists ? 'i-lucide-book-open-check' : 'i-lucide-book-open'"
                class="size-5 shrink-0"
                :class="dashboard.journal.exists ? 'text-success' : 'text-warning'"
              />
              <div>
                <p class="text-lg font-bold leading-tight">
                  {{ dashboard.journal.exists ? '✓' : '—' }}
                </p>
                <p class="text-xs text-muted">
                  Diário
                </p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Main cards grid -->
        <div v-if="dashboard" class="grid gap-4 md:grid-cols-2">
          <DashboardTodayHabits
            :habits="dashboard.habits.items"
            :completed-count="dashboard.habits.completedCount"
            :total-count="dashboard.habits.totalCount"
          />
          <DashboardTodayEvents
            :events="dashboard.events.items"
            :total-count="dashboard.events.totalCount"
          />
        </div>

        <!-- Insights section -->
        <div>
          <h3 class="mb-4 text-base font-semibold text-highlighted">
            Insights de produtividade
          </h3>

          <div v-if="isInsightsLoading && !insights" class="grid gap-4 md:grid-cols-2">
            <USkeleton v-for="i in 4" :key="i" class="h-44 w-full rounded-lg" />
          </div>

          <DashboardInsights
            v-else-if="insights"
            :insights="insights"
          />
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
