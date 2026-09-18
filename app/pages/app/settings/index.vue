<script setup lang="ts">
import * as z from 'zod'
import type { FormSubmitEvent } from '@nuxt/ui'

definePageMeta({
  layout: 'app'
})

useSeoMeta({
  title: 'Configurações'
})

const toast = useToast()
const { fetchUser } = useAuth()
const { state: userPreferencesState, setTimezone: setSharedTimezone } = useUserPreferences()
const requestFetch = useRequestFetch()
const requestHeaders = import.meta.server ? useRequestHeaders(['cookie']) : undefined

type ProfileResponse = {
  id: string
  email: string | null
  name: string
  avatar_url: string
  username: string | null
  bio: string
}

type PreferencesResponse = {
  primary_color: string
  neutral_color: string
  color_mode: 'light' | 'dark'
  timezone: string | null
  timezone_usage: Record<string, number>
}

const profileSchema = z.object({
  name: z.string().min(2, 'Deve ter pelo menos 2 caracteres'),
  email: z.string().email('Email inválido'),
  avatar_url: z.string().optional(),
  // Formato/disponibilidade são checados ao vivo (usernameCheck abaixo) e de
  // novo no servidor ao salvar — não duplicamos a regex aqui.
  username: z.string().optional(),
  bio: z.string().max(280, 'Máximo de 280 caracteres').optional()
})

type ProfileSchema = z.output<typeof profileSchema>

const { data: profileData, status } = await useAsyncData(
  'user-profile',
  () => requestFetch<ProfileResponse>('/api/auth/profile', { headers: requestHeaders })
)

const { data: preferencesData, status: preferencesStatus } = await useAsyncData(
  'user-settings-preferences',
  () => requestFetch<PreferencesResponse>('/api/settings/preferences', { headers: requestHeaders })
)

const profile = reactive<Partial<ProfileSchema>>({
  name: profileData.value?.name || '',
  email: profileData.value?.email || '',
  avatar_url: profileData.value?.avatar_url || undefined,
  username: profileData.value?.username || '',
  bio: profileData.value?.bio || ''
})

// Guarda o username já salvo (separado de `profile.username`, que muda a
// cada tecla digitada) — usado para não checar disponibilidade contra o
// próprio valor atual e para o aviso de "isso vai trocar seu link" só
// aparecer quando o campo de fato mudou.
const savedUsername = ref(profileData.value?.username || '')

watch(profileData, (newData) => {
  if (newData) {
    profile.name = newData.name
    profile.email = newData.email || ''
    profile.avatar_url = newData.avatar_url || undefined
    profile.username = newData.username || ''
    profile.bio = newData.bio || ''
    savedUsername.value = newData.username || ''
  }
})

const selectedTimezone = ref(preferencesData.value?.timezone || userPreferencesState.value.timezone)
const { browserTimezone, options: timezoneOptions } = useTimezoneOptions(selectedTimezone)

watch(preferencesData, (newData) => {
  if (!newData)
    return

  // `newData.timezone` can be `null` for an account that hasn't gone
  // through the Regra 2 auto-fill yet — fall back to the shared state's
  // (already-resolved) value rather than showing a null selection.
  selectedTimezone.value = newData.timezone || userPreferencesState.value.timezone
}, { immediate: true })

const isSaving = ref(false)
const isSavingTimezone = ref(false)

// ─── Username: checagem de disponibilidade ao vivo ──────────────────────────
type UsernameCheckState = { status: 'idle' | 'checking' | 'available' | 'unavailable', reason?: string }
const usernameCheck = ref<UsernameCheckState>({ status: 'idle' })

const USERNAME_CHECK_REASONS: Record<string, string> = {
  format: 'Use só letras minúsculas, números e hífen (sem hífens repetidos)',
  reserved: 'Este username não está disponível',
  taken: 'Este username já está em uso'
}

const runUsernameCheck = useDebounceFn(async (value: string) => {
  const normalized = value.trim().toLowerCase()
  if (!normalized || normalized === savedUsername.value) {
    usernameCheck.value = { status: 'idle' }
    return
  }
  usernameCheck.value = { status: 'checking' }
  try {
    const result = await $fetch<{ available: boolean, reason?: string }>('/api/auth/username/check', {
      query: { value: normalized }
    })
    usernameCheck.value = result.available
      ? { status: 'available' }
      : { status: 'unavailable', reason: USERNAME_CHECK_REASONS[result.reason ?? 'taken'] }
  } catch {
    usernameCheck.value = { status: 'idle' }
  }
}, 400)

