# Plano — Criptografia ponta-a-ponta (E2EE) para o Diário de Bordo

> **Este documento não implementa nada.** É análise de mercado + proposta de arquitetura para revisão — item 16 de `ANALISE_DIARIO_MERCADO.md` ("maior esforço da lista... muda o modelo de armazenamento inteiro"). Depois que os pontos em aberto da seção 3 forem decididos, escrevo o plano de execução final (schema exato, endpoints, componentes) no mesmo nível de detalhe do que foi feito para o PIN lock (`1.JOURNAL.md`, seção 13).

---

## 1. Como os concorrentes fazem

Pesquisado agora (fontes ao final do documento) em vez de assumido — a arquitetura de E2EE de app pra app é bem mais uniforme do que a superfície de produto sugere.

### 1.1 Day One

- Cifra de conteúdo: **AES-GCM-256**.
- A chave de criptografia fica **no dispositivo**; opcionalmente faz backup automático no iCloud (só ecossistema Apple) por conveniência.
- **Sem recuperação pelo servidor**: se a pessoa perde a chave e não tem backup no iCloud nem cópia salva à mão, o conteúdo fica ilegível para sempre — nem o suporte da Day One consegue ajudar além de confirmar se um backup existe.
- **Nem tudo é criptografado**: o texto da entrada é, mas metadados de sincronização (timestamps, dimensões de imagem, informação de dispositivo, contagens agregadas) **não são** — ficam em claro no servidor porque a sincronização/indexação precisa deles.
- E2EE é o padrão em journals novos desde a v4.2, incluído até no plano gratuito (não é feature paga).

### 1.2 Standard Notes (a referência técnica mais documentada da categoria "notas/journal")

- Cifra de conteúdo: **XChaCha20-Poly1305**.
- Derivação de chave a partir da senha: **Argon2** (memory-hard — deliberadamente caro de rodar em GPU/ASIC, ao contrário de um hash rápido).
- **Zero-knowledge de verdade**: o servidor guarda só blobs cifrados; a senha nunca sai do dispositivo. No login, o servidor devolve "parâmetros de autenticação" (não-secretos — sal, custo do KDF) que o cliente usa para re-derivar a mesma chave localmente; o servidor nunca vê a chave nem a senha em claro.
- Arquitetura pensada para tratar o **servidor como não-confiável por padrão** — o cliente (app) é a única peça que precisa ser confiável.
- Tem um fluxo de "atualização de segurança" que gera uma nova versão de chave/algoritmo para contas antigas sem perder o histórico.

### 1.3 Joplin (open-source, especificação pública)

- Padrão de **chave em duas camadas** ("envelope encryption"): a pessoa escolhe uma Master Password, que criptografa uma **Master Key** gerada aleatoriamente; é a Master Key (não a senha) que efetivamente cifra as notas.
- Essa indireção é o que permite trocar a senha sem re-criptografar todo o histórico — só se "reembrulha" a Master Key com a nova senha derivada.
- Multi-dispositivo é manual: E2EE é ativado num aparelho primeiro (gera a Master Key), sincroniza, e cada novo aparelho pede a senha pra decifrar a Master Key que já veio sincronizada.
- **Sem recuperação de senha** — declarado explicitamente na documentação.

### 1.4 Bitwarden (gerenciador de senhas — categoria diferente, mas é a arquitetura zero-knowledge mais auditada e documentada publicamente; útil como referência de "como fazer certo")

- **PBKDF2-HMAC-SHA256, 600.000 iterações**, sal = e-mail do usuário → deriva uma Master Key de 256 bits.
- Essa Master Key passa por **HKDF** e vira uma "Stretched Master Key" de 512 bits.
- A Stretched Master Key decifra uma **"Protected Symmetric Key"** guardada no servidor (já cifrada) — é essa chave simétrica, não a senha nem a Master Key, que efetivamente cifra/decifra os dados do cofre (AES-256).
- Mesmo padrão de duas camadas do Joplin (senha → chave intermediária → chave real dos dados), só que com mais uma etapa de stretching. Permite trocar a senha "master" reembrulhando a chave real, sem tocar nos dados.
- Também oferece **Argon2id** como alternativa ao PBKDF2 para quem quer.

### 1.5 Diarium

- Documentação pública fraca sobre a arquitetura exata ("criptografia de ponta" sem especificar algoritmo/KDF).
- Resposta alternativa ao mesmo problema: **armazenamento 100% local**, sem sync na nuvem — evita o problema de "servidor vê o dado" simplesmente não tendo servidor no caminho. Não é E2EE (não tem nem sincronização pra proteger), é uma categoria de solução diferente.

