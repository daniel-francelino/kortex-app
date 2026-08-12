import { getSupabaseAdminClient } from './supabase'

/**
 * Links any pending note_shares invites addressed to this email to the now-known
 * user id, so a note shared with someone before they had an account becomes
 * visible as soon as they sign up/log in with that email — see
 * docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md (Fase A3).
 *
 * Safe to call on every login: it's a cheap no-op once there's nothing pending
 * for that email (idx_note_shares_pending_email keeps the lookup fast), and
 * failures here must never block the auth flow, so callers should fire-and-log
 * rather than await-and-throw.
 */
export async function reconcilePendingShares(userId: string, email: string): Promise<void> {
  const supabase = getSupabaseAdminClient()
  const { error } = await supabase
    .from('note_shares')
    .update({ shared_with_user_id: userId, status: 'accepted' })
    .eq('shared_with_email', email.toLowerCase())
    .eq('status', 'pending')

  if (error) {
    console.error('[reconcilePendingShares]', error.message)
  }
}
