import { getSupabaseAdminClient } from './supabase'

/**
 * Links any pending note_shares invites, and any pending event_participants
 * invites, addressed to this email to the now-known user id — so a note or
 * event shared with someone before they had an account becomes usable as soon
 * as they sign up/log in with that email — see
 * docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md (Fase A3).
 *
 * For event_participants this only fills in invited_user_id — it does not
 * touch rsvp_status, unlike note_shares' auto-accept. "The invite is now
 * usable" and "the person confirmed attendance" are different things for a
 * calendar invite.
 *
 * Safe to call on every login: it's a cheap no-op once there's nothing pending
 * for that email (idx_note_shares_pending_email / idx_event_participants_pending_email
 * keep the lookups fast), and failures here must never block the auth flow, so
 * callers should fire-and-log rather than await-and-throw.
 */
export async function reconcilePendingShares(userId: string, email: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const lowerEmail = email.toLowerCase()

  const { error: noteSharesError } = await supabase
    .from('note_shares')
    .update({ shared_with_user_id: userId, status: 'accepted' })
    .eq('shared_with_email', lowerEmail)
    .eq('status', 'pending')

  if (noteSharesError) {
    console.error('[reconcilePendingShares] note_shares', noteSharesError.message)
  }

  const { error: eventParticipantsError } = await supabase
    .from('event_participants')
    .update({ invited_user_id: userId })
    .eq('invited_email', lowerEmail)
    .is('invited_user_id', null)

  if (eventParticipantsError) {
    console.error('[reconcilePendingShares] event_participants', eventParticipantsError.message)
  }
}
