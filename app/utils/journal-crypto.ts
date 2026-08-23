// Client-only cryptography for the Diário de Bordo's end-to-end encryption
// (docs/journal/PLANO_CRIPTOGRAFIA_PONTA_A_PONTA.md). Every function here
// runs in the browser via the native Web Crypto API — the server never sees
// a passphrase, a derived key, or plaintext content. Pure functions only, no
// Vue reactivity, so each step is easy to reason about (and test) in
// isolation from the composable that orchestrates them.

const PBKDF2_HASH = 'SHA-256'
const AES_ALGO = 'AES-GCM'
const AES_KEY_LENGTH = 256
const IV_BYTES = 12
const SALT_BYTES = 16
const RSA_ALGO = 'RSA-OAEP'
const RSA_HASH = 'SHA-256'

// ─── base64 helpers ─────────────────────────────────────────────────────────
// Chunked to avoid blowing the call stack on `String.fromCharCode(...bytes)`
// for larger payloads (a day's journal entry, base64-encoded).
function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// ─── Random material ────────────────────────────────────────────────────────

export function generateSaltB64(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(SALT_BYTES)))
}

// 160 bits of entropy, hex-encoded in dash-grouped blocks — a personal
// recovery code the person saves outside the app (seção 2.1 do plano).
export function generateRecoveryCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20))
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0').toUpperCase()).join('')
  return hex.match(/.{1,4}/g)!.join('-')
}

// ─── Key derivation (passphrase/recovery code → wrapping key) ──────────────

export async function deriveWrappingKey(secret: string, saltB64: string, iterations: number): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  )
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: base64ToBytes(saltB64), iterations, hash: PBKDF2_HASH },
    baseKey,
    { name: AES_ALGO, length: AES_KEY_LENGTH },
    false,
    ['wrapKey', 'unwrapKey']
  )
}

// ─── Data Key (the key that actually encrypts entry content) ───────────────
// Extractable so it can be wrapped (seção "Módulo de criptografia" do plano)
// — "extractable" only means the browser *allows* export/wrap; our own code
// never calls exportKey() on it directly, only wrapKey()/unwrapKey().

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: AES_ALGO, length: AES_KEY_LENGTH }, true, ['encrypt', 'decrypt'])
}

export async function wrapWithAesKey(dataKey: CryptoKey, wrappingKey: CryptoKey): Promise<{ wrapped: string, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, wrappingKey, { name: AES_ALGO, iv })
  return { wrapped: bytesToBase64(new Uint8Array(wrapped)), iv: bytesToBase64(iv) }
}

export async function unwrapWithAesKey(wrappedB64: string, ivB64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'raw',
    base64ToBytes(wrappedB64),
    wrappingKey,
    { name: AES_ALGO, iv: base64ToBytes(ivB64) },
    { name: AES_ALGO, length: AES_KEY_LENGTH },
    true,
    ['encrypt', 'decrypt']
  )
}

// Terceira cópia — cifrada com a chave pública de recuperação do Kortex
// (RSA-OAEP, nativo, sem dependência nova). Só a metade pública é usada
// aqui; a privada nunca entra no código do app (ver seção "O que eu NÃO vou
// fazer" do plano) — não existe uma `unwrapWithRsaPrivateKey` neste módulo
// de propósito, essa metade roda fora do app, com quem guarda a privada.
export async function wrapWithRsaPublicKey(dataKey: CryptoKey, publicKeySpkiB64: string): Promise<string> {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    base64ToBytes(publicKeySpkiB64),
    { name: RSA_ALGO, hash: RSA_HASH },
    true,
    ['wrapKey']
  )
  const wrapped = await crypto.subtle.wrapKey('raw', dataKey, publicKey, { name: RSA_ALGO })
  return bytesToBase64(new Uint8Array(wrapped))
}

// ─── Content encryption ─────────────────────────────────────────────────────

export async function encryptText(dataKey: CryptoKey, plaintext: string): Promise<{ ciphertext: string, iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt({ name: AES_ALGO, iv }, dataKey, new TextEncoder().encode(plaintext))
  return { ciphertext: bytesToBase64(new Uint8Array(ciphertext)), iv: bytesToBase64(iv) }
}

export async function decryptText(dataKey: CryptoKey, ciphertextB64: string, ivB64: string): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: AES_ALGO, iv: base64ToBytes(ivB64) },
    dataKey,
    base64ToBytes(ciphertextB64)
  )
  return new TextDecoder().decode(plaintext)
}
