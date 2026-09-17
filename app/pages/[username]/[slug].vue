<script setup lang="ts">
import type { PublicSchedulingPage } from "~/types/scheduling";

definePageMeta({ layout: false, ssr: true });

const route = useRoute();
const username = route.params.username as string;
const slug = route.params.slug as string;
const apiBase = `/api/profile/${username}/${slug}`;

const { data: page, error } = await useAsyncData<PublicSchedulingPage>(
  `profile-${username}-${slug}`,
  () => $fetch<PublicSchedulingPage>(apiBase),
);

if (error.value || !page.value) {
  throw createError({
    statusCode: 404,
    statusMessage: "Página de agendamento não encontrada",
    fatal: true,
  });
}

const publicPage = computed(() => page.value as PublicSchedulingPage);

useSeoMeta({
  title: publicPage.value.title,
  description: publicPage.value.description ?? "Agende um horário.",
  robots: "noindex",
  ogImage: publicPage.value.coverImageUrl ?? undefined,
});
</script>

<template>
  <AppointmentsPublicBookingFlow :public-page="publicPage" :api-base="apiBase" />
</template>
