import type { PendingMutationAction, PendingMutationEntity } from './useMutationQueue'

export interface OptimisticActionOptions<T> {
  /** Mutate local state immediately, before the request resolves. */
  apply: () => void
  /** Revert local state back to what it was before `apply()`, called on failure. */
  rollback: () => void
  /** The real network request. */
  request: () => Promise<T>
  /** Reconcile local state with the server's response (ids, timestamps, ...). */
  reconcile?: (result: T) => void
  /** Shown in an error toast if the request fails. */
  errorMessage: string
  /** Skip the error toast (e.g. background/silent syncs that log instead). */
  silent?: boolean
  /**
   * Declarative description of the request, used to enqueue this action for
   * later replay when offline (see useMutationQueue). If omitted, the action
   * is not queueable — it will roll back like any other failed request when
   * there's no connection.
   */
  offline?: {
    entity: PendingMutationEntity
    action: PendingMutationAction
    method: 'POST' | 'PUT' | 'DELETE'
    url: string
    body?: unknown
    tempId?: string
    /** Returned as the "success" result while offline, since there is no
     * server response yet — typically the same object apply() just wrote
     * into the local store. */
    optimisticResult: T
  }
}

/** Fetch failures caused by no connectivity, as opposed to the server
 * rejecting the request — worth distinguishing so a real 4xx/5xx still rolls
 * back instead of silently queueing. */
function looksLikeNetworkFailure(err: unknown): boolean {
  if (typeof navigator !== 'undefined' && !navigator.onLine) return true
  const message = err instanceof Error ? err.message : String(err)
  return /fetch failed|network|failed to fetch|ECONNREFUSED/i.test(message)
}

/**
 * Applies a local mutation immediately, fires the matching request in the
 * background, and reconciles or rolls back once it settles. This is what
 * makes note/folder/tag actions feel instant instead of waiting on a round
 * trip before the UI reacts.
 *
 * When offline and the caller provided an `offline` descriptor, the request
 * is enqueued instead of attempted, and the optimistic value is returned as
 * if it had succeeded — the mutation queue (drained by the sync engine once
 * the connection comes back) is what actually reaches the server later.
 */
export function useOptimisticAction() {
  const toast = useToast()
  const { isOnline } = useConnectionStatus()
  const { enqueue } = useMutationQueue()

  async function queueOffline<T>(opts: OptimisticActionOptions<T>): Promise<T | null> {
    if (!opts.offline) return null
    await enqueue({
      entity: opts.offline.entity,
      action: opts.offline.action,
      method: opts.offline.method,
      url: opts.offline.url,
      body: opts.offline.body,
      tempId: opts.offline.tempId
    })
    return opts.offline.optimisticResult
  }

  async function runOptimisticAction<T>(opts: OptimisticActionOptions<T>): Promise<T | null> {
    opts.apply()

    if (!isOnline.value && opts.offline) {
      return queueOffline(opts)
    }

    try {
      const result = await opts.request()
      opts.reconcile?.(result)
      return result
    } catch (err) {
      if (opts.offline && looksLikeNetworkFailure(err)) {
        return queueOffline(opts)
      }

      opts.rollback()
      if (!opts.silent) {
        toast.add({ title: 'Erro', description: opts.errorMessage, color: 'error' })
      } else {
        console.error(`[useOptimisticAction] ${opts.errorMessage}`, err)
      }
      return null
    }
  }

  return { runOptimisticAction }
}
