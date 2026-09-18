<script setup lang="ts">
import type { PublicSchedulingPage } from "~/types/scheduling";

definePageMeta({ layout: false, ssr: true });

const route = useRoute();
const username = route.params.username as string;
const slug = route.params.slug as string;
const apiBase = `/api/profile/${username}/${slug}`;

// See agendar/[token].vue for why this is lazy + non-blocking.
const { data: page, status } = useAsyncData<PublicSchedulingPage>(
  `profile-${username}-${slug}`,
  () => $fetch<PublicSchedulingPage>(apiBase),
  { lazy: true },
);

watchEffect(() => {
  if (status.value === "error" || (status.value === "success" && !page.value)) {
    showError(
      createError({
        statusCode: 404,
        statusMessage: "Página de agendamento não encontrada",
        fatal: true,
      }),
    );
  }
});

const publicPage = computed(() => page.value);

useSeoMeta({
  title: () => publicPage.value?.title ?? "Agendar horário",
  description: () => publicPage.value?.description ?? "Agende um horário.",
  robots: "noindex",
  ogImage: () => publicPage.value?.coverImageUrl ?? undefined,
});
</script>

<template>
  <AppointmentsPublicBookingSkeleton v-if="!publicPage" />
  <AppointmentsPublicBookingFlow
    v-else
    :public-page="publicPage"
    :api-base="apiBase"
  />
</template>
