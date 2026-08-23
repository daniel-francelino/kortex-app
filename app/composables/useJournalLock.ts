import type { JournalEntry, JournalPinMode } from '~/types/journal'

const MODULE_UNLOCK_KEY = 'journal-pin-unlocked'
const ENTRY_UNLOCK_KEY = 'journal-pin-unlocked-entries'

function readModuleUnlocked(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return sessionStorage.getItem(MODULE_UNLOCK_KEY) === '1'
  } catch {
    return false
  }
}

function readUnlockedEntries(): Set<string> {
  if (typeof window === 'undefined') return new Set()
  try {
    const raw = sessionStorage.getItem(ENTRY_UNLOCK_KEY)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

// Module-level singleton state — the unlocked-this-session flag must be
// shared across every consumer (journal/index.vue, TodayEditor.vue,
// EntryDetailModal.vue), same reasoning DashboardQuickJournal-style widgets
// don't apply here: unlike useJournal()'s per-call entity store, this is
// pure client-side UI state (no SSR data-leak risk), so a singleton is safe
// and is exactly what keeps "unlocked in one place" visible everywhere else.
const enabled = ref(false)
const mode = ref<JournalPinMode | null>(null)
const statusLoaded = ref(false)
const unlockedModule = ref(readModuleUnlocked())
const unlockedEntryDates = reactive(readUnlockedEntries())

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
        persistEntries()
      } else {
        unlockedModule.value = true
        persistModule()
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
      unlockedModule.value = true
      unlockedEntryDates.clear()
      persistModule()
      persistEntries()
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
      // Locking an entry the user is currently viewing shouldn't immediately
      // re-hide it out from under them — only unlocking-then-relocking later
      // (a fresh visit) should prompt the PIN again.
      if (locked) {
        unlockedEntryDates.add(entryDate)
        persistEntries()
      }
      return result
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o bloqueio da entrada.', color: 'error' })
      return null
    }
  }

  function persistModule() {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(MODULE_UNLOCK_KEY, unlockedModule.value ? '1' : '0')
    } catch {
      // Best-effort — private browsing / storage disabled just means the
      // PIN prompt reappears next reload, not a functional failure.
    }
  }

  function persistEntries() {
    if (typeof window === 'undefined') return
    try {
      sessionStorage.setItem(ENTRY_UNLOCK_KEY, JSON.stringify([...unlockedEntryDates]))
    } catch {
      // Same best-effort reasoning as persistModule().
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
