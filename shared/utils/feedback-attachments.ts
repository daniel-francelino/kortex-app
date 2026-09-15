export const FEEDBACK_MAX_FILES = 3
export const FEEDBACK_MAX_FILE_BYTES = 10 * 1024 * 1024
export const FEEDBACK_MAX_TOTAL_BYTES = 20 * 1024 * 1024
export const FEEDBACK_FILE_TYPES: Record<string, string[]> = {
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'image/webp': ['webp'],
  'application/pdf': ['pdf'],
  'video/mp4': ['mp4'],
  'video/quicktime': ['mov']
}
export const FEEDBACK_ACCEPT = Object.values(FEEDBACK_FILE_TYPES).flat().map(ext => `.${ext}`).join(',')

export function validateFeedbackFiles(files: { name: string, type: string, size: number }[]): string | null {
  if (files.length > FEEDBACK_MAX_FILES) return 'Selecione no máximo 3 arquivos.'
  for (const file of files) {
    if (!file.size) return `O arquivo ${file.name} está vazio.`
    if (file.size > FEEDBACK_MAX_FILE_BYTES) return `${file.name} ultrapassa o limite de 10 MB.`
    const extension = file.name.split('.').pop()?.toLowerCase() || ''
    if (!FEEDBACK_FILE_TYPES[file.type]?.includes(extension)) return 'Use imagens PNG, JPG ou WebP, PDF ou vídeos MP4 e MOV.'
  }
  if (files.reduce((total, file) => total + file.size, 0) > FEEDBACK_MAX_TOTAL_BYTES) return 'Os anexos juntos devem ter no máximo 20 MB.'
  return null
}
