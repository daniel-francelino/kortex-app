<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Identity } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Identidades'
})

const {
  identities,
  identitiesStatus,
  refreshIdentities,
  createIdentity,
  updateIdentity,
  archiveIdentity
} = useHabits()

const formSchema = z.object({
  name: z.string().min(1, 'Nome e obrigatorio').max(200),
  description: z.string().max(500).optional()
})

type FormSchema = z.output<typeof formSchema>

const FORM_ID = 'identity-page-form'

const formOpen = ref(false)
const submitting = ref(false)
const archivingId = ref<string | null>(null)
const editingIdentity = ref<Identity | null>(null)

const formState = reactive<Partial<FormSchema>>({
  name: '',
  description: ''
})

const sortedIdentities = computed(() =>
  [...(identities.value ?? [])].sort((a, b) =>
    a.name.localeCompare(b.name, 'pt-BR')
  )
)

if (identitiesStatus.value === 'idle') {
  await refreshIdentities()
}

function openCreateForm() {
  editingIdentity.value = null
  formState.name = ''
  formState.description = ''
  formOpen.value = true
}

function openEditForm(identity: Identity) {
  editingIdentity.value = identity
  formState.name = identity.name
  formState.description = identity.description ?? ''
  formOpen.value = true
}

function closeForm() {
  formOpen.value = false
  editingIdentity.value = null
  formState.name = ''
  formState.description = ''
}

async function onSubmit(event: FormSubmitEvent<FormSchema>) {
  if (submitting.value) return
  submitting.value = true

  try {
    const payload = {
      name: event.data.name,
      description: event.data.description?.trim()
        ? event.data.description.trim()
        : undefined
    }

    const result = editingIdentity.value
      ? await updateIdentity(editingIdentity.value.id, {
          name: payload.name,
          description: payload.description ?? null
        })
      : await createIdentity(payload)

    if (result) {
      closeForm()
    }
  } finally {
    submitting.value = false
  }
}

async function onArchive(identity: Identity) {
  archivingId.value = identity.id

  try {
    await archiveIdentity(identity.id, identity.name)
  } finally {
    archivingId.value = null
  }
}
</script>

<template>
  <UDashboardPanel id="habits-identity">
    <template #header>
      <UDashboardNavbar title="Identidades">
        <template #leading>
          <AppSidebarCollapse />
        </template>

        <template #right>
          <NotificationsButton />
          <UButton
            to="/app/habits"
            icon="i-lucide-arrow-left"
            label="Voltar"
            color="neutral"
            variant="subtle"
            class="hidden sm:inline-flex"
          />
          <UButton
            icon="i-lucide-plus"
            label="Nova identidade"
            @click="openCreateForm"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 p-4 md:p-6">
        <template v-if="identitiesStatus === 'pending'">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <UCard v-for="item in 6" :key="item" class="rounded-3xl">
              <div class="space-y-3">
                <USkeleton class="h-5 w-2/3" />
                <USkeleton class="h-4 w-full" />
                <USkeleton class="h-4 w-1/2" />
              </div>
            </UCard>
          </div>
        </template>

        <template v-else-if="sortedIdentities.length > 0">
          <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <UCard
              v-for="identity in sortedIdentities"
              :key="identity.id"
              class="rounded-3xl"
            >
              <div class="flex h-full flex-col gap-4">
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0 space-y-2">
                    <p
                      class="text-base font-semibold text-highlighted break-words"
                    >
                      {{ identity.name }}
                    </p>
                    <p
                      v-if="identity.description"
                      class="text-sm leading-6 text-muted break-words"
                    >
                      {{ identity.description || "-" }}
                    </p>
                  </div>

                  <UBadge
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    class="shrink-0"
                  >
                    {{
                      formatDisplay(identity.createdAt, 'dd/MM/yyyy')
                    }}
                  </UBadge>
                </div>

                <div class="mt-auto flex flex-wrap gap-2">
                  <UButton
                    icon="i-lucide-pencil"
                    label="Editar"
                    color="neutral"
                    variant="subtle"
                    size="sm"
                    @click="openEditForm(identity)"
                  />

                  <UButton
                    icon="i-lucide-trash-2"
                    label="Excluir"
                    color="error"
                    variant="subtle"
                    size="sm"
                    :loading="archivingId === identity.id"
                    :disabled="archivingId === identity.id"
                    @click="onArchive(identity)"
                  />
                </div>
              </div>
            </UCard>
          </div>
        </template>

        <UCard v-else class="rounded-3xl border-dashed">
          <div class="flex flex-col items-center gap-4 py-14 text-center">
            <UIcon
              name="i-lucide-user-round-search"
              class="size-12 text-dimmed"
            />
            <div class="space-y-2">
              <p class="text-base font-semibold text-highlighted">
                Nenhuma identidade criada ainda
              </p>
              <p class="max-w-md text-sm text-muted">
                Comece criando uma identidade que represente o tipo de pessoa
                que seus habitos devem reforcar.
              </p>
            </div>
            <UButton
              icon="i-lucide-plus"
              label="Criar primeira identidade"
              @click="openCreateForm"
            />
          </div>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>

  <UModal
    :open="formOpen"
    title="Identidade"
    :description="
      editingIdentity
        ? 'Ajuste os dados da identidade.'
        : 'Crie uma nova identidade.'
    "
    :ui="{
      overlay: 'z-[240] bg-elevated/80',
      content: 'z-[250] w-[calc(100vw-2rem)] max-w-xl overflow-visible'
    }"
    @update:open="formOpen = $event"
  >
    <template #body>
      <UForm
        :id="FORM_ID"
        :schema="formSchema"
        :state="formState"
        class="space-y-4"
        @submit="onSubmit"
      >
        <UFormField label="Nome" name="name">
          <UInput
            v-model="formState.name"
            placeholder="Ex: Eu sou uma pessoa disciplinada"
            class="w-full"
          />
        </UFormField>

        <UFormField label="Descricao" name="description">
          <UTextarea
            v-model="formState.description"
            placeholder="Descreva a identidade de forma clara e util."
            :rows="4"
            class="w-full"
          />
        </UFormField>
      </UForm>
    </template>

    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          icon="i-lucide-x"
          label="Cancelar"
          color="neutral"
          variant="subtle"
          @click="closeForm"
        />

        <UButton
          icon="i-lucide-check"
          :label="editingIdentity ? 'Salvar alteracoes' : 'Criar identidade'"
          type="submit"
          :form="FORM_ID"
          :loading="submitting"
          :disabled="submitting"
        />
      </div>
    </template>
  </UModal>
</template>
