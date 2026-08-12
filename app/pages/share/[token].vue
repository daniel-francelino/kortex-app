<script setup lang="ts">
import { NOTE_TYPE_META, type PublicNote } from '~/types/notes'

definePageMeta({ layout: false, ssr: true })

const route = useRoute()
const token = route.params.token as string

const { data: note, error } = await useAsyncData<PublicNote>(`share-${token}`, () =>
  $fetch<PublicNote>(`/api/share/${token}`)
)

if (error.value || !note.value) {
  throw createError({ statusCode: 404, statusMessage: 'Nota não encontrada', fatal: true })
}

// Narrows away null for the rest of the component — the guard above already
// made "note not found" a 404, so from here on the note is guaranteed present.
const publicNote = computed(() => note.value as PublicNote)
const typeMeta = computed(() => NOTE_TYPE_META[publicNote.value.type])

useSeoMeta({
  title: publicNote.value.title || 'Nota compartilhada',
  ogTitle: publicNote.value.title || 'Nota compartilhada',
  description: 'Nota pública compartilhada via Kortex.',
  robots: 'noindex'
})

function onWikilinkClick(noteId: string) {
  const targetToken = publicNote.value.publicWikilinkTargets[noteId]
  if (targetToken) navigateTo(`/share/${targetToken}`)
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-default">
    <div class="flex-1 w-full max-w-3xl mx-auto px-6 py-16">
      <header class="mb-10">
        <div class="flex items-center gap-3 mb-4">
          <span
            v-if="publicNote.icon"
            class="text-4xl leading-none"
          >{{ publicNote.icon }}</span>
          <UIcon
            v-else
            :name="typeMeta.icon"
            class="size-9 shrink-0"
            :class="`text-${typeMeta.color}`"
          />
          <UBadge
            :color="typeMeta.color"
            variant="subtle"
            size="sm"
          >
            {{ typeMeta.label }}
          </UBadge>
        </div>
        <h1 class="text-3xl font-bold text-highlighted leading-tight">
          {{ publicNote.title || 'Sem título' }}
        </h1>
        <p class="text-sm text-muted mt-2">
          Atualizado em {{ new Date(publicNote.updatedAt).toLocaleDateString('pt-BR', { year: 'numeric', month: 'long', day: 'numeric' }) }}
        </p>
      </header>

      <EditorNotionStyleEditor
        :model-value="publicNote.content ?? ''"
        surface="plain"
        :editable="false"
        enable-wikilinks
        @wikilink-click="onWikilinkClick"
      />
    </div>

    <footer class="border-t border-default py-6">
      <div class="max-w-3xl mx-auto px-6 flex items-center justify-between gap-4">
        <span class="text-sm text-muted">Feito com <span class="font-semibold text-highlighted">Kortex</span></span>
        <UButton
          to="/signup"
          color="primary"
          variant="subtle"
          size="sm"
        >
          Criar minha conta
        </UButton>
      </div>
    </footer>
  </div>
</template>