watch(() => profile.username, (value) => {
  void runUsernameCheck(value ?? '')
})

async function onSubmit(_event: FormSubmitEvent<ProfileSchema>) {
  if (isSaving.value) return
  if (usernameCheck.value.status === 'unavailable') return
  isSaving.value = true

  try {
    await $fetch('/api/auth/profile', {
      method: 'PUT',
      body: {
        name: profile.name,
        avatar_url: profile.avatar_url || '',
        username: (profile.username ?? '').trim().toLowerCase(),
        bio: profile.bio ?? ''
      }
    })

    savedUsername.value = (profile.username ?? '').trim().toLowerCase()

    await fetchUser()

    toast.add({
      title: 'Perfil atualizado',
      description: 'Suas informações foram salvas com sucesso.',
      color: 'success'
    })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, statusMessage?: string }
    const message = err?.data?.statusMessage || err?.statusMessage || 'Não foi possível salvar o perfil'
    toast.add({ title: 'Erro', description: message, color: 'error' })
  } finally {
    isSaving.value = false
  }
}

async function saveTimezonePreference() {
  if (isSavingTimezone.value)
    return

  isSavingTimezone.value = true

  try {
    // Routed through the shared composable — not a direct $fetch — so the
    // singleton `state` other components read (Dashboard, this picker's own
    // ordering) updates immediately instead of going stale until next
    // reload, and the usage-count bump (seção 7) happens in one place.
    await setSharedTimezone(selectedTimezone.value)

    if (preferencesData.value) {
      preferencesData.value = {
        ...preferencesData.value,
        timezone: selectedTimezone.value,
        timezone_usage: userPreferencesState.value.timezoneUsage
      }
    }

    toast.add({
      title: 'Timezone atualizada',
      description: 'O fuso horário da sua conta foi salvo.',
      color: 'success'
    })
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, statusMessage?: string }
    const message = err?.data?.statusMessage || err?.statusMessage || 'Não foi possível salvar o fuso horário'
    toast.add({ title: 'Erro', description: message, color: 'error' })
  } finally {
    isSavingTimezone.value = false
  }
}

function useBrowserTimezone() {
  selectedTimezone.value = browserTimezone.value
  void saveTimezonePreference()
}

const fileRef = ref<HTMLInputElement>()
const avatarPreviewUrl = ref<string | null>(null)
const avatarUploading = ref(false)

// While uploading, show the local (session-only) preview; once it resolves,
// profile.avatar_url holds the real, persistable URL and the preview is
// revoked — a blob: URL must never be the value actually saved (see
// onSubmit), since it stops resolving the moment this tab/session ends.
const displayAvatarUrl = computed(() => avatarPreviewUrl.value ?? profile.avatar_url)

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value)
  avatarPreviewUrl.value = URL.createObjectURL(file)
  avatarUploading.value = true

  try {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'image')

    const uploaded = await $fetch<{ url: string }>('/api/editor/uploads', {
      method: 'POST',
      body: form
    })

    profile.avatar_url = uploaded.url
  } catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, statusMessage?: string }
    const message = err?.data?.statusMessage || err?.statusMessage || 'Não foi possível enviar a imagem'
    toast.add({ title: 'Erro', description: message, color: 'error' })
  } finally {
    if (avatarPreviewUrl.value) {
      URL.revokeObjectURL(avatarPreviewUrl.value)
      avatarPreviewUrl.value = null
    }
    avatarUploading.value = false
  }
}

onBeforeUnmount(() => {
  if (avatarPreviewUrl.value) URL.revokeObjectURL(avatarPreviewUrl.value)
})

function onFileClick() {
  fileRef.value?.click()
}
</script>

