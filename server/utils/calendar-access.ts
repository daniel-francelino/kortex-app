import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves whether `userId` may create/edit events in `calendarId` — either
 * because they own it, or because they have an accepted calendar_shares grant
 * with permission='edit'. Returns the calendar's actual owner id (events
 * always belong to the calendar owner, never to the editing collaborator —
 * same single-owner-per-calendar invariant the rest of the schema assumes),
 * or null if the calendar doesn't exist/isn't writable by this user.
 */
export async function resolveCalendarForWrite(
  supabase: SupabaseClient,
  calendarId: string,
  userId: string
): Promise<{ ownerId: string } | null> {
  const { data: calendar } = await supabase
    .from('calendars')
    .select('id, owner_user_id')
    .eq('id', calendarId)
    .is('archived_at', null)
    .maybeSingle()

  if (!calendar) return null

  const ownerId = calendar.owner_user_id as string
  if (ownerId === userId) return { ownerId }

  const { data: share } = await supabase
    .from('calendar_shares')
    .select('id')
    .eq('calendar_id', calendarId)
    .eq('invited_user_id', userId)
    .eq('status', 'accepted')
    .eq('permission', 'edit')
    .maybeSingle()

  if (!share) return null

  return { ownerId }
}
