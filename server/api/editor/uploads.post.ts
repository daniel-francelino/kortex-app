import { randomUUID } from 'node:crypto'
import { extname } from 'node:path'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'

type EditorUploadKind = 'image' | 'file'

const EDITOR_UPLOADS_BUCKET = 'editor-uploads'
const ALLOWED_IMAGE_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif'
])
const BLOCKED_EXTENSIONS = new Set([
  '.bat',
  '.cmd',
  '.cjs',
  '.com',
  '.exe',
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.msi',
  '.php',
  '.ps1',
  '.sh',
  '.svg'
])
const BLOCKED_MIME_TYPES = new Set([
  'image/svg+xml',
  'text/html',
  'application/javascript',
  'text/javascript'
])

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const form = await readMultipartFormData(event)

  if (!form?.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Arquivo obrigatorio'
    })
  }

  const filePart = form.find(part => part.name === 'file' && part.filename)
  const requestedKind = getRequestedKind(form.find(part => part.name === 'kind')?.data.toString('utf8'))

  if (!filePart?.filename || !filePart.data.length) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Arquivo obrigatorio'
    })
  }

  const mimeType = filePart.type || 'application/octet-stream'
  const extension = extname(filePart.filename).toLowerCase()
  const kind = resolveKind(mimeType, requestedKind)

  validateUpload({ kind, mimeType, extension })

  const supabase = getSupabaseAdminClient()
  const safeName = sanitizeFileName(filePart.filename)
  const now = new Date()
  const year = String(now.getUTCFullYear())
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const path = `${user.id}/editor/${year}/${month}/${randomUUID()}-${safeName}`

  const { error } = await supabase.storage
    .from(EDITOR_UPLOADS_BUCKET)
    .upload(path, filePart.data, {
      contentType: mimeType,
      cacheControl: '31536000',
      upsert: false
    })

  if (error) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Erro ao enviar arquivo',
      data: error.message
    })
  }

  const { data } = supabase.storage
    .from(EDITOR_UPLOADS_BUCKET)
    .getPublicUrl(path)

  return {
    bucket: EDITOR_UPLOADS_BUCKET,
    path,
    url: data.publicUrl,
    name: filePart.filename,
    size: filePart.data.length,
    type: mimeType,
    kind
  }
})

function getRequestedKind(value?: string): EditorUploadKind {
  return value === 'image' ? 'image' : 'file'
}

function resolveKind(mimeType: string, requestedKind: EditorUploadKind): EditorUploadKind {
  if (mimeType.startsWith('image/')) return 'image'
  return requestedKind === 'image' ? 'image' : 'file'
}

function validateUpload(input: {
  kind: EditorUploadKind
  mimeType: string
  extension: string
}) {
  if (BLOCKED_EXTENSIONS.has(input.extension) || BLOCKED_MIME_TYPES.has(input.mimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Tipo de arquivo nao permitido'
    })
  }

  if (input.kind === 'image' && !ALLOWED_IMAGE_TYPES.has(input.mimeType)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Imagem nao permitida'
    })
  }
}

function sanitizeFileName(filename: string) {
  const normalized = filename
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

  return normalized || 'arquivo'
}
