<script setup lang="ts">
import type { DashboardJournal } from '~/types/life-os'

defineProps<{
  journal: DashboardJournal
}>()
</script>

<template>
  <UCard>
    <template #header>
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-book-open" class="size-5 text-primary" />
          <h3 class="text-sm font-semibold">
            Diário de Bordo
          </h3>
        </div>
        <UBadge
          :color="journal.exists ? 'success' : 'warning'"
          variant="subtle"
          size="sm"
        >
          {{ journal.exists ? 'Escrito' : 'Pendente' }}
        </UBadge>
      </div>
    </template>

    <div v-if="journal.locked || journal.encrypted" class="flex flex-col items-center gap-2 py-4 text-center">
      <UIcon name="i-lucide-lock" class="size-6 text-dimmed" />
      <p class="text-sm text-muted">
        {{ journal.encrypted ? 'Diário criptografado ponta-a-ponta' : 'Diário protegido por PIN' }}
      </p>
    </div>

    <div v-else-if="journal.exists" class="space-y-2">
      <p v-if="journal.title" class="text-sm font-medium">
        {{ journal.title }}
      </p>
      <p class="text-sm text-muted">
        {{ journal.contentPreview }}{{ journal.contentPreview && journal.contentPreview.length >= 120 ? '…' : '' }}
      </p>
    </div>

    <div v-else class="flex flex-col items-center gap-3 py-4 text-center">
      <UIcon name="i-lucide-pen-line" class="size-8 text-dimmed" />
      <div>
        <p class="text-sm font-medium text-highlighted">
          Ainda não escreveu hoje
        </p>
        <p class="text-xs text-muted">
          Reserve um momento para registrar como foi o seu dia
        </p>
      </div>
      <NuxtLink to="/app/journal">
        <UButton size="sm" color="primary" variant="soft">
          Escrever agora
        </UButton>
      </NuxtLink>
    </div>

    <template v-if="journal.exists" #footer>
      <NuxtLink
        to="/app/journal"
        class="text-xs text-primary hover:underline"
      >
        Abrir diário de bordo →
      </NuxtLink>
    </template>
  </UCard>
</template>