### 1.6 O padrão que se repete em todo mundo que faz certo

Apesar dos nomes de algoritmo variarem, a arquitetura é a mesma nos quatro relevantes (Day One, Standard Notes, Joplin, Bitwarden):

1. **KDF lento e com sal** (PBKDF2 com iteração alta, ou Argon2id memory-hard) transforma a senha/frase da pessoa numa chave — nunca a senha crua é usada direto pra cifrar nada.
2. **Chave de dados separada, gerada aleatoriamente** — a chave derivada da senha não cifra o conteúdo diretamente; ela só "embrulha" (cifra) uma segunda chave aleatória, e é essa segunda chave que cifra o conteúdo de verdade. Isso é o que permite trocar a senha sem re-processar todo o histórico.
3. **Cifra autenticada** pro conteúdo em si (AES-256-GCM ou XChaCha20-Poly1305 — os dois dão confidencialidade + integridade no mesmo passo).
4. **Metadados ficam em claro, deliberadamente** — datas, contagens, tamanhos de arquivo, e (no caso do Diário) provavelmente humor/streak — porque funcionalidades básicas (ordenar, listar, calcular sequência) dependeriam de decifrar tudo toda hora se esses campos também fossem cifrados.
5. **Sem recuperação server-side, por padrão** — é o preço de ser E2EE de verdade: se o servidor pudesse recuperar sua senha/chave, ele teria acesso aos dados, e não seria mais "zero-knowledge". Day One amacia isso com um backup automático (só dentro do ecossistema Apple, não é uma "rede de segurança" universal); Joplin e o modelo Bitwarden não amaciam nada.

---

## 2. Decisões em aberto (preciso da sua confirmação antes do plano final)

Estas são as mesmas perguntas que eu ia fazer via pergunta interativa — documentadas aqui pra você revisar com calma, com a recomendação e o porquê de cada uma:

### 2.1 Recuperação — decidido: suporte precisa conseguir ajudar

**Você pediu explicitamente**: se a pessoa perder a senha, o suporte precisa ter uma forma de intervir. Isso muda a resposta da seção anterior — o padrão "zero-knowledge puro" dos concorrentes pesquisados (seção 1) **não permite isso por definição**: se qualquer parte além da própria pessoa consegue decifrar os dados, tecnicamente já não é zero-knowledge no sentido estrito. Não tem como ter as duas coisas ("nem a empresa consegue acessar" **e** "o suporte consegue ajudar") ao mesmo tempo — é preciso escolher, e a escolha muda a promessa de privacidade que dá pra fazer publicamente (de "nem nós conseguimos ler" pra "protegido contra vazamento de banco de dados, com um caminho de recuperação controlado e auditável para casos de suporte").

Dado isso, a arquitetura muda de "1 chave embrulhada" (seção 1.6) para **"chave embrulhada de 3 formas diferentes"** — a mesma Data Key (a chave real que cifra o conteúdo) é cifrada três vezes, cada cópia guardada separadamente, e qualquer uma das três destrava a mesma chave:

1. **Cópia da pessoa** — cifrada com a chave derivada da frase-secreta dela (KDF, seção 1.6).
2. **Cópia do código de recuperação** — cifrada com uma chave derivada de um código gerado uma vez, que a pessoa salva por fora (mesma ideia da tabela anterior, mantida como primeira linha de defesa antes de precisar do suporte).
3. **Cópia de recuperação do suporte** — cifrada com uma **chave pública** de um par de chaves assimétrico (ex. X25519) que só o Kortex controla.

O ponto crítico do item 3, pra isso não virar "a mesma coisa que não ter criptografia nenhuma": a **chave privada** que consegue abrir essa terceira cópia **não pode morar no servidor rodando** (nem variável de ambiente, nem Supabase, nem nada que o app em produção consegue ler sozinho) — só a chave pública fica no código/config (ela só serve pra cifrar, não pra abrir nada, então não tem problema ela ser conhecida). A chave privada fica guardada **fora** da infraestrutura do app — um cofre de segredos separado, um gerenciador de senhas, um HSM, ou até offline — e só é usada manualmente, por uma pessoa autorizada, quando um caso de suporte legítimo (com verificação de identidade) precisa dela. Isso significa:

