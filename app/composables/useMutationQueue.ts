import { get, set } from 'idb-keyval'

export type PendingMutationEntity = 'note' | 'folder'
export type PendingMutationAction = 'create' | 'update' | 'delete'

export interface PendingMutation {
  id: string
  entity: PendingMutationEntity
  action: PendingMutationAction
  method: 'POST' | 'PUT' | 'DELETE'
  url: string
  body?: unknown
  /** Present for 'create' mutations — the temp-id the optimistic create used,
   * so the sync engine can tell the UI which placeholder to reconcile. */
  tempId?: string
  createdAt: string
  retryCount: number
}

const QUEUE_KEY = 'kortex-notes-pending-mutations'

// Module-level so every useMutationQueue() caller reads/writes the same queue
// (mirrors the useConnectionStatus singleton pattern) — this is enqueued from
// deep inside useNotes.ts actions and drained by the sync engine elsewhere,
// both need to see the same list.
const pendingMutations = ref<PendingMutation[]>([])
let loadPromise: Promise<void> | null = null

function ensureLoaded(): Promise<void> {
  if (!loadPromise) {
    loadPromise = get<PendingMutation[]>(QUEUE_KEY).then((stored) => {
      if (stored) pendingMutations.value = stored
    })
  }
  return loadPromise
}

async function persist(): Promise<void> {
  await set(QUEUE_KEY, pendingMutations.value)
}

export function useMutationQueue() {
  void ensureLoaded()

  async function enqueue(mutation: Omit<PendingMutation, 'id' | 'createdAt' | 'retryCount'>): Promise<PendingMutation> {
    await ensureLoaded()

    // The target was itself created offline and hasn't synced yet — there is
    // no real id to PUT/DELETE against server-side. Fold the change into the
    // still-pending create instead of queueing a request that can only fail.
    if (mutation.tempId) {
      const pendingCreateIndex = pendingMutations.value.findIndex(
        m => m.action === 'create' && m.tempId === mutation.tempId
      )
      if (pendingCreateIndex !== -1) {
        const pendingCreate = pendingMutations.value[pendingCreateIndex] as PendingMutation

        if (mutation.action === 'delete') {
          // Never synced in the first place — cancel the create, nothing to tell the server.
          pendingMutations.value = pendingMutations.value.filter((_, i) => i !== pendingCreateIndex)
          await persist()
          return pendingCreate
        }

        const merged: PendingMutation = {
          ...pendingCreate,
          body: { ...(pendingCreate.body as Record<string, unknown> ?? {}), ...(mutation.body as Record<string, unknown> ?? {}) }
        }
        pendingMutations.value = pendingMutations.value.map((m, i) => i === pendingCreateIndex ? merged : m)
        await persist()
        return merged
      }
    }

    // Coalesce consecutive updates to the same already-synced entity — only
    // the final state needs to reach the server, not every intermediate edit.
    if (mutation.action === 'update') {
      const existingIndex = pendingMutations.value.findIndex(
        m => m.action === 'update' && m.entity === mutation.entity && m.url === mutation.url
      )
      if (existingIndex !== -1) {
        const existing = pendingMutations.value[existingIndex] as PendingMutation
        const merged: PendingMutation = {
          ...existing,
          body: { ...(existing.body as Record<string, unknown> ?? {}), ...(mutation.body as Record<string, unknown> ?? {}) }
        }
        pendingMutations.value = pendingMutations.value.map((m, i) => i === existingIndex ? merged : m)
        await persist()
        return merged
      }
    }

    // A delete cancels out any earlier queued update to the same entity — no
    // point replaying an edit to something that's about to be removed.
    if (mutation.action === 'delete') {
      pendingMutations.value = pendingMutations.value.filter(
        m => !(m.action === 'update' && m.entity === mutation.entity && m.url === mutation.url)
      )
    }

    const entry: PendingMutation = {
      ...mutation,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      retryCount: 0
    }
    pendingMutations.value = [...pendingMutations.value, entry]
    await persist()
    return entry
  }

  async function dequeue(id: string): Promise<void> {
    pendingMutations.value = pendingMutations.value.filter(m => m.id !== id)
    await persist()
  }

  async function markRetry(id: string): Promise<void> {
    pendingMutations.value = pendingMutations.value.map(m =>
      m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m
    )
    await persist()
  }

  const pendingCount = computed(() => pendingMutations.value.length)

  return {
    pendingMutations,
    pendingCount,
    ensureLoaded,
    enqueue,
    dequeue,
    markRetry
  }
}