<template>
  <UForm
    id="settings"
    :schema="profileSchema"
    :state="profile"
    @submit="onSubmit"
  >
    <UPageCard
      title="Perfil"
      description="Essas informações podem aparecer para outras pessoas."
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        form="settings"
        label="Salvar alterações"
        color="neutral"
        type="submit"
        :loading="isSaving"
        :disabled="isSaving || usernameCheck.status === 'unavailable'"
        class="w-fit lg:ms-auto"
      />
    </UPageCard>

    <div v-if="status === 'pending'" class="space-y-4">
      <USkeleton class="h-14 w-full" />
      <USkeleton class="h-14 w-full" />
      <USkeleton class="h-14 w-full" />
      <USkeleton class="h-14 w-full" />
    </div>

    <UPageCard
      v-else
      variant="subtle"
    >
      <UFormField
        name="name"
        label="Nome"
        description="Usado em comunicações e no seu perfil."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.name"
          autocomplete="off"
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="email"
        label="Email"
        description="Usado para entrar e receber atualizações."
        required
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput
          v-model="profile.email"
          type="email"
          autocomplete="off"
          disabled
        />
      </UFormField>
      <USeparator />
      <UFormField
        name="avatar_url"
        label="Avatar"
        description="JPG, GIF ou PNG. Máx. 1MB."
        class="flex max-sm:flex-col justify-between sm:items-center gap-4"
      >
        <div class="flex flex-wrap items-center gap-3">
          <UAvatar
            :src="displayAvatarUrl"
            :alt="profile.name"
            size="lg"
          />
          <UButton
            label="Escolher"
            color="neutral"
            :loading="avatarUploading"
            :disabled="avatarUploading"
            @click="onFileClick"
          />
          <input
            ref="fileRef"
            type="file"
            class="hidden"
            accept=".jpg, .jpeg, .png, .gif"
            @change="onFileChange"
          >
        </div>
      </UFormField>
      <USeparator />
      <UFormField
        name="username"
        label="Username"
        class="flex max-sm:flex-col justify-between items-start gap-4"
        :ui="{ container: 'w-full sm:w-80 sm:shrink-0' }"
      >
        <div class="w-full min-w-0 space-y-1.5">
          <UInput
            v-model="profile.username"
            autocomplete="off"
            placeholder="michaelnorris"
            class="w-full"
            :ui="{ base: 'ps-24 min-h-11 text-base sm:min-h-0 sm:text-sm' }"
          >
            <template #leading>
              <span class="text-sm text-dimmed">kortex.app/</span>
            </template>
            <template #trailing>
              <UIcon
                v-if="usernameCheck.status === 'checking'"
                name="i-lucide-loader-2"
                class="size-4 animate-spin text-dimmed"
              />
              <UIcon
                v-else-if="usernameCheck.status === 'available'"
                name="i-lucide-check"
                class="size-4 text-success"
              />
              <UIcon
                v-else-if="usernameCheck.status === 'unavailable'"
                name="i-lucide-x"
                class="size-4 text-error"
              />
            </template>
          </UInput>
          <p v-if="usernameCheck.status === 'unavailable'" class="text-xs text-error">
            {{ usernameCheck.reason }}
          </p>
          <p v-else-if="usernameCheck.status === 'available'" class="text-xs text-success">
            Disponível
          </p>
          <p
            v-if="savedUsername && profile.username !== savedUsername"
            class="text-xs text-warning"
          >
            Trocar seu username quebra links já compartilhados com o endereço atual.
          </p>
        </div>
      </UFormField>
      <USeparator />
      <UFormField
        name="bio"
        label="Bio"
        description="Aparece no topo da sua página pública. Até 280 caracteres."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UTextarea
          v-model="profile.bio"
          :rows="3"
          :maxlength="280"
          autocomplete="off"
          class="w-full max-w-xs"
        />
      </UFormField>
    </UPageCard>
  </UForm>

  <UPageCard
    title="Regional"
    description="Defina o fuso horário usado para agenda, hábitos e notificações."
    variant="subtle"
    class="mt-6"
  >
    <div v-if="preferencesStatus === 'pending'" class="space-y-3">
      <USkeleton class="h-11 w-full" />
      <USkeleton class="h-9 w-40" />
    </div>

    <template v-else>
      <UFormField
        name="timezone"
        label="Timezone"
        description="Usada para organizar lembretes, agenda diária e futuras automações."
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="w-full space-y-3">
          <USelectMenu
            v-model="selectedTimezone"
            :items="timezoneOptions"
            value-key="value"
            class="w-full"
          />

          <div class="flex flex-wrap gap-2">
            <UButton
              label="Salvar timezone"
              color="neutral"
              :loading="isSavingTimezone"
              :disabled="isSavingTimezone"
              @click="saveTimezonePreference"
            />
            <UButton
              label="Usar timezone do dispositivo"
              variant="outline"
              color="neutral"
              :disabled="isSavingTimezone || selectedTimezone === browserTimezone"
              @click="useBrowserTimezone"
            />
          </div>
        </div>
      </UFormField>
    </template>
  </UPageCard>
</template>
