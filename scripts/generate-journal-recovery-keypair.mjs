#!/usr/bin/env node
// Gera o par de chaves de recuperação (suporte) do Diário de Bordo — ver
// docs/journal/PLANO_CRIPTOGRAFIA_PONTA_A_PONTA.md, seção "Recuperação".
//
// Rode isso VOCÊ MESMO, localmente — não peça pra rodar dentro de uma
// sessão de IA nem cole a saída em nenhum chat. A chave privada impressa
// aqui é o que permite ajudar alguém que perdeu a senha/código de
// recuperação; ela precisa ficar fora do repositório, fora do .env que o
// app em produção lê, e fora de qualquer log — guarde num gerenciador de
// senhas ou cofre de segredos separado.
//
// Uso: node scripts/generate-journal-recovery-keypair.mjs

const { subtle } = globalThis.crypto

function toBase64(buffer) {
  return Buffer.from(buffer).toString('base64')
}

const keyPair = await subtle.generateKey(
  { name: 'RSA-OAEP', modulusLength: 4096, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true,
  ['wrapKey', 'unwrapKey']
)

const publicKeySpki = toBase64(await subtle.exportKey('spki', keyPair.publicKey))
const privateKeyPkcs8 = toBase64(await subtle.exportKey('pkcs8', keyPair.privateKey))

console.log('\n=== Chave PÚBLICA (vai no .env do app, é segura de expor) ===\n')
console.log(`NUXT_PUBLIC_JOURNAL_RECOVERY_PUBLIC_KEY=${publicKeySpki}\n`)

console.log('=== Chave PRIVADA (NÃO vai no .env do app — guarde fora do repositório) ===\n')
console.log(privateKeyPkcs8)
console.log('\nSalve a chave privada acima num gerenciador de senhas ou cofre de segredos')
console.log('separado do projeto AGORA. Sem ela, nunca mais vai dar pra recuperar o acesso')
console.log('de alguém que perder a senha e o código de recuperação pessoal ao mesmo tempo.')
console.log('Ela não fica salva em nenhum arquivo por este script — se você fechar o')
console.log('terminal sem copiar, precisa gerar um par novo (e todo mundo que já ativou')
console.log('criptografia com o par antigo perde a via de recuperação pelo suporte).\n')
