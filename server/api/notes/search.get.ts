import { z } from 'zod'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

const querySchema = z.object({
  q: z.string().min(1).max(200)
})

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const query = getQuery(event)
  const params = querySchema.parse(query)
  const supabase = getSupabaseAdminClient()

  const { data, error } = await supabase
    .from('knowledge_notes')
    .select('id, title, type, content, updated_at')
    .eq('user_id', user.id)
    .or(`title.ilike.%${params.q}%,content.ilike.%${params.q}%`)
    .order('updated_at', { ascending: false })
    .limit(20)

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro na busca', data: error.message })
  }

  return (data ?? []).map((row: Record<string, unknown>) => {
    const content = (row.content as string) ?? ''
    const q = params.q.toLowerCase()
    let excerpt: string | null = null

    const idx = content.toLowerCase().indexOf(q)
    if (idx >= 0) {
      const start = Math.max(0, idx - 40)
      const end = Math.min(content.length, idx + q.length + 40)
      excerpt = (start > 0 ? '...' : '') + content.slice(start, end) + (end < content.length ? '...' : '')
    } else if (content.length > 0) {
      excerpt = content.slice(0, 80) + (content.length > 80 ? '...' : '')
    }

    return {
      id: row.id,
      title: row.title,
      type: row.type,
      excerpt,
      updatedAt: row.updated_at
    }
  })
})
