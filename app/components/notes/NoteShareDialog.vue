<script setup lang="ts">
import { useClipboard } from '@vueuse/core'
import type { NoteShare, NoteSharePermission, CreateNoteSharePayload, UpdateNoteSharePayload } from '~/types/notes'
import { NoteVisibility } from '~/types/notes'

const props = defineProps<{
  open: boolean
  noteId: string
  visibility: NoteVisibility
  shareToken: string | null
  setVisibility: (noteId: string, visibility: NoteVisibility) => Promise<boolean>
  regenerateShareLink: (noteId: string) => Promise<{ shareToken: string | null } | null>
  fetchShares: (noteId: string) => Promise<NoteShare[]>
  addShare: (noteId: string, payload: CreateNoteSharePayload) => Promise<NoteShare | null>
  updateShare: (noteId: string, shareId: string, payload: UpdateNoteSharePayload) => Promise<NoteShare | null>
  removeShare: (noteId: string, shareId: string) => Promise<boolean>
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const { copy, copied } = useClipboard({ legacy: true })

const visibilityOptions = [
  { value: NoteVisibility.Private, label: 'Privada', icon: 'i-lucide-lock', description: 'Só você vê esta nota.' },
  { value: NoteVisibility.Shared, label: 'Compartilhada', icon: 'i-lucide-users', description: 'Pessoas específicas que você adicionar.' },
  { value: NoteVisibility.Public, label: 'Pública', icon: 'i-lucide-globe', description: 'Qualquer pessoa com o link.' }
]

const shares = ref<NoteShare[]>([])
const sharesLoading = ref(false)
const visibilityUpdating = ref(false)
const regenerating = ref(false)
const newEmail = ref('')
const newPermission = ref<NoteSharePermission>('view')
const addingShare = ref(false)

const shareUrl = computed(() => {
  if (!props.shareToken) return ''
  return `${window.location.origin}/share/${props.shareToken}`
})

watch(() => props.open, (isOpen) => {
  if (isOpen && props.visibility === NoteVisibility.Shared) {
    void loadShares()
  }
})

watch(() => props.visibility, (value) => {
  if (props.open && value === NoteVisibility.Shared && shares.value.length === 0) {
    void loadShares()
  }
})

async function loadShares() {
  sharesLoading.value = true
  shares.value = await props.fetchShares(props.noteId)
  sharesLoading.value = false
}

async function onSelectVisibility(value: NoteVisibility) {
  if (value === props.visibility) return
  visibilityUpdating.value = true
  await props.setVisibility(props.noteId, value)
  visibilityUpdating.value = false
  if (value === NoteVisibility.Shared) void loadShares()
}

async function onRegenerate() {
  regenerating.value = true
  await props.regenerateShareLink(props.noteId)
  regenerating.value = false
}

function onCopyLink() {
  if (shareUrl.value) copy(shareUrl.value)
}

async function onAddShare() {
  const email = newEmail.value.trim()
  if (!email) return
  addingShare.value = true
  const created = await props.addShare(props.noteId, { email, permission: newPermission.value })
  addingShare.value = false
  if (created) {
    shares.value = [...shares.value, created]
    newEmail.value = ''
    newPermission.value = 'view'
  }
}

async function onChangePermission(share: NoteShare, permission: NoteSharePermission) {
  const updated = await props.updateShare(props.noteId, share.id, { permission })
  if (updated) {
    shares.value = shares.value.map(s => s.id === share.id ? updated : s)
  }
}

async function onRemoveShare(share: NoteShare) {
  const ok = await props.removeShare(props.noteId, share.id)
  if (ok) {
    shares.value = shares.value.filter(s => s.id !== share.id)
  }
}
</script>

<template>
  <UModal
    :open="open"
    title="Compartilhar nota"
    @update:open="(value: boolean) => emit('update:open', value)"
  >
    <template #body>
      <div class="space-y-5">
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="option in visibilityOptions"
            :key="option.value"
            type="button"
            class="flex flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-center transition-colors"
            :class="visibility === option.value
              ? 'border-primary bg-primary/10 text-highlighted'
              : 'border-default hover:bg-elevated text-muted'"
            :disabled="visibilityUpdating"
            @click="onSelectVisibility(option.value)"
          >
            <UIcon :name="option.icon" class="size-5" />
            <span class="text-xs font-medium">{{ option.label }}</span>
          </button>
        </div>
        <p class="text-xs text-muted -mt-2">
          {{ visibilityOptions.find(o => o.value === visibility)?.description }}
        </p>

        <div v-if="visibility === NoteVisibility.Public" class="space-y-2">
          <div class="flex items-center gap-2">
            <UInput
              :model-value="shareUrl"
              readonly
              class="flex-1"
              size="sm"
              @focus="($event.target as HTMLInputElement)?.select()"
            />
            <UButton
              :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
              size="sm"
              color="neutral"
              variant="subtle"
              @click="onCopyLink"
            />
          </div>
          <UButton
            icon="i-lucide-refresh-cw"
            size="xs"
            color="neutral"
            variant="ghost"
            :loading="regenerating"
            @click="onRegenerate"
          >
            Gerar novo link
          </UButton>
          <p class="text-xs text-dimmed">
            Gerar um novo link invalida o anterior — quem tiver o link antigo perde o acesso.
          </p>
        </div>

        <div v-else-if="visibility === NoteVisibility.Shared" class="space-y-3">
          <div class="flex items-center gap-2">
            <UInput
              v-model="newEmail"
              type="email"
              placeholder="email@exemplo.com"
              size="sm"
              class="flex-1"
              @keydown.enter="onAddShare"
            />
            <USelect
              v-model="newPermission"
              :items="[{ label: 'Visualizar', value: 'view' }, { label: 'Editar', value: 'edit' }]"
              value-key="value"
              size="sm"
              class="w-32"
            />
            <UButton
              icon="i-lucide-plus"
              size="sm"
              color="primary"
              variant="subtle"
              :loading="addingShare"
              :disabled="!newEmail.trim()"
              @click="onAddShare"
            />
          </div>

          <div v-if="sharesLoading" class="text-xs text-muted">
            Carregando...
          </div>
          <ul v-else-if="shares.length > 0" class="space-y-1.5">
            <li
              v-for="share in shares"
              :key="share.id"
              class="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 hover:bg-elevated"
            >
              <UIcon
                :name="share.status === 'pending' ? 'i-lucide-mail' : 'i-lucide-user'"
                class="size-3.5 text-dimmed shrink-0"
              />
              <span class="flex-1 truncate">{{ share.sharedWithEmail }}</span>
              <UBadge
                v-if="share.status === 'pending'"
                color="neutral"
                variant="subtle"
                size="sm"
              >
                Convite pendente
              </UBadge>
              <USelect
                :model-value="share.permission"
                :items="[{ label: 'Visualizar', value: 'view' }, { label: 'Editar', value: 'edit' }]"
                value-key="value"
                size="sm"
                class="w-28"
                @update:model-value="(value: NoteSharePermission) => onChangePermission(share, value)"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="neutral"
                variant="ghost"
                @click="onRemoveShare(share)"
              />
            </li>
          </ul>
          <p v-else class="text-xs text-dimmed">
            Ninguém tem acesso ainda.
          </p>
        </div>
      </div>
    </template>
  </UModal>
</template>
