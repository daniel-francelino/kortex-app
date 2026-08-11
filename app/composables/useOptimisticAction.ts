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
}

/**
 * Applies a local mutation immediately, fires the matching request in the
 * background, and reconciles or rolls back once it settles. This is what
 * makes note/folder/tag actions feel instant instead of waiting on a round
 * trip before the UI reacts.
 */
export function useOptimisticAction() {
  const toast = useToast()

  async function runOptimisticAction<T>(opts: OptimisticActionOptions<T>): Promise<T | null> {
    opts.apply()
    try {
      const result = await opts.request()
      opts.reconcile?.(result)
      return result
    } catch (err) {
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
