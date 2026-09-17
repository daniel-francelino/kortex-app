import { z } from 'zod'
import { requireAuthUser } from '../../utils/require-auth'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { isReservedUsername } from '../../utils/reserved-usernames'
import { isValidUsernameFormat } from '../../utils/username'

const schema = z.object({
  name: z.string().min(2, 'Nome deve ter pelo menos 2 caracteres'),
  avatar_url: z.string().url('URL inválida').optional().or(z.literal('')),
  // '' limpa o username (perfil público deixa de existir, volta a só ter o
  // link opaco /agendar/{token}) — só validamos formato/reservado quando não
  // está vazio.
  username: z.string()
    .transform(v => v.trim().toLowerCase())
    .refine(v => v === '' || isValidUsernameFormat(v), 'Use só letras minúsculas, números e hífen (sem hífens repetidos)')
    .refine(v => v === '' || !isReservedUsername(v), 'Este username não está disponível')
    .optional(),
  bio: z.string().max(280, 'Máximo de 280 caracteres').optional()
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Dados inválidos',
      data: parsed.error.flatten()
    })
  }

  const supabase = getSupabaseAdminClient()

  if (parsed.data.username) {
    const { data: taken } = await supabase
      .from('user_preferences')
      .select('user_id')
      .eq('username', parsed.data.username)
      .neq('user_id', user.id)
      .maybeSingle()

    // Só uma mensagem amigável — o índice único em lower(username) é quem
    // garante a integridade de verdade contra uma corrida rara entre esta
    // checagem e o upsert abaixo (docs/appointments/PLANO_USERNAME_
    // PERFIL_PUBLICO.md §5.4).
    if (taken) {
      throw createError({ statusCode: 409, statusMessage: 'Este username não está disponível' })
    }
  }

  const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
    user_metadata: {
      name: parsed.data.name,
      avatar_url: parsed.data.avatar_url || null
    }
  })

  if (authError) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Não foi possível atualizar o perfil'
    })
  }

  if (parsed.data.username !== undefined || parsed.data.bio !== undefined) {
    const { error: prefsError } = await supabase
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        // Omitidos inteiramente (não `undefined`) quando não enviados, para
        // o upsert não sobrescrever o valor existente — mesma convenção já
        // usada em /api/settings/preferences.put.ts.
        ...(parsed.data.username !== undefined ? { username: parsed.data.username || null } : {}),
        ...(parsed.data.bio !== undefined ? { bio: parsed.data.bio || null } : {})
      }, { onConflict: 'user_id' })

    if (prefsError) {
      throw createError({
        statusCode: prefsError.code === '23505' ? 409 : 500,
        statusMessage: prefsError.code === '23505' ? 'Este username não está disponível' : 'Não foi possível atualizar o perfil'
      })
    }
  }

  return { ok: true }
})
