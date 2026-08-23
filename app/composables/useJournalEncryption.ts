import type { JournalEncryptionKeys, JournalEntry, JournalListResponse } from '~/types/journal'
import {
  decryptText,
  deriveWrappingKey,
  encryptText,
  generateDataKey,
  generateRecoveryCode,
  generateSaltB64,
  unwrapWithAesKey,
  wrapWithAesKey,
  wrapWithRsaPublicKey
} from '~/utils/journal-crypto'

const KDF_ITERATIONS = 600_000
const MIGRATION_PAGE_SIZE = 100

// Estado em nível de módulo (singleton) — mesma razão do useJournalLock.ts:
// o "desbloqueado nesta sessão" precisa ser visto por qualquer componente
// que chame o composable (TodayEditor, EntryDetailModal, EntryList,
// Configurações), não só pela instância que fez o unlock. A Data Key só
// existe em memória — nunca em localStorage/sessionStorage (ao contrário do
// PIN, aqui "esqueceu e reabriu a aba" tem que pedir a frase de novo pra
// valer alguma coisa como criptografia).
const statusLoaded = ref(false)
const enabled = ref(false)
const dataKey = ref<CryptoKey | null>(null)

export interface MigrationProgress {
  done: number
  total: number
}

export function useJournalEncryption() {
  const toast = useToast()
  const config = useRuntimeConfig()

  const isUnlocked = computed(() => enabled.value && dataKey.value !== null)

  async function refreshStatus() {
    try {
      const result = await $fetch<{ enabled: boolean }>('/api/journal/encryption/status')
      enabled.value = result.enabled
    } finally {
      statusLoaded.value = true
    }
  }

  function lock() {
    dataKey.value = null
  }

  async function activate(passphrase: string): Promise<{ recoveryCode: string } | null> {
    const publicKey = config.public.journalRecoveryPublicKey as string
    if (!publicKey) {
      toast.add({ title: 'Erro', description: 'Criptografia indisponível no momento — tente novamente mais tarde.', color: 'error' })
      return null
    }

    try {
      const recoveryCode = generateRecoveryCode()
      const newDataKey = await generateDataKey()

      const passwordSalt = generateSaltB64()
      const recoverySalt = generateSaltB64()
      const passwordWrappingKey = await deriveWrappingKey(passphrase, passwordSalt, KDF_ITERATIONS)
      const recoveryWrappingKey = await deriveWrappingKey(recoveryCode, recoverySalt, KDF_ITERATIONS)

      const passwordWrap = await wrapWithAesKey(newDataKey, passwordWrappingKey)
      const recoveryWrap = await wrapWithAesKey(newDataKey, recoveryWrappingKey)
      const adminWrap = await wrapWithRsaPublicKey(newDataKey, publicKey)

      await $fetch('/api/journal/encryption/setup', {
        method: 'POST',
        body: {
          dataKeyWrappedPassword: passwordWrap.wrapped,
          dataKeyWrappedPasswordIv: passwordWrap.iv,
          passwordSalt,
          dataKeyWrappedRecovery: recoveryWrap.wrapped,
          dataKeyWrappedRecoveryIv: recoveryWrap.iv,
          recoverySalt,
          dataKeyWrappedAdmin: adminWrap,
          kdfIterations: KDF_ITERATIONS
        }
      })

      dataKey.value = newDataKey
      enabled.value = true
      return { recoveryCode }
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível ativar a criptografia.', color: 'error' })
      return null
    }
  }

  async function unlock(secret: string, kind: 'password' | 'recovery'): Promise<boolean> {
    try {
      const keys = await $fetch<JournalEncryptionKeys>('/api/journal/encryption/keys')
      const salt = kind === 'password' ? keys.passwordSalt : keys.recoverySalt
      const wrapped = kind === 'password' ? keys.dataKeyWrappedPassword : keys.dataKeyWrappedRecovery
      const wrappedIv = kind === 'password' ? keys.dataKeyWrappedPasswordIv : keys.dataKeyWrappedRecoveryIv

      const wrappingKey = await deriveWrappingKey(secret, salt, keys.kdfIterations)
      // unwrapKey rejeita (lança) se a chave de embrulho estiver errada — o
      // tag de autenticação do AES-GCM não bate. Isso é o "PIN incorreto"
      // desta camada, só que sem lockout no servidor (ver seção 2.4 do
      // plano: a frase-secreta é forte o bastante pra não precisar disso).
      const unwrapped = await unwrapWithAesKey(wrapped, wrappedIv, wrappingKey)
      dataKey.value = unwrapped
      return true
    } catch {
      return false
    }
  }

  async function changePassphrase(newPassphrase: string): Promise<boolean> {
    if (!dataKey.value) {
      toast.add({ title: 'Erro', description: 'Desbloqueie o diário antes de trocar a frase-secreta.', color: 'error' })
      return false
    }
    try {
      const passwordSalt = generateSaltB64()
      const wrappingKey = await deriveWrappingKey(newPassphrase, passwordSalt, KDF_ITERATIONS)
      const wrap = await wrapWithAesKey(dataKey.value, wrappingKey)

      await $fetch('/api/journal/encryption/password', {
        method: 'PATCH',
        body: {
          dataKeyWrappedPassword: wrap.wrapped,
          dataKeyWrappedPasswordIv: wrap.iv,
          passwordSalt,
          kdfIterations: KDF_ITERATIONS
        }
      })

      toast.add({ title: 'Frase-secreta alterada', description: 'A nova frase já está em vigor.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível trocar a frase-secreta.', color: 'error' })
      return false
    }
  }

  // Busca todas as entradas (paginado) e aplica `fn` em cada uma — usado
  // tanto pra cifrar tudo na ativação quanto pra decifrar tudo na
  // desativação (mesmo laço, direção oposta).
  async function forEachEntry(fn: (entry: JournalEntry) => Promise<void>, onProgress?: (p: MigrationProgress) => void) {
    let page = 1
    let total = Infinity
    let done = 0
    while ((page - 1) * MIGRATION_PAGE_SIZE < total) {
      const result = await $fetch<JournalListResponse>('/api/journal/entries', {
        query: { page, pageSize: MIGRATION_PAGE_SIZE }
      })
      total = result.total
      for (const entry of result.data) {
        await fn(entry)
        done++
        onProgress?.({ done, total })
      }
      if (result.data.length === 0) break
      page++
    }
  }

  // Roda depois de activate() — cifra tudo que ainda está em claro.
  // Resume-safe: pula qualquer entrada que já tenha `isEncrypted: true`
  // (relevante se a aba fechou no meio de uma migração anterior).
  async function migrateToEncrypted(onProgress?: (p: MigrationProgress) => void): Promise<boolean> {
    if (!dataKey.value) return false
    try {
      await forEachEntry(async (entry) => {
        if (entry.isEncrypted) return
        const contentEnc = await encryptText(dataKey.value!, entry.content)
        const titleEnc = entry.title ? await encryptText(dataKey.value!, entry.title) : null
        await $fetch('/api/journal/entries', {
          method: 'POST',
          body: {
            entryDate: entry.entryDate,
            title: titleEnc ? titleEnc.ciphertext : null,
            content: contentEnc.ciphertext,
            mood: entry.mood,
            isEncrypted: true,
            contentIv: contentEnc.iv,
            titleIv: titleEnc ? titleEnc.iv : null
          }
        })
      }, onProgress)
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'A migração das entradas existentes parou no meio — tente novamente.', color: 'error' })
      return false
    }
  }

  // Desativa: decifra tudo de volta pra texto claro antes de apagar as
  // chaves — sem isso, as entradas cifradas ficariam ilegíveis pra sempre
  // (o servidor nunca teve a Data Key).
  async function disable(): Promise<boolean> {
    if (!dataKey.value) {
      toast.add({ title: 'Erro', description: 'Desbloqueie o diário antes de desativar a criptografia.', color: 'error' })
      return false
    }
    try {
      await forEachEntry(async (entry) => {
        if (!entry.isEncrypted) return
        const content = await decryptText(dataKey.value!, entry.content, entry.contentIv!)
        const title = entry.title && entry.titleIv ? await decryptText(dataKey.value!, entry.title, entry.titleIv) : entry.title
        await $fetch('/api/journal/entries', {
          method: 'POST',
          body: {
            entryDate: entry.entryDate,
            title,
            content,
            mood: entry.mood,
            isEncrypted: false,
            contentIv: null,
            titleIv: null
          }
        })
      })

      await $fetch('/api/journal/encryption', { method: 'DELETE' })
      dataKey.value = null
      enabled.value = false
      toast.add({ title: 'Criptografia desativada', description: 'As entradas voltaram a ficar em texto claro.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível desativar a criptografia — algumas entradas podem ter ficado cifradas.', color: 'error' })
      return false
    }
  }

  async function encryptEntryFields(title: string | null, content: string) {
    if (!dataKey.value) throw new Error('journal encryption is locked')
    const contentEnc = await encryptText(dataKey.value, content)
    const titleEnc = title ? await encryptText(dataKey.value, title) : null
    return {
      title: titleEnc ? titleEnc.ciphertext : null,
      titleIv: titleEnc ? titleEnc.iv : null,
      content: contentEnc.ciphertext,
      contentIv: contentEnc.iv,
      isEncrypted: true as const
    }
  }

  async function decryptEntryFields(entry: Pick<JournalEntry, 'title' | 'content' | 'titleIv' | 'contentIv' | 'isEncrypted'>) {
    if (!entry.isEncrypted) return { title: entry.title, content: entry.content }
    if (!dataKey.value) throw new Error('journal encryption is locked')
    const content = await decryptText(dataKey.value, entry.content, entry.contentIv!)
    const title = entry.title && entry.titleIv ? await decryptText(dataKey.value, entry.title, entry.titleIv) : entry.title
    return { title, content }
  }

  return {
    statusLoaded,
    enabled,
    isUnlocked,
    refreshStatus,
    lock,
    activate,
    unlock,
    changePassphrase,
    migrateToEncrypted,
    disable,
    encryptEntryFields,
    decryptEntryFields
  }
}
