<script setup lang="ts">
import type { PublicSchedulingPage } from "~/types/scheduling";

definePageMeta({ layout: false, ssr: true });

const route = useRoute();
const token = route.params.token as string;

// `lazy: true` so this mounts immediately instead of blocking behind Nuxt's
// default (blank) Suspense fallback — AppointmentsPublicBookingSkeleton fills
// the gap below while `page` is still null. SSR is unaffected: the fetch
// still runs on the server either way, this only changes client-side
// navigation (e.g. from the [username] profile page).
const { data: page, status } = useAsyncData<PublicSchedulingPage>(
  `schedule-${token}`,
  () => $fetch<PublicSchedulingPage>(`/api/schedule/${token}`),
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
    :api-base="`/api/schedule/${token}`"
  />
</template>
