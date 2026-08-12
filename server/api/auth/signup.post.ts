import { z } from 'zod'
import { getSupabaseAnonClient } from '../../utils/supabase-anon'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { setAuthCookies } from '../../utils/auth-cookies'
import { setAuthUserCookie, toAuthUser } from '../../utils/auth-user'
import { reconcilePendingShares } from '../../utils/reconcile-pending-shares'

const schema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8)
})

export default eventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid payload',
      data: parsed.error.flatten()
    })
  }

  const supabase = getSupabaseAnonClient()

  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        name: parsed.data.name
      }
    }
  })

  if (error) {
    throw createError({
      statusCode: 400,
      statusMessage: error.message
    })
  }

  if (data.user) {
    const supabaseAdmin = getSupabaseAdminClient()

    const [userPreferencesResult, notificationPreferencesResult] = await Promise.all([
      supabaseAdmin
        .from('user_preferences')
        .upsert({
          user_id: data.user.id,
          primary_color: 'emerald',
          neutral_color: 'slate',
          color_mode: 'dark',
          timezone: 'UTC'
        }, { onConflict: 'user_id' }),
      supabaseAdmin
        .from('notification_preferences')
        .upsert({
          user_id: data.user.id,
          channel_in_app: true,
          channel_email: true,
          channel_web_push: false,
          channel_mobile_push: false,
          habit_reminders: true,
          weekly_digest: false,
          product_updates: true,
          important_updates: true,
          web_push_permission: 'default',
          mobile_push_permission: 'default'
        }, { onConflict: 'user_id' })
    ])

    if (userPreferencesResult.error || notificationPreferencesResult.error) {
      throw createError({
        statusCode: 500,
        statusMessage: 'Não foi possível inicializar as preferências do usuário'
      })
    }

    if (data.user.email) {
      void reconcilePendingShares(data.user.id, data.user.email)
    }
  }

  if (data.session) {
    if (data.user) {
      setAuthUserCookie(event, {
        user: toAuthUser(data.user),
        expiresAt: data.session.expires_at ?? null,
        syncedAt: Date.now()
      })
    }

    setAuthCookies(event, data.session)
  }

  return {
    user: data.user ? toAuthUser(data.user) : null,
    session: data.session ? { expiresAt: data.session.expires_at ?? null } : null
  }
})
