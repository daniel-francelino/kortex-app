import { get, set } from 'idb-keyval'

export type PendingMutationEntity = 'note' | 'folder' | 'journal_entry' | 'calendar' | 'event' | 'scheduling_page'
export type PendingMutationAction = 'create' | 'update' | 'delete'

export interface PendingMutation {
  id: string
  entity: PendingMutationEntity
  action: PendingMutationAction
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  url: string
  body?: unknown
  /** Present for 'create' mutations — the temp-id the optimistic create used,
   * so the sync engine can tell the UI which placeholder to reconcile. */
  tempId?: string
  createdAt: string
  retryCount: number
}

// Kept as-is (not renamed to something entity-neutral) even though the queue
// now also carries journal mutations — this is IndexedDB, so changing the key
// would orphan anything a user had genuinely pending offline at deploy time.
const QUEUE_KEY = 'kortex-notes-pending-mutations'

// Module-level so every useMutationQueue() caller reads/writes the same queue
// (mirrors the useConnectionStatus singleton pattern) — this is enqueued from
// deep inside useNotes.ts/useJournal.ts actions and drained by each
// composable's own sync engine, both need to see the same list. Each drain
// loop filters to its own entity types (see drainMutationQueue in either
// composable) so they don't race to replay each other's mutations.
const pendingMutations = ref<PendingMutation[]>([])
let loadPromise: Promise<void> | null = null

function ensureLoaded(): Promise<void> {
  // IndexedDB doesn't exist server-side — nothing to load there, and the
  // offline queue is a client-only concern anyway.
  if (!import.meta.client) return Promise.resolve()
  if (!loadPromise) {
    loadPromise = get<PendingMutation[]>(QUEUE_KEY).then((stored) => {
      if (stored) pendingMutations.value = stored
    })
  }
  return loadPromise
}

async function persist(): Promise<void> {
  if (!import.meta.client) return
  try {
    await set(QUEUE_KEY, pendingMutations.value)
  } catch (err) {
    // Swallowed on purpose: a storage write failure (IndexedDB quota, browser
    // policy) here is not the same thing as the *mutation itself* failing —
    // letting it propagate uncaught used to bubble up through
    // dequeue()/markRetry() into the sync loop's own try/catch, where it got
    // misread as "this mutation's replay failed" and re-queued/retried, even
    // though the request had already succeeded. Logging is what the caller
    // can't do anything about anyway; in-memory state stays correct either
    // way, only the IndexedDB mirror may be stale until the next successful
    // persist() (which happens on every subsequent enqueue/dequeue/markRetry).
    console.error('[useMutationQueue] failed to persist queue to IndexedDB', err)
  }
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
    await ensureLoaded()
    pendingMutations.value = pendingMutations.value.filter(m => m.id !== id)
    await persist()
  }

  async function markRetry(id: string): Promise<void> {
    await ensureLoaded()
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
