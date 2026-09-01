<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'
import type { Identity } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { identities, identitiesStatus, createIdentity, updateIdentity, archiveIdentity } = useHabits()

const formSchema = z.object({
  name: z.string().min(1, 'Nome é obrigatório').max(200),
  description: z.string().max(500).optional()
})

type FormSchema = z.output<typeof formSchema>

const FORM_ID = 'identity-manager-form'

const formOpen = ref(false)
const submitting = ref(false)
const archivingId = ref<string | null>(null)
const editingIdentity = ref<Identity | null>(null)

const formState = reactive<Partial<FormSchema>>({
  name: '',
  description: ''
})

const sortedIdentities = computed(() => {
  return [...(identities.value ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
})

const headerDescription = computed(() => 'Crie identidades para conectar hábitos à pessoa que você quer se tornar.')

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
}

async function onSubmit(event: FormSubmitEvent<FormSchema>) {
  if (submitting.value) return
  submitting.value = true

  try {
    const payload = {
      name: event.data.name,
      description: event.data.description?.trim() ? event.data.description.trim() : undefined
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
  <UModal
    :open="props.open"
    scrollable
    title="Identidades"
    :description="headerDescription"
    :ui="{
      overlay: 'z-[220] bg-elevated/80',
      content: 'z-[230] w-[calc(100vw-2rem)] max-w-5xl overflow-visible'
    }"
    @update:open="emit('update:open', $event)"
  >
    <template #body>
      <div class="space-y-6">
        <section class="space-y-4">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <UButton
              icon="i-lucide-plus"
              label="Nova identidade"
              @click="openCreateForm"
            />
          </div>

          <template v-if="identitiesStatus === 'pending'">
            <div class="grid gap-3 md:grid-cols-2">
              <UCard v-for="item in 4" :key="item">
                <div class="space-y-3">
                  <USkeleton class="h-5 w-2/3" />
                  <USkeleton class="h-4 w-full" />
                  <USkeleton class="h-4 w-1/2" />
                </div>
              </UCard>
            </div>
          </template>

          <template v-else-if="sortedIdentities.length > 0">
            <div class="grid gap-3 md:grid-cols-2">
              <UCard
                v-for="identity in sortedIdentities"
                :key="identity.id"
                class="rounded-3xl"
              >
                <div class="flex h-full flex-col gap-4">
                  <div class="space-y-2">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-base font-semibold text-highlighted break-words">
                          {{ identity.name }}
                        </p>
                        <p class="mt-1 text-sm leading-6 text-muted break-words">
                          {{ identity.description || 'Sem descrição.' }}
                        </p>
                      </div>

                      <UBadge color="neutral" variant="subtle" size="sm">
                        {{ formatDisplay(identity.createdAt, 'dd/MM/yyyy') }}
                      </UBadge>
                    </div>
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
            <div class="flex flex-col items-center gap-4 py-10 text-center">
              <UIcon name="i-lucide-user-round-search" class="size-12 text-dimmed" />
              <div class="space-y-2">
                <p class="text-base font-semibold text-highlighted">
                  Nenhuma identidade criada ainda
                </p>
                <p class="max-w-md text-sm text-muted">
                  Comece criando uma identidade que represente o tipo de pessoa que seus hábitos devem reforçar.
                </p>
              </div>
              <UButton icon="i-lucide-plus" label="Criar primeira identidade" @click="openCreateForm" />
            </div>
          </UCard>
        </section>
      </div>
    </template>

    <template #footer>
      <div class="flex justify-end">
        <UButton
          icon="i-lucide-x"
          label="Fechar"
          color="neutral"
          variant="subtle"
          @click="emit('update:open', false)"
        />
      </div>
    </template>
  </UModal>

  <UModal
    :open="formOpen"
    title="Identidade"
    :description="editingIdentity ? 'Ajuste os dados da identidade.' : 'Crie uma nova identidade.'"
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

        <UFormField label="Descrição" name="description">
          <UTextarea
            v-model="formState.description"
            placeholder="Descreva a identidade de forma clara e útil."
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
          :label="editingIdentity ? 'Salvar alterações' : 'Criar identidade'"
          type="submit"
          :form="FORM_ID"
          :loading="submitting"
          :disabled="submitting"
        />
      </div>
    </template>
  </UModal>
</template>
