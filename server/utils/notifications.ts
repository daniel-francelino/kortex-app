import type { SupabaseClient } from '@supabase/supabase-js'

export type CreateNotificationParams = {
  userId: string
  body: string
  type?: 'user' | 'system'
  category?: string
  linkPath?: string | null
  senderName?: string | null
  senderEmail?: string | null
  senderAvatarUrl?: string | null
  metadata?: Record<string, unknown>
  /**
   * Set this when the caller can dedupe on a stable key (e.g. a cron job
   * scanning the same row on every run). `notifications.external_id` has a
   * unique index, so a repeat insert with the same value is treated as
   * "already notified" rather than an error.
   */
  externalId?: string | null
}

/**
 * Single place in the Nuxt server that knows how to insert into `notifications`.
 * Any domain event (habit reminder, appointment reminder, note shared, etc.)
 * should go through this instead of inserting into the table directly.
 *
 * Respects `notification_preferences.channel_in_app` — if the user turned the
 * in-app channel off, this is a no-op. Only the in-app channel is handled here;
 * push/email are separate concerns for when those channels are built.
 */
export async function createNotification(supabase: SupabaseClient, params: CreateNotificationParams) {
  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('channel_in_app')
    .eq('user_id', params.userId)
    .maybeSingle<{ channel_in_app: boolean }>()

  if (preferences?.channel_in_app === false)
    return null

  const { data, error } = await supabase
    .from('notifications')
    .insert({
      user_id: params.userId,
      type: params.type ?? 'system',
      body: params.body,
      link_path: params.linkPath ?? null,
      sender_name: params.senderName ?? 'Kortex',
      sender_email: params.senderEmail ?? null,
      sender_avatar_url: params.senderAvatarUrl ?? null,
      metadata: params.metadata ?? {},
      channels: ['in_app'],
      category: params.category ?? 'general',
      source: 'internal',
      external_id: params.externalId ?? null
    })
    .select('id')
    .single()

  if (error) {
    // Unique violation on external_id means this event was already notified
    // by a previous run (e.g. the same cron scan) — expected, not a failure.
    if (error.code === '23505' && params.externalId)
      return null

    console.error('[notifications] failed to create notification', {
      userId: params.userId,
      category: params.category,
      error: error.message
    })
    return null
  }

  return data
}
