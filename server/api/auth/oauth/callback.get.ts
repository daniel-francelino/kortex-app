import { getQuery, getRequestURL, sendRedirect } from 'h3'
import { z } from 'zod'
import type { Session } from '@supabase/supabase-js'
import { clearOauthCodeVerifier, getOauthCodeVerifier } from '../../../utils/oauth-cookies'
import { setAuthCookies } from '../../../utils/auth-cookies'
import { getSupabaseAnonClient } from '../../../utils/supabase-anon'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { setAuthUserCookie, toAuthUser } from '../../../utils/auth-user'
import { reconcilePendingShares } from '../../../utils/reconcile-pending-shares'

const querySchema = z.object({
  code: z.string().min(1).optional(),
  error_description: z.string().optional(),
  error: z.string().optional()
})

type TokenResponse = {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
}

export default eventHandler(async (event) => {
  const query = getQuery(event)
  const parsed = querySchema.safeParse(query)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid callback'
    })
  }

  if (parsed.data.error || parsed.data.error_description) {
    clearOauthCodeVerifier(event)
    return sendRedirect(event, '/login', 302)
  }

  const code = parsed.data.code
  if (!code) {
    clearOauthCodeVerifier(event)
    return sendRedirect(event, '/login', 302)
  }

  const codeVerifier = getOauthCodeVerifier(event)
  clearOauthCodeVerifier(event)
  if (!codeVerifier)
    return sendRedirect(event, '/login', 302)

  const config = useRuntimeConfig()
  const supabaseUrl = config.supabaseUrl
  const supabaseAnonKey = config.supabaseAnonKey
  if (!supabaseUrl || !supabaseAnonKey) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Supabase is not configured'
    })
  }

  const origin = getRequestURL(event).origin
  const redirectTo = `${origin}/api/auth/oauth/callback`

  const tokenUrl = new URL('/auth/v1/token', supabaseUrl)
  tokenUrl.searchParams.set('grant_type', 'pkce')

  const tokenResponse = await $fetch<TokenResponse>(tokenUrl.toString(), {
    method: 'POST',
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`
    },
    body: {
      auth_code: code,
      code_verifier: codeVerifier,
      redirect_to: redirectTo
    }
  }).catch((error: unknown) => {
    const maybeError = error as { data?: unknown, message?: unknown } | null
    const data = (maybeError && typeof maybeError === 'object' ? maybeError.data : undefined) as unknown
    const message = (maybeError && typeof maybeError === 'object' ? maybeError.message : undefined) as unknown
    const dataRecord = data && typeof data === 'object' ? data as Record<string, unknown> : null

    const msg = typeof dataRecord?.msg === 'string' ? dataRecord.msg : undefined
    const errorDescription = typeof dataRecord?.error_description === 'string' ? dataRecord.error_description : undefined

    throw createError({
      statusCode: 400,
      statusMessage: msg || errorDescription || (typeof message === 'string' ? message : undefined) || 'OAuth exchange failed'
    })
  })

  const expiresAt = Math.floor(Date.now() / 1000) + tokenResponse.expires_in
  const session = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_in: tokenResponse.expires_in,
    expires_at: expiresAt,
    token_type: tokenResponse.token_type,
    user: null
  } as unknown as Session

  const supabase = getSupabaseAnonClient()
  const { data: userData } = await supabase.auth.getUser(tokenResponse.access_token)
  if (userData.user) {
    const supabaseAdmin = getSupabaseAdminClient()

    const [userPreferencesResult, notificationPreferencesResult] = await Promise.all([
      supabaseAdmin
        .from('user_preferences')
        .upsert({
          user_id: userData.user.id,
          primary_color: 'emerald',
          neutral_color: 'slate',
          color_mode: 'dark',
          timezone: 'UTC'
        }, { onConflict: 'user_id' }),
      supabaseAdmin
        .from('notification_preferences')
        .upsert({
          user_id: userData.user.id,
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

    setAuthUserCookie(event, {
      user: toAuthUser(userData.user),
      expiresAt,
      syncedAt: Date.now()
    })

    if (userData.user.email) {
      void reconcilePendingShares(userData.user.id, userData.user.email)
    }
  }

  setAuthCookies(event, session)

  return sendRedirect(event, '/app', 302)
})
