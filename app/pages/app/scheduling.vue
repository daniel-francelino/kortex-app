<script setup lang="ts">
import type { SchedulingPage } from '~/types/scheduling'
import { LOCATION_TYPE_META } from '~/types/scheduling'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Agendamento' })

const router = useRouter()
const isMobile = useMediaQuery('(max-width: 1023px)')
const { calendars, calendarsStatus, refreshCalendars } = useAppointments()
const {
  pages,
  pagesStatus,
  refreshPages,
  archiveSchedulingPage,
  regenerateShareToken,
  updateSchedulingPage,
  duplicateSchedulingPage
} = useSchedulingPages()

onMounted(() => {
  if (calendarsStatus.value === 'idle') refreshCalendars()
  if (pagesStatus.value === 'idle') refreshPages()
})

useMobileContextNav().registerMobileContextNav('scheduling', [
  { label: 'Dia', value: 'day', icon: 'i-lucide-square', to: '/app/appointments?view=day' },
  { label: 'Semana', value: 'week', icon: 'i-lucide-columns-3', to: '/app/appointments?view=week' },
  { label: 'Mês', value: 'month', icon: 'i-lucide-grid-3x3', to: '/app/appointments?view=month' },
  { label: 'Link', value: 'scheduling-link', icon: 'i-lucide-calendar-clock' }
], ref('scheduling-link'))

const quickCreateOpen = ref(false)
const toast = useToast()
const duplicatingId = ref<string | null>(null)

function onCreate() {
  quickCreateOpen.value = true
}

function onCreated(pageId: string) {
  router.push(`/app/scheduling/${pageId}`)
}

function onOpenEditor(page: SchedulingPage) {
  router.push(`/app/scheduling/${page.id}`)
}

async function onToggleActive(page: SchedulingPage, value: boolean) {
  await updateSchedulingPage(page.id, { isActive: value })
}

async function onDuplicate(page: SchedulingPage) {
  duplicatingId.value = page.id
  const created = await duplicateSchedulingPage(page.id)
  duplicatingId.value = null
  if (created) router.push(`/app/scheduling/${created.id}`)
}

async function onArchive(page: SchedulingPage) {
  await archiveSchedulingPage(page.id)
}

async function onRegenerateToken(page: SchedulingPage) {
  await regenerateShareToken(page.id)
  await refreshPages()
}

function shareUrl(page: SchedulingPage): string {
  const base = typeof window !== 'undefined' ? window.location.origin : ''
  return `${base}/agendar/${page.shareToken}`
}

async function copyLink(page: SchedulingPage) {
  try {
    await navigator.clipboard.writeText(shareUrl(page))
    toast.add({ title: 'Link copiado!', color: 'success' })
  } catch {
    toast.add({ title: 'Erro', description: 'Não foi possível copiar o link.', color: 'error' })
  }
}

function openPreview(page: SchedulingPage) {
  window.open(shareUrl(page), '_blank')
}
</script>

