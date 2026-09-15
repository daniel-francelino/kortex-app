import type { H3Event } from 'h3'
import { requireAuthUser } from './require-auth'
import { getSupabaseAdminClient } from './supabase'

export async function requireFeedbackAdmin(event: H3Event) {
  const user = await requireAuthUser(event)
  // app_metadata is managed by the server, unlike editable user_metadata.
  const { data, error } = await getSupabaseAdminClient().auth.admin.getUserById(user.id)
  if (error || data.user?.app_metadata?.role !== 'admin') {
    throw createError({ statusCode: 403, message: 'Acesso restrito à administração.' })
  }
  return user
}
