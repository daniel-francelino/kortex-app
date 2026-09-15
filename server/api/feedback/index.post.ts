import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getRequestWebStream } from 'h3'
import { getSupabaseAdminClient } from '../../utils/supabase'
import { requireAuthUser } from '../../utils/require-auth'
import { mapFeedback } from '../../utils/feedback-mappers'
import { FEEDBACK_MAX_TOTAL_BYTES, validateFeedbackFiles } from '../../../shared/utils/feedback-attachments'

const bodySchema = z.object({
  type: z.enum(['bug', 'suggestion', 'improvement', 'praise']),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(5000),
  techContext: z.object({
    route: z.string().max(500), userAgent: z.string().max(1000),
    appVersion: z.string().max(100), screenResolution: z.string().max(100), timestamp: z.string().max(100)
  }).nullable().optional()
}).strict()

export default eventHandler(async (event) => {
  const user = await requireAuthUser(event)
  const contentType = getHeader(event, 'content-type') || ''
  const multipart = contentType.startsWith('multipart/form-data;')
  const limit = multipart ? FEEDBACK_MAX_TOTAL_BYTES + 64 * 1024 : 64 * 1024
  const tooLarge = () => createError({ statusCode: 413, message: 'O envio ultrapassa o limite permitido de tamanho.' })
  if (Number(getHeader(event, 'content-length')) > limit) throw tooLarge()
  // Count actual streamed bytes too: Content-Length is not trusted.
  const reader = getRequestWebStream(event)?.getReader()
  if (!reader) throw createError({ statusCode: 400, message: 'Envio vazio.' })
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const raw = Buffer.concat(chunks)
  let body: unknown
  let files: File[] = []
  try {
    if (multipart) {
      const form = await new Response(raw, { headers: { 'content-type': contentType } }).formData()
      if ([...form.keys()].some(key => key !== 'payload' && key !== 'files') || form.getAll('payload').length !== 1) throw new Error('Invalid form')
      body = JSON.parse(String(form.get('payload')))
      const attachments = form.getAll('files')
      if (attachments.some(file => typeof file === 'string')) throw new Error('Invalid files')
      files = attachments as File[]
    } else {
      body = JSON.parse(raw.toString('utf8'))
    }
  } catch {
    throw createError({ statusCode: 400, message: 'Não foi possível ler o envio. Revise os campos e anexos.' })
  }
  const validation = bodySchema.safeParse(body)
  if (!validation.success) throw createError({ statusCode: 400, message: 'Informe um título de até 200 caracteres e uma descrição de até 5.000 caracteres.' })
  const fileError = validateFeedbackFiles(files)
  if (fileError) throw createError({ statusCode: 400, message: fileError })
  const parsed = validation.data
  const supabase = getSupabaseAdminClient()
  const id = randomUUID()
  const uploaded: string[] = []
  let created = false
  try {
    const attachmentRows = []
    for (const file of files) {
      const attachmentId = randomUUID()
      const path = user.id + '/' + id + '/' + attachmentId
      const bytes = Buffer.from(await file.arrayBuffer())
      const { error } = await supabase.storage.from('feedback-attachments').upload(path, bytes, { contentType: file.type, upsert: false })
      if (error) throw error
      uploaded.push(path)
      attachmentRows.push({ id: attachmentId, feedback_id: id, file_name: file.name.slice(0, 200),
        file_url: '/api/feedback/' + id + '/attachments/' + attachmentId,
        file_type: file.type, file_size: file.size, storage_path: path })
    }
    const { data, error } = await supabase.from('feedbacks').insert({
      id, user_id: user.id, type: parsed.type, title: parsed.title,
      description: parsed.description, tech_context: parsed.techContext ?? null
    }).select().single()
    if (error) throw error
    created = true
    if (attachmentRows.length) {
      const { error: attachmentError } = await supabase.from('feedback_attachments').insert(attachmentRows)
      if (attachmentError) throw attachmentError
    }
    return mapFeedback({ ...data, feedback_attachments: attachmentRows })
  } catch (error) {
    if (created) {
      const { error: cleanupError } = await supabase.from('feedbacks').delete().eq('id', id).eq('user_id', user.id)
      if (cleanupError) console.error('Feedback rollback failed', { id, cleanupError })
    }
    if (uploaded.length) {
      const { error: cleanupError } = await supabase.storage.from('feedback-attachments').remove(uploaded)
      if (cleanupError) console.error('Feedback file cleanup failed', { id, cleanupError })
    }
    console.error('Feedback submission failed', { id, error })
    throw createError({ statusCode: 500, message: 'Não foi possível concluir o envio. Seus campos foram preservados; tente novamente.' })
  }
})
