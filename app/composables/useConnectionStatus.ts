import { useOnline } from '@vueuse/core'

// Lazily-created singleton: every caller shares the same reactive online
// state and the same "just reconnected" event, instead of each getting its
// own useOnline() instance (which would still work, but reconnect callbacks
// registered by different composables would fire independently/out of order).
// Created on first call (inside a component's setup) rather than at raw
// module-import time, so it never runs during SSR module evaluation.
let isOnlineSingleton: ReturnType<typeof useOnline> | null = null
const reconnectListeners = new Set<() => void>()

export function useConnectionStatus() {
  if (!isOnlineSingleton) {
    isOnlineSingleton = useOnline()
    watch(isOnlineSingleton, (online, wasOnline) => {
      if (online && wasOnline === false) {
        for (const listener of reconnectListeners) listener()
      }
    })
  }

  function onReconnect(callback: () => void): () => void {
    reconnectListeners.add(callback)
    return () => reconnectListeners.delete(callback)
  }

  return { isOnline: isOnlineSingleton, onReconnect }
}