- Uma invasão só ao banco de dados/servidor rodando **não** dá acesso ao conteúdo de ninguém — o invasor teria os blobs cifrados dos três jeitos, mas não a chave privada de recuperação.
- Recuperar o acesso de alguém exige uma ação deliberada e rastreável de quem tem a chave privada — não é algo automático nem exposto por nenhuma rota da API.
- Isso é uma real diminuição de garantia de privacidade em comparação com Standard Notes/Joplin/Bitwarden (que não têm essa terceira cópia) — é uma escolha consciente sua, documentada aqui, não um acidente.

**Consequência prática de operação (não é só código)**: você (ou quem administrar o Kortex) precisa gerar esse par de chaves uma vez, guardar a privada num lugar seguro fora do projeto, e existir um processo (mesmo que manual/script de linha de comando rodado à mão) para usá-la quando um pedido de suporte legítimo chegar. Isso está fora do que dá pra automatizar com segurança — se virasse um botão "resetar senha do usuário X" dentro do painel admin do app, a chave privada precisaria estar acessível ao servidor rodando, e aí voltamos ao problema de "uma invasão ao servidor destrava tudo".

### 2.2 Busca por texto

Hoje `GET /api/journal/entries?q=...` faz `ilike` no servidor sobre `title`/`content`. Com conteúdo cifrado, o servidor não consegue mais fazer isso — o texto que ele vê é ruído.

| Opção | Trade-off |
| --- | --- |
| **Busca no cliente** — carrega as entradas (paginadas ou não), decifra no navegador, filtra localmente | Funciona bem pra um diário pessoal (não são milhões de linhas), mas muda o padrão atual de "busca sob demanda no servidor" pra "carrega mais dado, decifra localmente". **Recomendação**, com paginação ainda existindo pro modo sem busca (não precisa baixar tudo sempre). |
| **Remover a busca por texto** | Mais simples, mas é regressão de funcionalidade real — perde o único jeito de achar uma entrada antiga por palavra-chave, só sobra calendário/lista cronológica. |

### 2.3 O que fica criptografado

Seguindo o padrão da seção 1.6 (item 4):

- **Recomendação**: `title` + `content` cifrados. `mood`, `entryDate`, `locked` (o cadeado por entrada do PIN, seção 13 de `1.JOURNAL.md`), `createdAt`/`updatedAt`, e `archivedAt` continuam em claro — são exatamente os campos que o calendário, o cálculo de streak, a correlação humor×métricas (se um dia voltar, ver seção 7 de `1.JOURNAL.md` sobre métricas) e a listagem cronológica precisam ler sem decifrar nada.
- Criptografar humor também é possível, mas quebra o calendário (emoji por dia) e qualquer análise futura de humor — seguiria o mesmo problema que motivou o Day One a deixar metadados em claro.

### 2.4 Relação com o PIN já existente (seção 13 de `1.JOURNAL.md`)

**Importante, não é só preferência — tem uma pegadinha de segurança real aqui**: o PIN atual é de **4 dígitos**, verificado no servidor com um lockout progressivo. Isso é seguro *porque* o servidor limita as tentativas — offline, um PIN de 4 dígitos é só 10.000 combinações, trivial de forçar em milissegundos.

Uma chave de criptografia real precisa ser forte o bastante pra resistir a um ataque **offline** (alguém que roubou o banco de dados cifrado e pode tentar quantas vezes quiser, sem servidor nenhum no meio pra limitar tentativas). Usar o PIN de 4 dígitos como a senha de criptografia seria uma vulnerabilidade grave, não uma conveniência.

- **Recomendação**: a frase-secreta de criptografia é **um segredo novo e diferente do PIN**, com requisito mínimo de tamanho bem maior (ex.: 12+ caracteres, ou uma frase). O PIN continua existindo como está, como tela de privacidade separada — não muda de comportamento.

---

## 3. Arquitetura proposta (pendente das decisões abertas restantes)

Assumindo as recomendações da seção 2 (recuperação em 3 camadas incluindo suporte, busca no cliente, título+conteúdo cifrados, frase-secreta separada do PIN):

### 3.1 Primitivas criptográficas

