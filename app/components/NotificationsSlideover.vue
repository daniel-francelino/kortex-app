<script setup lang="ts">
import { formatTimeAgo } from '@vueuse/core'

import { useNotifications, type AppNotification } from '~/composables/useNotifications'

import { computed } from 'vue'

const { isNotificationsSlideoverOpen } = useDashboard()

const toast = useToast()
const notifications = useNotifications() as {
  items: Ref<AppNotification[]>
  pending: Ref<boolean>
  unreadCount: ComputedRef<number>
  refresh: () => Promise<void>
  markRead: (id: number) => Promise<void>
  markAllRead: () => Promise<void>
  ensureReady: () => Promise<void>
}
const pending = notifications.pending
const notificationsList = computed(() => pending.value ? [] : notifications.items.value)

watch(isNotificationsSlideoverOpen, async (open) => {
  if (!open)
    return
  try {
    await notifications.ensureReady()
  } catch (error: unknown) {
    const apiError = error as { data?: { statusMessage?: string }, statusMessage?: string }
    const message = apiError?.data?.statusMessage || apiError?.statusMessage || 'Não foi possível carregar as notificações'
    toast.add({ title: 'Erro', description: message, color: 'error' })
  }
})

async function markAllRead() {
  try {
    await notifications.markAllRead()
  } catch (error: unknown) {
    const apiError = error as { data?: { statusMessage?: string }, statusMessage?: string }
    const message = apiError?.data?.statusMessage || apiError?.statusMessage || 'Não foi possível marcar como lidas'
    toast.add({ title: 'Erro', description: message, color: 'error' })
  }
}

async function onOpen(notificationId: number) {
  try {
    await notifications.markRead(notificationId)
  } catch {
    // ignore
  }
}
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="Notificações"
  >
    <template #header>
      <div class="flex items-center justify-between gap-2 w-full">
        <span class="text-sm font-medium">Notificações</span>
        <UButton
          label="Marcar todas como lidas"
          color="neutral"
          variant="ghost"
          size="xs"
          @click="markAllRead"
        />
      </div>
    </template>

    <template #body>
      <div v-if="pending" class="space-y-3">
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
      </div>
      <template v-else>
        <NuxtLink
          v-for="notification in notificationsList"
          :key="notification.id"
          :to="notification.linkPath || '/app'"
          class="px-3 py-2.5 rounded-md hover:bg-elevated/50 flex items-center gap-3 relative -mx-3 first:-mt-3 last:-mb-3"
          @click="onOpen(notification.id)"
        >
          <UChip
            color="error"
            :show="!!notification.unread"
            inset
          >
            <template v-if="notification.type === 'system'">
              <UAvatar
                src="/icon.png"
                alt="Kortex"
                size="md"
              />
            </template>
            <template v-else>
              <UAvatar
                v-bind="notification.sender.avatar"
                :alt="notification.sender.name"
                size="md"
              />
            </template>
          </UChip>
          <div class="text-sm flex-1">
            <p class="flex items-center justify-between">
              <span class="text-highlighted font-medium">
                <template v-if="notification.type === 'system'">Kortex</template>
                <template v-else>{{ notification.sender.name }}</template>
              </span>
              <time
                :datetime="notification.date"
                class="text-muted text-xs"
                v-text="formatTimeAgo(new Date(notification.date))"
              />
            </p>
            <p class="text-dimmed">
              {{ notification.body }}
            </p>
          </div>
        </NuxtLink>
      </template>
    </template>
  </USlideover>
</template>
