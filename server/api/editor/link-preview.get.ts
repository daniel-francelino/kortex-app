import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { requireAuthUser } from '../../utils/require-auth'

interface LinkPreview {
  url: string
  title: string
  description: string
  image: string
  siteName: string
}

const CACHE_TTL_MS = 1000 * 60 * 60
const FETCH_TIMEOUT_MS = 5000
const MAX_HTML_BYTES = 256 * 1024
const previewCache = new Map<string, { expiresAt: number, value: LinkPreview }>()

export default eventHandler(async (event) => {
  await requireAuthUser(event)

  const query = getQuery(event)
  const rawUrl = typeof query.url === 'string' ? query.url : ''
  const target = normalizePreviewUrl(rawUrl)
  const cached = previewCache.get(target.href)

  if (cached && cached.expiresAt > Date.now()) return cached.value

  await assertPublicHttpUrl(target)

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await fetch(target, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        accept: 'text/html,application/xhtml+xml'
      }
    })

    const contentType = response.headers.get('content-type') ?? ''
    if (!response.ok || !contentType.includes('text/html')) {
      throw createError({
        statusCode: 422,
        statusMessage: 'Link sem preview disponivel'
      })
    }

    const html = await readResponseText(response)
    const value = parsePreviewHtml(target, html)

    previewCache.set(target.href, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      value
    })

    return value
  } finally {
    clearTimeout(timeout)
  }
})

function normalizePreviewUrl(value: string) {
  const trimmed = value.trim()
  if (!trimmed) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL obrigatoria'
    })
  }

  try {
    const url = new URL(trimmed)
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol')
    }
    url.hash = ''
    return url
  } catch {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL invalida'
    })
  }
}

async function assertPublicHttpUrl(url: URL) {
  const hostname = url.hostname.toLowerCase()
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL nao permitida'
    })
  }

  const ipType = isIP(hostname)
  if (ipType && isPrivateIp(hostname)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'URL nao permitida'
    })
  }

  if (!ipType) {
    const addresses = await lookup(hostname, { all: true })
    if (!addresses.length || addresses.some(address => isPrivateIp(address.address))) {
      throw createError({
        statusCode: 400,
        statusMessage: 'URL nao permitida'
      })
    }
  }
}

function isPrivateIp(address: string) {
  if (address === '::1') return true
  if (address.startsWith('fe80:') || address.startsWith('fc') || address.startsWith('fd')) return true

  const parts = address.split('.').map(part => Number(part))
  if (parts.length !== 4 || parts.some(part => Number.isNaN(part))) return false

  const [first, second] = parts as [number, number, number, number]
  return first === 10
    || first === 127
    || (first === 172 && second >= 16 && second <= 31)
    || (first === 192 && second === 168)
    || (first === 169 && second === 254)
    || first === 0
}

async function readResponseText(response: Response) {
  const reader = response.body?.getReader()
  if (!reader) return ''

  const chunks: Uint8Array[] = []
  let total = 0

  while (total < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    chunks.push(value)
    total += value.byteLength
  }

  await reader.cancel().catch(() => undefined)
  return new TextDecoder().decode(concatChunks(chunks, Math.min(total, MAX_HTML_BYTES)))
}

function concatChunks(chunks: Uint8Array[], maxBytes: number) {
  const output = new Uint8Array(maxBytes)
  let offset = 0

  for (const chunk of chunks) {
    const slice = chunk.slice(0, Math.max(0, maxBytes - offset))
    output.set(slice, offset)
    offset += slice.byteLength
    if (offset >= maxBytes) break
  }

  return output
}

function parsePreviewHtml(url: URL, html: string): LinkPreview {
  const title = readMeta(html, 'og:title')
    || readTag(html, 'title')
    || url.hostname
  const description = readMeta(html, 'og:description')
    || readMeta(html, 'description')
    || ''
  const image = absolutizeUrl(readMeta(html, 'og:image'), url)
  const siteName = readMeta(html, 'og:site_name') || url.hostname.replace(/^www\./, '')

  return {
    url: url.href,
    title: cleanText(title).slice(0, 180),
    description: cleanText(description).slice(0, 260),
    image,
    siteName: cleanText(siteName).slice(0, 80)
  }
}

function readMeta(html: string, key: string) {
  const pattern = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escapeRegex(key)}["'][^>]*>`, 'i')
  const tag = html.match(pattern)?.[0] ?? ''
  return readAttribute(tag, 'content')
}

function readTag(html: string, tagName: string) {
  const match = html.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i'))
  return decodeHtml(match?.[1] ?? '')
}

function readAttribute(tag: string, attribute: string) {
  const match = tag.match(new RegExp(`${attribute}=["']([^"']*)["']`, 'i'))
  return decodeHtml(match?.[1] ?? '')
}

function absolutizeUrl(value: string, base: URL) {
  if (!value) return ''
  try {
    return new URL(value, base).href
  } catch {
    return ''
  }
}

function cleanText(value: string) {
  return decodeHtml(value).replace(/\s+/g, ' ').trim()
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
