<script setup lang="ts">
import type { PublicProfile } from "~/types/profile";
import { LOCATION_TYPE_META } from "~/types/scheduling";

definePageMeta({ layout: false, ssr: true });

const route = useRoute();
const username = route.params.username as string;

const { data: profile, error } = await useAsyncData<PublicProfile>(
  `profile-${username}`,
  () => $fetch<PublicProfile>(`/api/profile/${username}`),
);

if (error.value || !profile.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Perfil não encontrado",
    fatal: true,
  });
}

const publicProfile = computed(() => profile.value as PublicProfile);

// Diferente das páginas de agendamento (noindex) — o perfil é o único ponto
// do fluxo público que deveria ser indexável, é o objetivo do recurso (a
// pessoa ser encontrada). Ver docs/appointments/PLANO_USERNAME_PERFIL_
// PUBLICO.md §9.
useSeoMeta({
  title: publicProfile.value.name,
  description: publicProfile.value.bio || `Agende um horário com ${publicProfile.value.name}.`,
  ogImage: publicProfile.value.avatarUrl ?? undefined,
});
</script>

<template>
  <div class="min-h-screen bg-elevated/40 px-4 py-12 sm:px-6 sm:py-20">
    <div class="mx-auto w-full max-w-lg">
      <header class="flex flex-col items-center text-center">
        <UAvatar
          :src="publicProfile.avatarUrl ?? undefined"
          :alt="publicProfile.name"
          size="xl"
        />
        <h1 class="mt-4 text-2xl font-semibold tracking-tight text-highlighted">
          {{ publicProfile.name }}
        </h1>
        <p
          v-if="publicProfile.bio"
          class="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted"
        >
          {{ publicProfile.bio }}
        </p>
      </header>

      <div class="mt-8 space-y-3">
        <NuxtLink
          v-for="eventType in publicProfile.eventTypes"
          :key="eventType.slug"
          :to="`/${username}/${eventType.slug}`"
          class="block rounded-2xl border border-default bg-default p-5 shadow-sm transition-colors hover:border-accented hover:bg-elevated/40"
        >
          <div class="flex items-start justify-between gap-3">
            <p class="font-medium text-highlighted">
              {{ eventType.title }}
            </p>
            <UIcon
              v-if="eventType.color"
              name="i-lucide-circle"
              class="mt-1 size-3 shrink-0"
              :style="{ color: eventType.color }"
            />
          </div>
          <p
            v-if="eventType.description"
            class="mt-1.5 line-clamp-2 text-sm text-muted"
          >
            {{ eventType.description }}
          </p>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
            <span class="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1">
              <UIcon name="i-lucide-clock" class="size-3.5" />{{ eventType.durationMinutes }} min
            </span>
            <span class="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1">
              <UIcon :name="LOCATION_TYPE_META[eventType.locationType].icon" class="size-3.5" />{{ LOCATION_TYPE_META[eventType.locationType].label }}
            </span>
            <span
              v-if="eventType.requiresConfirmation"
              class="inline-flex items-center gap-1.5 rounded-full bg-elevated px-2.5 py-1"
            >
              <UIcon name="i-lucide-calendar-check" class="size-3.5" />Requer confirmação
            </span>
          </div>
        </NuxtLink>

        <p
          v-if="publicProfile.eventTypes.length === 0"
          class="rounded-2xl border border-dashed border-default p-6 text-center text-sm text-muted"
        >
          Nenhum evento disponível para agendamento no momento.
        </p>
      </div>

      <footer class="mt-10 flex justify-center">
        <NuxtLink
          to="/"
          aria-label="Kortex — página inicial"
          class="inline-flex rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary"
        >
          <AppLogo size="sm" />
        </NuxtLink>
      </footer>
    </div>
  </div>
</template>
