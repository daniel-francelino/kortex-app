import { z } from 'zod'
import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const bodySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().nullable().optional()
})

// Keeps the sidebar tree from growing deep enough to break the indentation
// layout — mirrors MAX_FOLDER_DEPTH in app/types/notes.ts. Duplicated here
// (not imported) since server routes don't share the app/ alias.
const MAX_FOLDER_DEPTH = 5

/** Depth of an existing folder — a root-level folder (no parent) is depth 1.
 * Walks up parent_id one row at a time (bounded by MAX_FOLDER_DEPTH, so at
 * most a handful of round trips) since folders aren't preloaded server-side. */
async function getFolderDepth(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  folderId: string,
  userId: string
): Promise<number> {
  let depth = 1
  let currentId: string | null = folderId
  const seen = new Set<string>()

  while (currentId && !seen.has(currentId) && depth <= MAX_FOLDER_DEPTH) {
    seen.add(currentId)
    const { data } = await supabase
      .from('note_folders')
      .select('parent_id')
      .eq('id', currentId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!data?.parent_id) break
    depth++
    currentId = data.parent_id as string
  }

  return depth
}

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody(event)
  const payload = bodySchema.parse(body)
  const supabase = getSupabaseAdminClient()

  if (payload.parentId) {
    const parentDepth = await getFolderDepth(supabase, payload.parentId, user.id)
    if (parentDepth >= MAX_FOLDER_DEPTH) {
      throw createError({
        statusCode: 400,
        statusMessage: `Pastas só podem ter até ${MAX_FOLDER_DEPTH} níveis de profundidade`
      })
    }
  }

  // New folders are placed at the top of the custom order among their siblings.
  let lowestQuery = supabase
    .from('note_folders')
    .select('position')
    .eq('user_id', user.id)

  lowestQuery = payload.parentId
    ? lowestQuery.eq('parent_id', payload.parentId)
    : lowestQuery.is('parent_id', null)

  const { data: lowest } = await lowestQuery
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()

  const position = lowest ? (lowest.position as number) - 1000 : 0

  const { data, error } = await supabase
    .from('note_folders')
    .insert({ user_id: user.id, name: payload.name, parent_id: payload.parentId ?? null, position })
    .select()
    .single()

  if (error) {
    throw createError({ statusCode: 500, statusMessage: 'Erro ao criar pasta', data: error.message })
  }

  return {
    id: data.id,
    userId: data.user_id,
    name: data.name,
    parentId: data.parent_id ?? null,
    position: data.position ?? 0,
    isExpanded: data.is_expanded ?? true,
    createdAt: data.created_at,
    updatedAt: data.updated_at
  }
})
