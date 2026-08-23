import type { JournalEntry, JournalPinMode } from '~/types/journal'

// Module-level singleton state shared across every consumer
// (journal/index.vue, TodayEditor.vue, EntryDetailModal.vue).
// The unlocked flags deliberately live only in memory: refreshing the page,
// restoring the tab, or reopening the browser must require the PIN again.
const enabled = ref(false)
const mode = ref<JournalPinMode | null>(null)
const statusLoaded = ref(false)
const unlockedModule = ref(false)
const unlockedEntryDates = reactive(new Set<string>())

export function useJournalLock() {
  const toast = useToast()

  async function refreshStatus() {
    try {
      const result = await $fetch<{ enabled: boolean, mode: JournalPinMode | null }>('/api/journal/lock/status')
      enabled.value = result.enabled
      mode.value = result.mode
    } finally {
      statusLoaded.value = true
    }
  }

  const isModuleLocked = computed(() =>
    enabled.value && mode.value === 'module' && !unlockedModule.value
  )

  function isEntryLocked(entry: Pick<JournalEntry, 'entryDate' | 'locked'> | null | undefined): boolean {
    if (!entry) return false
    if (!enabled.value || mode.value !== 'entries') return false
    return entry.locked && !unlockedEntryDates.has(entry.entryDate)
  }

  async function verifyPin(pin: string, entryDate?: string): Promise<{ valid: boolean, lockedUntil?: string | null }> {
    const result = await $fetch<{ valid: boolean, lockedUntil?: string | null }>('/api/journal/lock/verify', {
      method: 'POST',
      body: { pin }
    })

    if (result.valid) {
      if (entryDate) {
        unlockedEntryDates.add(entryDate)
      } else {
        unlockedModule.value = true
      }
    }

    return result
  }

  async function setupPin(pin: string, newMode: JournalPinMode): Promise<boolean> {
    try {
      await $fetch('/api/journal/lock/setup', { method: 'POST', body: { pin, mode: newMode } })
      enabled.value = true
      mode.value = newMode
      toast.add({ title: 'PIN configurado', description: 'O bloqueio do Diário foi ativado.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar o PIN.', color: 'error' })
      return false
    }
  }

  async function disablePin(): Promise<boolean> {
    try {
      await $fetch('/api/journal/lock', { method: 'DELETE' })
      enabled.value = false
      mode.value = null
      unlockedModule.value = false
      unlockedEntryDates.clear()
      toast.add({ title: 'PIN desativado', description: 'O bloqueio do Diário foi removido.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível desativar o PIN.', color: 'error' })
      return false
    }
  }

  async function toggleEntryLock(entryDate: string, locked: boolean): Promise<JournalEntry | null> {
    try {
      const result = await $fetch<JournalEntry>(`/api/journal/entries/${entryDate}/lock`, {
        method: 'PATCH',
        body: { locked }
      })
      // Locking an entry the user is currently viewing should not immediately
      // hide it under them; a fresh page load will ask for the PIN again.
      if (locked) {
        unlockedEntryDates.add(entryDate)
      }
      return result
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o bloqueio da entrada.', color: 'error' })
      return null
    }
  }

  return {
    enabled,
    mode,
    statusLoaded,
    refreshStatus,
    isModuleLocked,
    isEntryLocked,
    verifyPin,
    setupPin,
    disablePin,
    toggleEntryLock
  }
}