- **Cifra de conteúdo**: `AES-256-GCM` via `SubtleCrypto` (Web Crypto API nativa do navegador — sem dependência nova).
- **KDF** (deriva a chave da frase-secreta e do código de recuperação): a Web Crypto API só tem `PBKDF2` nativamente (não tem Argon2id nativo em nenhum navegador) — usar `PBKDF2` com iteração alta (≥ 600.000, mesmo número que o Bitwarden usa hoje) é a opção sem dependência extra. Argon2id exigiria uma lib WASM (ex. `argon2-browser`) — mais forte contra hardware dedicado, mas é uma dependência nova e mais peso no bundle client-side. **A decidir**: PBKDF2 nativo (mais simples) vs. Argon2id via WASM (mais forte, mais peso).
- **Cifra assimétrica pro terceiro embrulho** (recuperação via suporte, seção 2.1): X25519 (via `SubtleCrypto`/uma lib leve tipo `libsodium-wrappers`, já que `SubtleCrypto` nativo não tem X25519 em todo navegador ainda — a decidir na hora de implementar qual caminho o navegador-alvo suporta) para cifrar a Data Key com a chave pública do Kortex.
- **Padrão "chave embrulhada 3 vezes"** (seção 2.1): uma Data Key aleatória (gerada uma vez, por conta) cifra de fato `title`/`content` de cada entrada. Ela é cifrada (embrulhada) três vezes, cada cópia guardada separadamente: (1) pela chave derivada da frase-secreta da pessoa, (2) pela chave derivada do código de recuperação pessoal, (3) pela chave pública do par de recuperação do Kortex. Trocar a frase-secreta = só re-embrulhar a cópia 1, não re-cifrar o histórico inteiro.
- **Pré-requisito operacional, fora do código**: antes de qualquer implementação, gerar o par de chaves de recuperação do Kortex (a pública entra no repo/config; a privada é gerada e guardada por você **fora** de qualquer coisa que o app em produção consiga ler — ver seção 2.1). Isso precisa existir antes da primeira pessoa ativar E2EE, porque toda ativação já grava a cópia 3 usando essa chave pública.

### 3.2 Onde isso muda o código existente

Praticamente todo lugar que hoje lê/escreve `title`/`content` de `journal_entries`:

- **Schema**: `journal_entries` ganha algo como `content_encrypted boolean`, e os campos que hoje guardam JSON do Tiptap em claro passam a guardar o blob cifrado (base64) + o IV usado. Precisa de uma tabela nova (`journal_encryption_keys` ou similar) pra guardar as **três** cópias embrulhadas da Data Key por usuário (frase-secreta, código de recuperação, chave pública do Kortex) — cada uma com seu próprio blob + IV/nonce, já que são cifradas por chaves diferentes.
- **Todas as rotas `server/api/journal/entries*`**: passam a receber/devolver `content`/`title` já cifrados do lado do cliente — o servidor nunca vê texto claro, só grava/lê blobs. `GET /api/journal/entries?q=` perde o `ilike` (seção 2.2).
- **`TodayEditor.vue`, `EntryDetailModal.vue`**: cifram antes de `POST`, decifram depois de `GET` — a chave de dados precisa estar disponível em memória no cliente (desbloqueada com a frase-secreta, sessão do navegador, mesmo padrão de "dura até fechar a aba" do PIN).
- **`EntryList.vue`**: busca deixa de vir do servidor; passa a filtrar sobre entradas já decifradas no cliente (seção 2.2).
- **`server/api/life/dashboard.get.ts` / `DashboardQuickJournal.vue`**: já não conseguem mostrar preview nenhum, porque o servidor não decifra — vira sempre um estado "Diário protegido" (mesmo tratamento que já existe hoje quando o PIN em modo "módulo" está ativo).
- **Entradas antigas (já em texto claro no banco)**: precisam de uma migração feita no cliente — buscar tudo, cifrar com a Data Key nova, regravar. É uma operação de "ativar E2EE" que roda uma vez, precisa de UI própria (barra de progresso, confirmação).
- **Tela de configuração** (nova, ao lado do card de PIN em Configurações → Segurança): ativar/desativar E2EE, trocar a frase-secreta, exibir o código de recuperação uma vez.

### 3.3 O que NÃO muda

- `mood`, `entryDate`, `locked`, streak, calendário, distribuição por dia da semana do painel de Insights (seção 8 de `1.JOURNAL.md`) — tudo isso continua em texto claro no servidor, pela razão da seção 2.3.
- O PIN lock (seção 13 de `1.JOURNAL.md`) continua existindo do jeito que está, como camada separada.

---

## 4. Riscos e o que fica fora de escopo deste primeiro plano