<template>
  <UDashboardPanel id="scheduling">
    <template #header>
      <UDashboardNavbar title="Agendamento">
        <template #right>
          <UButton v-if="!isMobile" icon="i-lucide-plus" label="Nova página" @click="onCreate" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="mx-auto max-w-3xl space-y-4 p-4">
        <p class="text-sm text-muted">
          Crie um link público onde qualquer pessoa pode marcar um horário com você, sem precisar de conta.
        </p>

        <div v-if="pagesStatus === 'pending'" class="space-y-3">
          <USkeleton v-for="i in 3" :key="i" class="h-24 w-full rounded-xl" />
        </div>

        <UEmpty
          v-else-if="!pages || pages.length === 0"
          icon="i-lucide-calendar-plus"
          title="Nenhuma página de agendamento ainda"
          description="Crie sua primeira página para compartilhar um link de agendamento."
          class="py-16"
          :actions="[{ label: 'Criar a primeira', icon: 'i-lucide-plus', onClick: onCreate }]"
        />

        <div v-else class="space-y-3">
          <UCard
            v-for="page in pages"
            :key="page.id"
            class="cursor-pointer overflow-hidden transition-shadow hover:shadow-md"
            :ui="{ root: 'p-0', body: 'p-0 sm:p-0' }"
            @click="onOpenEditor(page)"
          >
            <div class="flex items-stretch">
              <div class="w-1.5 shrink-0" :style="{ backgroundColor: page.color || 'var(--ui-border)' }" />
              <div class="flex min-w-0 flex-1 items-start justify-between gap-3 p-4">
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <p class="font-medium text-highlighted">
                      {{ page.title }}
                    </p>
                    <UBadge
                      v-if="!page.isActive"
                      color="neutral"
                      variant="subtle"
                      size="sm"
                    >
                      Pausada
                    </UBadge>
                  </div>
                  <div class="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                    <span class="flex items-center gap-1">
                      <UIcon name="i-lucide-clock" class="size-3.5" />
                      {{ page.durationMinutes }} min
                    </span>
                    <span class="flex items-center gap-1">
                      <UIcon :name="LOCATION_TYPE_META[page.locationType].icon" class="size-3.5" />
                      {{ LOCATION_TYPE_META[page.locationType].label }}
                    </span>
                    <span v-if="page.bookingsCount" class="flex items-center gap-1">
                      <UIcon name="i-lucide-users" class="size-3.5" />
                      {{ page.bookingsCount }} {{ page.bookingsCount === 1 ? 'reserva' : 'reservas' }}
                    </span>
                  </div>
                  <div class="mt-2 flex items-center gap-2" @click.stop>
                    <UInput
                      :model-value="shareUrl(page)"
                      readonly
                      size="sm"
                      class="max-w-sm flex-1"
                    />
                    <UTooltip text="Copiar link">
                      <UButton
                        icon="i-lucide-copy"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        @click="copyLink(page)"
                      />
                    </UTooltip>
                    <UTooltip text="Abrir página">
                      <UButton
                        icon="i-lucide-external-link"
                        size="sm"
                        color="neutral"
                        variant="subtle"
                        @click="openPreview(page)"
                      />
                    </UTooltip>
                  </div>
                </div>
                <div class="flex shrink-0 items-center gap-1" @click.stop>
                  <USwitch :model-value="page.isActive" @update:model-value="(v: boolean) => onToggleActive(page, v)" />
                  <UDropdownMenu
                    :items="[
                      [
                        { label: 'Duplicar', icon: 'i-lucide-copy-plus', onSelect: () => onDuplicate(page) },
                        { label: 'Ver reservas', icon: 'i-lucide-list', to: `/app/scheduling-bookings/${page.id}` }
                      ],
                      [
                        { label: 'Regenerar link', icon: 'i-lucide-refresh-cw', onSelect: () => onRegenerateToken(page) }
                      ],
                      [
                        { label: 'Arquivar', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => onArchive(page) }
                      ]
                    ]"
                    :content="{ align: 'end' }"
                  >
                    <UButton
                      icon="i-lucide-ellipsis-vertical"
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      :loading="duplicatingId === page.id"
                    />
                  </UDropdownMenu>
                </div>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <!-- Mobile: floating "new page" button, replaces the navbar action -->
  <UButton
    v-if="isMobile"
    icon="i-lucide-plus"
    size="xl"
    square
    class="fixed z-30 size-14 items-center justify-center rounded-full shadow-lg shadow-black/30"
    :style="{
      right: 'calc(1rem + var(--safe-area-right, 0px))',
      bottom: 'calc(var(--mobile-bottom-nav-height, 4.75rem) + 1rem)'
    }"
    aria-label="Nova página"
    @click="onCreate"
  />

  <AppointmentsSchedulingQuickCreateModal
    :open="quickCreateOpen"
    :calendars="calendars"
    @update:open="quickCreateOpen = $event"
    @created="onCreated"
  />
</template>
