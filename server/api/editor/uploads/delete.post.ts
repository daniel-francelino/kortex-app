import { getSupabaseAdminClient } from '../../../utils/supabase'
import { requireAuthUser } from '../../../utils/require-auth'

const EDITOR_UPLOADS_BUCKET = 'editor-uploads'

interface DeleteUploadPayload {
  files?: {
    bucket?: string
    path?: string
  }[]
}

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const body = await readBody<DeleteUploadPayload>(event)
  const files = body.files ?? []

  const paths = Array.from(new Set(files
    .filter(file => file.bucket === EDITOR_UPLOADS_BUCKET)
    .map(file => file.path ?? '')
    .filter(path => isOwnEditorUploadPath(path, user.id))))

  if (!paths.length) {
    return {
      deleted: 0
    }
  }

  const supabase = getSupabaseAdminClient()
  const { error } = await supabase.storage
    .from(EDITOR_UPLOADS_BUCKET)
    .remove(paths)

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Erro ao remover arquivos',
      data: error.message
    })
  }

  return {
    deleted: paths.length
  }
})

function isOwnEditorUploadPath(path: string, userId: string) {
  return path.startsWith(`${userId}/editor/`) && !path.includes('..')
}