- **Custódia da chave privada de recuperação do suporte é o risco mais crítico do design inteiro** (seção 2.1) — ela é, na prática, a chave mestra que consegue abrir os dados de qualquer pessoa que tenha ativado E2EE. Se ela vazar ou ficar guardada num lugar frouxo (ex. um arquivo solto no computador de alguém, um e-mail), toda a garantia de "servidor não consegue ler" desmorona de uma vez, pra todo mundo. Se ela for perdida (sem backup nenhum), o suporte perde a capacidade de ajudar — mas os dados dos usuários continuam seguros (a pessoa ainda tem a senha e/ou o código de recuperação dela). Isso não é um detalhe de implementação, é uma responsabilidade operacional contínua sua.
- **Verificação de identidade no atendimento de suporte** também fica fora do código — antes de usar a chave privada pra ajudar alguém, precisa de um processo (mesmo que manual) pra confirmar que quem está pedindo é de fato o dono da conta, senão a "recuperação assistida" vira um vetor de engenharia social pra acessar o diário de outra pessoa.
- **Perda de dados por esquecimento** ainda é um risco de produto mesmo com a rede de segurança do suporte — mesmo com código de recuperação (seção 2.1), a pessoa pode perder os dois *e* não conseguir passar pela verificação de identidade do suporte. Precisa de copy/UX bem feito avisando disso no momento de ativar, não só um checkbox de termos.
- **Multi-dispositivo (web + app Capacitor) já funciona sem trabalho extra — correção de uma suposição errada deste documento**: o Kortex já empacota o mesmo build via Capacitor (`capacitor.config.ts`, `webDir: '.output/public'`, roda no WKWebView do iOS e no WebView do sistema no Android, ambos com suporte nativo completo à Web Crypto API). Ao contrário do Joplin (que precisa "ativar num aparelho e importar nos outros via senha" porque não tem servidor central guardando a chave embrulhada), aqui as 3 cópias da Data Key já ficam no servidor (`journal_encryption`) — qualquer dispositivo com a mesma frase-secreta (ou o código de recuperação) já consegue buscar as cópias e desembrulhar localmente, sem nenhum passo de "parear" ou "exportar/importar" dispositivo. **Único ponto de atenção real**: `app/utils/journal-crypto.ts` é o primeiro código deste projeto a usar `crypto.subtle` — vale um smoke test num build nativo de verdade (`npm run cap:sync` + rodar no dispositivo/emulador) antes de considerar a cobertura mobile confirmada, já que não há uso anterior comprovado dessa API no WebView deste app especificamente.
- **Migração de entradas antigas** (seção 3.2) é o pedaço com mais risco de bug real — é a única operação que lê/regrava todo o histórico de uma vez; precisa de teste cuidadoso antes de rodar em produção.
- **Fora de escopo deste plano**: criptografar `mood`/métricas (seção 2.3 já recomenda não fazer) e biometria/WebAuthn como segundo fator de desbloqueio.

---

## Fontes

- [End-to-End Encryption FAQ — Day One](https://dayoneapp.com/guides/day-one-sync/end-to-end-encryption-faq/)
- [End-to-End Encryption for Your Journal — Day One](https://dayoneapp.com/features/end-to-end-encryption/)
- [Finding a Lost Encryption Key — Day One](https://dayoneapp.com/guides/troubleshooting/finding-a-lost-encryption-key/)
- [Keeping Your Day One Encryption Key Safe](https://dayoneapp.com/guides/tips-and-tutorials/keeping-your-day-one-encryption-key-safe/)
- [Security & Encryption — Standard Notes](https://standardnotes-app.com/security.php)
- [Security Updates — Standard Notes](https://standardnotes.com/help/security)
- [End-To-End Encryption (E2EE) — Joplin](https://joplinapp.org/help/apps/sync/e2ee/)
- [Encryption — Joplin dev spec](https://joplinapp.org/help/dev/spec/e2ee/)
- [Native Encryption Method Specification — Joplin](https://joplinapp.org/help/dev/spec/e2ee/native_encryption/)
- [Encryption Key Derivation — Bitwarden](https://bitwarden.com/help/kdf-algorithms/)
- [Bitwarden Security Whitepaper](https://bitwarden.com/help/bitwarden-security-white-paper/)
- [How Bitwarden Encrypts and Decrypts Secrets](https://blog.miguelgrinberg.com/post/how-bitwarden-encrypts-and-decrypts-secrets)
- [Diarium Privacy Policy](https://timopartl.com/privacypolicy?app=Diarium)
- [Encrypted Journal & Diary App, Fully Offline — Mini Diarium](https://mini-diarium.com/encrypted-journal/)
