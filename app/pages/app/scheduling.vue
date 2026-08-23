<script setup lang="ts">
import type { SchedulingPage } from '~/types/scheduling'

definePageMeta({ layout: 'app' })

useSeoMeta({ title: 'Agendamento' })

const { calendars, calendarsStatus, refreshCalendars } = useAppointments()
const { pages, pagesStatus, refreshPages, archiveSchedulingPage, regenerateShareToken } = useSchedulingPages()

onMounted(() => {
  if (calendarsStatus.value === 'idle') refreshCalendars()
  if (pagesStatus.value === 'idle') refreshPages()
})

const createModalOpen = ref(false)
const pageToEdit = ref<SchedulingPage | null>(null)
const toast = useToast()

function onCreate() {
  pageToEdit.value = null
  createModalOpen.value = true
}

function onEdit(page: SchedulingPage) {
  pageToEdit.value = page
  createModalOpen.value = true
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
</script>

<template>
  <UDashboardPanel id="scheduling">
    <template #header>
      <UDashboardNavbar title="Agendamento">
        <template #right>
          <UButton icon="i-lucide-plus" label="Nova página" @click="onCreate" />
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

        <div v-else-if="!pages || pages.length === 0" class="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-default py-16">
          <UIcon name="i-lucide-calendar-plus" class="size-10 text-dimmed" />
          <p class="text-sm text-muted">
            Nenhuma página de agendamento ainda.
          </p>
          <UButton label="Criar a primeira" icon="i-lucide-plus" @click="onCreate" />
        </div>

        <div v-else class="space-y-3">
          <UCard v-for="page in pages" :key="page.id">
            <div class="flex items-start justify-between gap-3">
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
                    Inativa
                  </UBadge>
                </div>
                <p class="mt-0.5 text-sm text-muted">
                  {{ page.durationMinutes }} min
                </p>
                <div class="mt-2 flex items-center gap-2">
                  <UInput
                    :model-value="shareUrl(page)"
                    readonly
                    size="sm"
                    class="max-w-sm flex-1"
                  />
                  <UButton
                    icon="i-lucide-copy"
                    size="sm"
                    color="neutral"
                    variant="subtle"
                    @click="copyLink(page)"
                  />
                </div>
              </div>
              <UDropdownMenu
                :items="[
                  [
                    { label: 'Editar', icon: 'i-lucide-pencil', onSelect: () => onEdit(page) },
                    { label: 'Ver reservas', icon: 'i-lucide-list', to: `/app/scheduling-bookings/${page.id}` }
                  ],
                  [
                    { label: 'Regenerar link', icon: 'i-lucide-refresh-cw', onSelect: () => onRegenerateToken(page) }
                  ],
                  [
                    { label: 'Arquivar', icon: 'i-lucide-archive', color: 'error' as const, onSelect: () => onArchive(page) }
                  ]
                ]"
              >
                <UButton
                  icon="i-lucide-ellipsis-vertical"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                />
              </UDropdownMenu>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>

  <AppointmentsSchedulingPageCreateModal
    :open="createModalOpen"
    :calendars="calendars"
    :page="pageToEdit"
    @update:open="createModalOpen = $event"
    @saved="refreshPages"
  />
</template>
