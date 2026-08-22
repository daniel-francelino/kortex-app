# Plano — Compartilhamento público e edição offline (Notas)

Este documento detalha duas iniciativas grandes para o módulo Notas que foram marcadas como "fora de escopo" na primeira versão de `docs/ANALISE_EDITOR_MERCADO.md` e agora foram priorizadas:

1. **Compartilhamento** — nota configurável como privada, compartilhada com pessoas específicas, ou pública (link).
2. **Modo offline** — criar/editar notas sem conexão, com sincronização automática quando a conexão voltar.

Este é o documento de especificação, quebrado em **fases entregáveis independentemente** — cada fase tem objetivo, o que muda no schema/backend/frontend, arquivos esperados, critérios de aceite e riscos.

> **Status**: Parte A (Compartilhamento) e a maior parte da Parte B (Offline) já foram implementadas — ver o checklist no fim do documento para o que falta. As seções abaixo continuam descrevendo o desenho original; onde a implementação real divergiu ou reduziu escopo deliberadamente, há uma nota "⚠️ Nota de implementação" no fim da fase correspondente.

---

## 0. Ordem recomendada e por quê

**Sugestão: implementar Compartilhamento (Parte A) inteiro antes de começar Offline (Parte B).**

- Compartilhamento é uma feature **contida**: schema novo + RLS + um punhado de endpoints + uma tela nova + um botão no editor. Todas as fases de A são pequenas e testáveis isoladamente, e o valor aparece rápido (dá pra enviar a Fase A1+A2 e já ter compartilhamento funcional via API, mesmo antes da UI).
- Offline é **transversal**: toca a fila de escrita de *todas* as ações do módulo (o gerenciador otimista inteiro), precisa de uma camada de persistência local nova (IndexedDB) e de um motor de sincronização com resolução de conflito — é o tipo de trabalho que se beneficia de o resto do módulo (compartilhamento incluso) já estar estável, para não ter que re-testar sincronização em cima de um schema que ainda está mudando.
- As duas iniciativas são **desacopladas no código** (não há dependência técnica direta), então essa ordem é uma recomendação de sequenciamento de risco/valor, não uma dependência obrigatória — dá para inverter se a prioridade de negócio for offline primeiro.

---

# PARTE A — Compartilhamento de notas

## A.1 Modelo de visibilidade

Três níveis, cobrindo desde "só eu vejo" até "qualquer um com o link":

| Nível | Quem acessa | Precisa de conta? |
| --- | --- | --- |
| **Privada** (padrão) | Só o dono | — |
| **Compartilhada** | Pessoas específicas que o dono adicionou (por e-mail) | Sim, para quem já tem conta; convite pendente para quem não tem |
| **Pública** | Qualquer pessoa com o link | Não |

Cada pessoa com quem uma nota é compartilhada (nível "Compartilhada") tem uma **permissão**: `view` (só leitura) ou `edit` (pode editar o conteúdo). No nível "Pública", a permissão é sempre `view` — não deve ser possível edição anônima por padrão (ver A.6, "Decisões de segurança").

---

## Fase A1 — Modelo de dados e RLS

**Objetivo:** ter o schema e as regras de acesso prontos e testáveis via SQL/Supabase Studio, antes de qualquer código de aplicação.

### Migração 1 — colunas de visibilidade em `notes`

Arquivo sugerido: `supabase/migrations/<timestamp>_notes_sharing_visibility.sql`

```sql
alter table notes
  add column visibility text not null default 'private'
    check (visibility in ('private', 'shared', 'public')),
  add column share_token text unique,
  add column share_token_created_at timestamptz;

create index idx_notes_share_token on notes(share_token) where share_token is not null;
create index idx_notes_visibility on notes(visibility) where visibility <> 'private';
```

- `share_token`: gerado (ex.: `nanoid(32)` ou `encode(gen_random_bytes(24), 'base64url')`) só quando a nota vira `public` pela primeira vez. Fica guardado mesmo se a nota voltar a ser privada (não precisa apagar), mas o endpoint público sempre revalida `visibility = 'public'` antes de servir qualquer conteúdo — então voltar para privada corta o acesso instantaneamente, mesmo que alguém ainda tenha o link salvo.
- "Gerar novo link" = trocar `share_token` por um novo valor, invalidando o antigo (útil se o link vazou).
- `idx_notes_visibility` (índice parcial) acelera qualquer listagem futura de "minhas notas públicas/compartilhadas" sem pesar nas queries normais (que são maioria `private`).

### Migração 2 — tabela `note_shares`

Arquivo sugerido: `supabase/migrations/<timestamp>_notes_share_grants.sql`

```sql
create table note_shares (
  id uuid primary key default gen_random_uuid(),
  note_id uuid not null references notes(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shared_with_user_id uuid references auth.users(id) on delete cascade,
  shared_with_email text not null,
  permission text not null default 'view' check (permission in ('view', 'edit')),
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  unique (note_id, shared_with_email)
);

create index idx_note_shares_note_id on note_shares(note_id);
create index idx_note_shares_user_id on note_shares(shared_with_user_id);
create index idx_note_shares_pending_email on note_shares(shared_with_email) where status = 'pending';
```

- `shared_with_email` é sempre preenchido (é o que o dono digita). `shared_with_user_id` é preenchido quando/se aquele e-mail corresponder a uma conta existente — resolvido no momento do convite (`POST /api/notes/:id/shares` já faz um lookup por e-mail), ou depois, na Fase A3 (reconciliação no login).
- `status`: `pending` até a pessoa efetivamente acessar/aceitar; não bloqueia o acesso (a pessoa já pode abrir a nota assim que `shared_with_user_id` estiver preenchido), é só para o dono saber se o convite já foi "usado" na UI de gestão de acesso.
- `idx_note_shares_pending_email` sustenta a query de reconciliação da Fase A3 (`where shared_with_email = :email and status = 'pending'`).

### Migração 3 — policies de RLS

Arquivo sugerido: `supabase/migrations/<timestamp>_notes_sharing_rls.sql`

```sql
-- Leitura: dono (já existe) + pessoa com share aceito/pendente cujo user_id já foi resolvido
create policy "notes_select_shared"
  on notes for select
  using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
        and note_shares.shared_with_user_id = auth.uid()
    )
  );

-- Edição: só quem tem permission = 'edit'
create policy "notes_update_shared_edit"
  on notes for update
  using (
    exists (
      select 1 from note_shares
      where note_shares.note_id = notes.id
        and note_shares.shared_with_user_id = auth.uid()
        and note_shares.permission = 'edit'
    )
  );

-- note_shares: dono gerencia; convidado só enxerga a própria linha
create policy "note_shares_owner_all"
  on note_shares for all
  using (owner_id = auth.uid());

create policy "note_shares_recipient_select"
  on note_shares for select
  using (shared_with_user_id = auth.uid());
```

> O acesso **público** (nível "Pública", sem login) **não** passa por RLS de usuário autenticado — não há `auth.uid()` nesse caso. Ele é resolvido no backend com a service role (o mesmo padrão já usado em todos os outros endpoints deste projeto), com a checagem `where share_token = :token and visibility = 'public'` feita manualmente no endpoint (Fase A2). Isso é intencional e está detalhado em A.6.

**Critérios de aceite da Fase A1:**
- Três migrações aplicadas sem erro em ambiente de desenvolvimento (`supabase db push` ou equivalente).
- Testável direto no SQL editor do Supabase Studio: criar uma nota, um `note_shares` de teste, confirmar que a policy de select funciona simulando `auth.uid()`.
- Nenhuma mudança de código de aplicação ainda — fase puramente de schema.

**Riscos:** baixo. É aditivo (novas colunas com default, nova tabela) — não quebra nada existente.

---

## Fase A2 — Endpoints backend

**Objetivo:** expor as operações de compartilhamento via API, sem UI ainda (testável via `curl`/Postman ou o painel de rede do navegador).

| Método e rota | Função |
| --- | --- |
| `PUT /api/notes/:id/visibility` | Corpo `{ visibility: 'private'\|'shared'\|'public' }`. Ao mudar para `public` pela 1ª vez, gera `share_token`. |
| `POST /api/notes/:id/share-link/regenerate` | Gera um novo `share_token`, invalidando o antigo. Só faz sentido se `visibility === 'public'`. |
| `POST /api/notes/:id/shares` | Corpo `{ email, permission }` — adiciona uma pessoa (cria linha em `note_shares`, `status: pending`; resolve `shared_with_user_id` se o e-mail já tiver conta). |
| `PUT /api/notes/:id/shares/:shareId` | Corpo `{ permission }` — atualiza a permissão (`view`↔`edit`) de uma pessoa. |
| `DELETE /api/notes/:id/shares/:shareId` | Remove o acesso de uma pessoa. |
| `GET /api/notes/:id/shares` | Lista quem tem acesso à nota (para o dono ver/gerenciar) — inclui e-mail, permissão, status, e se já tem conta vinculada. |
| `GET /api/share/:token` | **Público, sem autenticação.** Retorna a nota (somente leitura) se `visibility='public'` e o token bater. 404 caso contrário. |

Todos os endpoints com `:id` (exceto o público) exigem que o usuário autenticado seja o **dono** da nota — validado explicitamente no handler (não basta a RLS, já que esses endpoints normalmente usam a service role como o resto do projeto; a checagem de posse precisa ser feita em código, seguindo o padrão já usado nos outros endpoints de notas).

**Arquivos esperados:**
- `server/api/notes/[id]/visibility.put.ts`
- `server/api/notes/[id]/share-link/regenerate.post.ts`
- `server/api/notes/[id]/shares/index.post.ts`, `index.get.ts`
- `server/api/notes/[id]/shares/[shareId].put.ts`, `[shareId].delete.ts`
- `server/api/share/[token].get.ts` — resposta deve ser um mapeamento **próprio** (não reutilizar o serializer de `/api/notes/[id]`), retornando só `{ title, icon, type, content, updatedAt }` — nunca `userId`, tags do dono, backlinks para notas privadas, etc. (ver A.6).

**Critérios de aceite:**
- Cada endpoint testado isoladamente (happy path + tentativa de acesso por quem não é dono → 403 + token inválido no endpoint público → 404, nunca 403).
- `GET /api/share/:token` funciona sem qualquer header de autenticação.

**Riscos:** médio — é a camada onde um erro de validação de posse viraria um vazamento de dado entre usuários. Vale um teste manual explícito de "usuário B tenta chamar `PUT /api/notes/:idDoUsuárioA/visibility`" antes de considerar a fase pronta.

---

## Fase A3 — Reconciliação de convites no login/signup

**Objetivo:** quando alguém sem conta é convidado por e-mail e depois cria conta (ou faz login pela primeira vez) com aquele mesmo e-mail, os `note_shares` pendentes precisam se vincular automaticamente à conta nova.

- No fluxo de autenticação (onde quer que o projeto já trate "primeiro login"/signup — hook do Supabase Auth ou middleware do lado do servidor), adicionar um passo: `update note_shares set shared_with_user_id = :newUserId, status = 'accepted' where shared_with_email = :email and status = 'pending'`.
- Usa o índice `idx_note_shares_pending_email` criado na Fase A1.
- Sem esse passo, uma pessoa convidada antes de ter conta nunca ganharia acesso de fato mesmo depois de criar a conta — ficaria com `shared_with_user_id null` para sempre, e a policy de RLS (`shared_with_user_id = auth.uid()`) nunca bateria.

**Critérios de aceite:** convidar um e-mail sem conta → criar conta com esse e-mail → nota compartilhada aparece automaticamente para o novo usuário, sem passo manual.

**Riscos:** baixo, mas fácil de esquecer — é a fase mais "invisível" do plano (não tem UI própria), então vale checklist explícito na hora do PR.

---

## Fase A4 — Página pública

**Objetivo:** rota acessível sem login para renderizar uma nota pública.

- **Nova página**: `app/pages/share/[token].vue` — `ssr: true` (diferente da página de notas normal, que é `ssr:false`, porque essa precisa carregar rápido e ser indexável/acessível sem JS pesado ou login).
- Renderiza o conteúdo em modo somente-leitura (o mesmo `NotionStyleEditor` com `editable:false`, ou um renderer mais simples/leve — avaliar na implementação se vale a pena carregar o Tiptap inteiro só para leitura), **sem** a barra lateral/chrome do app — só o conteúdo da nota e um rodapé leve ("Feito com Kortex", opcional, com CTA de cadastro).
- Estado de "não encontrado" (token inválido ou nota voltou a ser privada) deve reaproveitar o padrão de 404 do resto do site, não vazar nenhuma informação sobre a nota ter existido.
- **Wikilinks dentro da nota pública**: se a nota tem `[[Outra Nota]]` e "Outra Nota" é privada, o link não deve navegar/expor essa nota — precisa renderizar como texto simples (ou um link visualmente desabilitado). Isso exige que `GET /api/share/:token` inclua, para cada wikilink resolvido no conteúdo, se o alvo também é público (ver A.6) — o renderer da página pública decide o comportamento do link com base nessa informação, não adivinhando no cliente.

**Critérios de aceite:** abrir o link público em uma aba anônima (sem sessão) renderiza a nota corretamente; um wikilink para nota privada não navega.

**Riscos:** médio — é a superfície mais visível publicamente, vale revisão de acessibilidade e SEO básico (meta tags, `noindex` opcional se o usuário não quiser a nota indexada por buscadores — considerar um toggle "permitir indexação" como melhoria futura, não obrigatório nesta fase).

---

## Fase A5 — UI de gestão no app

**Objetivo:** dono consegue configurar visibilidade e gerenciar acesso pela interface, sem precisar de chamadas manuais de API.

- **Botão "Compartilhar"** no cabeçalho do `NoteEditor.vue` (ao lado dos seletores de ícone/tipo já existentes — mesmo padrão visual do botão de tipo adicionado recentemente), abrindo um popover/modal com:
  - Seletor: Privada / Compartilhada / Pública.
  - Se **Compartilhada**: campo para adicionar por e-mail + permissão (Visualizar/Editar) + lista das pessoas já com acesso (com opção de trocar permissão ou remover, e um indicador visual de `pending`/`accepted`).
  - Se **Pública**: mostra o link gerado (`https://.../share/<token>`) com botão de copiar, e um botão "Gerar novo link" (com confirmação, já que invalida o link atual — mesmo padrão de confirmação destrutiva já usado na exclusão de pasta).
- **Indicador visual na lista de notas** (`NotesList.vue`) — um ícone pequeno (ex. `i-lucide-globe` para pública, `i-lucide-users` para compartilhada) ao lado do título, no mesmo padrão do indicador de "fixada" que já existe (ícone + tooltip), para o usuário saber de relance quais notas não são privadas.
- Seguir o padrão de **UI otimista** já estabelecido no módulo (seção 12 de `docs/1.NOTES.md`): mudar visibilidade e adicionar/remover pessoas devem refletir instantaneamente na UI via `runOptimisticAction`, com rollback automático em caso de erro do servidor.

**Critérios de aceite:** fluxo completo testável manualmente — tornar uma nota pública, copiar o link, abrir em aba anônima, ver o indicador na lista, voltar a privada, confirmar que o link antigo passa a dar 404.

**Riscos:** baixo — é composição de padrões (popover, otimista, indicador) já existentes no módulo.

---

## A.6 Decisões de segurança (revisar antes de liberar a Fase A2 em produção)

- **Edição anônima desabilitada por padrão.** Link público é sempre `view`. Permitir edição por qualquer pessoa com o link é um recurso perigoso (qualquer um que tenha o link pode estragar o conteúdo do dono) — se algum dia for pedido, deve ser opt-in explícito por nota, nunca o padrão.
- **Wikilinks dentro de uma nota pública não devem vazar outras notas** (ver Fase A4) — o endpoint público precisa checar a visibilidade do alvo de cada wikilink antes de expor essa informação.
- **Token deve ser longo o suficiente para inviabilizar força bruta** (32+ caracteres, gerado com uma lib criptograficamente segura — `nanoid`/`crypto.randomUUID`/`gen_random_bytes`), já que é a única barreira entre "privado" e "público" nesse modelo (segurança por obscuridade do link, como o "compartilhar por link" do Notion/Google Docs).
- **Rate limiting no endpoint público** — sem isso, é possível varrer tokens ou fazer scraping abusivo do conteúdo de notas públicas. Se o projeto já tem alguma camada de rate limiting (middleware/edge), reaproveitar; caso contrário, considerar um limite simples por IP nesse endpoint específico antes do lançamento.
- **Não reutilizar a resposta do endpoint autenticado (`/api/notes/:id`) para o público** — o endpoint público deve ter seu próprio mapeamento de resposta, retornando só o necessário para renderizar (título, ícone, tipo, conteúdo) e nunca campos internos (tags do dono, backlinks para notas privadas, `userId`, etc.).
- **Checagem de posse em código, não só RLS**, em todos os endpoints autenticados de gestão de compartilhamento (Fase A2) — a service role do projeto bypassa RLS por padrão, então a validação "esse usuário é o dono desta nota" precisa estar explícita no handler.

---

# PARTE B — Modo offline (criar/editar sem conexão, sincronizar depois)

## B.1 Por que isso encaixa bem no que já existe

O projeto já tem duas peças que tornam isso mais simples do que seria do zero:

1. **PWA já configurado** (`@vite-pwa/nuxt` no `nuxt.config.ts`) — a infraestrutura de service worker já existe, só falta a estratégia de cache/sync para dados (hoje provavelmente só cacheia o "app shell": JS/CSS).
2. **O "gerenciador" otimista já existe** (`useOptimisticAction` + o store reativo em `useNotes.ts`, documentado na seção 12 de `docs/1.NOTES.md`) — toda ação já atualiza a UI local **antes** de esperar o backend. Offline é, na prática, uma extensão natural desse padrão: em vez de "aplicar local → chamar rede → sucesso ou rollback", passa a ser "aplicar local → se online, chamar rede; se offline, colocar na fila → sincroniza quando a conexão voltar".

## B.2 Ordem das fases

As fases de B têm dependência sequencial mais forte que as de A — cada uma é pré-requisito técnico da seguinte:

```
B1 (persistência local)
  → B2 (detecção de conectividade)
    → B3 (fila de mutações)
      → B4 (integração com o gerenciador otimista)
        → B5 (motor de sincronização)
          → B6 (upload de arquivo offline)
            → B7 (estados de UI)
              → B8 (testes de edge case)
```

---

## Fase B1 — Camada de persistência local

**Objetivo:** o app consegue renderizar a árvore de notas/pastas/tags completa mesmo com a rede desligada e a página recarregada do zero (hoje isso resultaria em tela vazia/erro).

- **IndexedDB** para guardar uma cópia local de todas as notas/pastas/tags do usuário, escrita em modo *write-through*: toda vez que o store reativo (`notesById`/`foldersById`/`tagsById` em `useNotes.ts`) muda — seja por fetch inicial ou por uma ação otimista — a mudança é replicada para o IndexedDB de forma assíncrona, sem bloquear a UI.
- Lib sugerida: **`idb-keyval`** (wrapper fino sobre IndexedDB, já leve o suficiente para não pesar o bundle) em vez de escrever acesso a IndexedDB na mão.
- Estrutura sugerida (um "store" por entidade, chave = id):
  ```ts
  // app/composables/useOfflineCache.ts
  const notesStore = createStore('kortex-notes', 'notes')
  const foldersStore = createStore('kortex-notes', 'folders')
  const tagsStore = createStore('kortex-notes', 'tags')
  ```
- No boot da página (`app/pages/app/notes/index.vue`), se a rede estiver indisponível (ou o fetch inicial falhar), a árvore é hidratada a partir do IndexedDB em vez do `useFetch` normal.

**Critérios de aceite:** desligar a rede (DevTools → Network → Offline), recarregar a página, a árvore de notas continua visível com os dados da última sessão online.

**Riscos:** baixo — é uma camada aditiva, não substitui o fluxo online existente.

---

## Fase B2 — Detecção de conectividade

**Objetivo:** o app sabe, de forma reativa, se está online ou offline, e reage à transição entre os dois estados.

- `useOnline()` do `@vueuse/core` (já é dependência do projeto) dá o estado reativo `isOnline`.
- Um composable fino (`useConnectionStatus.ts`) expõe esse estado para o resto do módulo e centraliza o **evento de transição** offline → online (é o gatilho da Fase B5).
- Indicador visual global discreto (ex. uma faixa fina no topo, ou um badge na barra lateral) quando `isOnline === false` — sem isso, o usuário não tem como saber que está no modo degradado.

**Critérios de aceite:** alternar a rede no DevTools reflete no indicador em menos de 1 segundo, sem precisar recarregar a página.

**Riscos:** baixo.

---

## Fase B3 — Fila de mutações pendentes

**Objetivo:** ter uma estrutura de dados confiável para acumular ações feitas offline, na ordem em que aconteceram.

- Nova store IndexedDB, `pending_mutations`, cada item com o formato:
  ```ts
  interface PendingMutation {
    id: string            // uuid local, gerado no enqueue
    entity: 'note' | 'folder' | 'tag' | 'note_link'
    action: 'create' | 'update' | 'delete' | 'reorder' | 'move'
    payload: Record<string, unknown>  // corpo já resolvido, pronto para a chamada real
    tempId?: string        // se a ação criou uma entidade offline (id temporário local)
    createdAt: string      // timestamp local, define a ordem de replay
    retryCount: number      // controla quando desistir e sinalizar erro real ao usuário
  }
  ```
- Operações básicas: `enqueue(mutation)`, `peekNext()`, `dequeue(id)`, `listPending()` (para o indicador de "N alterações pendentes").
- A fila precisa ser **ordenada por `createdAt`** e processada em ordem estrita na Fase B5 — mutações fora de ordem podem, por exemplo, tentar mover uma nota antes dela ter sido criada no servidor.

**Critérios de aceite:** enfileirar 3 mutações offline, inspecionar o IndexedDB via DevTools e confirmar ordem/conteúdo corretos.

**Riscos:** baixo — é infraestrutura pura, sem lógica de negócio ainda.

---

## Fase B4 — Integração com o gerenciador otimista existente

**Objetivo:** toda ação de escrita do módulo passa a ser "offline-aware" sem precisar reescrever cada chamada individual — a mudança fica centralizada em `useOptimisticAction.ts`.

Hoje:
```
apply() [instantâneo] → request() [rede] → reconcile() ou rollback()
```

Versão offline-aware:
```
apply() [instantâneo, igual hoje]
  → se online: request() [rede] → reconcile() ou rollback() [igual hoje]
  → se offline: enfileira a operação (Fase B3) → marca a entidade como "sincronização pendente"
                  (NÃO faz rollback — a mudança local continua valendo)
```

- `runOptimisticAction` passa a checar `isOnline` (Fase B2) antes de decidir entre os dois caminhos.
- Cada chamador (as funções de `useNotes.ts`: `createNote`, `updateNote`, `reorderNote`, etc.) já fornece `apply`/`request`/`reconcile` — não precisa mudar a assinatura dessas funções, só o comportamento interno do helper. Isso é o que torna a integração barata: o offline vira uma responsabilidade do helper genérico, não de cada ação individual.
- **Criação offline** reaproveita o mecanismo de **ID temporário** que o gerenciador já usa (`temp-<uuid>`) — offline, esse ID temporário simplesmente vive mais tempo (até a fila sincronizar), e quando a criação de verdade é confirmada (Fase B5), o mesmo fluxo de reconciliação já existente troca o ID temporário pelo definitivo.

**Critérios de aceite:** com a rede desligada, criar/editar/mover/excluir notas continua funcionando na UI exatamente como online (mesma resposta instantânea), e cada ação aparece na fila da Fase B3.

**Riscos:** médio — é o ponto mais sensível de toda a Parte B, porque toca o caminho de escrita usado por *todo* o módulo. Vale cobertura de teste manual em cada tipo de ação (criar nota, criar pasta, mover, reordenar, fixar, excluir, renomear) antes de considerar a fase pronta.

---

## Fase B5 — Motor de sincronização

**Objetivo:** quando a conexão volta, a fila é drenada de forma confiável, aplicando cada mutação pendente ao servidor na ordem correta.

- Disparado automaticamente pela transição offline → online (Fase B2).
- Percorre a fila **na ordem em que as ações aconteceram** (`createdAt`) e executa cada `request()` de verdade, aplicando `reconcile()` normalmente a cada sucesso — removendo o item da fila só depois do `reconcile` ter rodado.
- Se uma operação da fila falhar de verdade (não por estar offline, mas por erro real do servidor — ex. 403, 422), **não** deve travar o resto da fila indefinidamente: registra o erro, incrementa `retryCount`, e segue para o próximo item; itens que falharem repetidamente (ex. 3+ tentativas) ficam marcados como "erro" e exigem atenção manual do usuário (Fase B7) em vez de tentar para sempre.
- **Resolução de conflito**: dado que é um app pessoal (sem colaboração multiplayer em tempo real na maior parte dos casos — ver exceção na seção B.9), o critério adotado é **"o mais recente vence" (last-write-wins)**, comparando `updatedAt`: se a mesma nota foi editada em outro dispositivo enquanto este estava offline, a versão com o `updatedAt` mais recente prevalece quando a fila sincronizar. Isso é o mesmo critério usado por apps comparáveis (Obsidian, Notion mobile) e evita a complexidade de um sistema tipo CRDT/OT, que resolveria conflitos de forma mais fina mas é um projeto de outra magnitude — **não está no escopo desta primeira versão**.
- **Edição de conteúdo offline**: como o editor já mantém `content`/`editTitle` locais e salva via `updateNote(..., {silent:true})` (autosave), digitar offline já "funciona" no sentido de que a UI não trava — o autosave, ao rodar offline, enfileira em vez de tentar (e falhar) a chamada de rede, seguindo o mesmo caminho da Fase B4.

**Critérios de aceite:** fazer 3+ ações offline (criar nota, editar, mover), reconectar, confirmar que todas chegam ao servidor na ordem certa e a UI reflete o estado final reconciliado sem duplicar nem perder nada.

**Riscos:** alto — é a fase com mais superfície para bugs sutis (ordem, duplicidade, conflito). Vale testar explicitamente o cenário "editar a mesma nota em duas abas/dispositivos, uma delas offline" antes de liberar.

> ⚠️ **Nota de implementação**: o `reconcile()` de cada ação otimista vive numa closure em memória — não sobrevive a um reload/restart do app. Por isso o motor implementado **não** chama o `reconcile()` original de cada mutação da fila; em vez disso, ele só extrai o `id` real de mutações `create` (para resolver o mapeamento `tempId → id real`, inclusive redirecionando a seleção do usuário se ele ainda estiver na nota recém-criada offline) e, ao final do drene, dispara um **refetch completo** (`refreshAllNotes`/`refreshFolders`/`refreshNotes`/`refreshGraph`) para convergir a UI com o servidor — mais simples e robusto do que tentar preservar reconciliação fina entre sessões, ao custo de uma correção "em lote" no fim em vez de por item. `retryCount` é incrementado a cada falha real, mas ainda não há um corte automático após N tentativas (fica tentando a cada reconexão) nem uma UI dedicada de "item com erro" — isso ficou para a Fase B7 evoluir depois.

---

## Fase B6 — Upload de imagem/arquivo offline

> ⚠️ **Nota de implementação**: esta fase **não foi implementada**. Anexar imagem/arquivo a uma nota continua exigindo conexão — é a lacuna mais visível da Parte B hoje.

**Objetivo:** anexar imagens/arquivos a uma nota enquanto offline, sincronizando o upload de verdade quando a conexão voltar.

Esse é o ponto de maior complexidade nova da Parte B: diferente de uma mutação de texto (que é só JSON), um upload de imagem precisa dos **bytes do arquivo** disponíveis no momento do envio.

- Se o usuário anexa uma imagem offline, os bytes do arquivo (não só os metadados) precisam ficar guardados localmente — IndexedDB suporta `Blob` diretamente, então o `payload` da `PendingMutation` correspondente guarda o `Blob` em vez de (ou além de) metadados.
- Isso é mais pesado que enfileirar um JSON pequeno — vale considerar um **limite de tamanho/quantidade para anexos pendentes offline** (ex. avisar/bloquear acima de X MB acumulados), para não estourar a cota de armazenamento do navegador.
- Enquanto o upload não sincroniza, o bloco de imagem no editor deve renderizar a partir do `Blob` local (via `URL.createObjectURL`) em vez de uma URL do storage remoto — a troca para a URL definitiva acontece no `reconcile()` desse item da fila.

**Critérios de aceite:** anexar uma imagem offline, ver ela renderizada imediatamente no editor, reconectar, confirmar que o upload real acontece e a URL final substitui o preview local sem "piscar" ou duplicar o bloco.

**Riscos:** médio-alto — cota de armazenamento do navegador e o gerenciamento do ciclo de vida do `Blob local → URL remota` são os pontos mais delicados.

---

## Fase B7 — Estados de UI

**Objetivo:** o usuário sempre sabe, olhando a tela, se está offline e se há algo pendente de sincronizar — sem isso, as fases anteriores funcionam "por baixo dos panos" mas de forma invisível e confusa.

- **Indicador global** (Fase B2): já cobre "você está offline agora".
- **Indicador de fila pendente**: contador (ex. badge "3 alterações pendentes") em algum lugar visível da barra lateral, alimentado por `listPending()` (Fase B3) — útil inclusive já online, no breve intervalo entre reconectar e a fila terminar de drenar.
- **Estado novo no indicador de salvamento do editor** (`NoteEditor.vue`): hoje os estados são `idle/unsaved/saved/error`; precisa de um `offline-pending` ("Salvo localmente — sincroniza ao reconectar"), visualmente distinto de `error` (não é uma falha, é uma espera esperada).
- **Itens com erro real de sincronização** (Fase B5, `retryCount` excedido): precisam de algum afordance para o usuário perceber e agir (ex. "tentar novamente" manual, ou pelo menos um aviso explícito de que aquela alteração específica não foi salva no servidor) — não podem falhar silenciosamente.

**Critérios de aceite:** revisão de UX cobrindo os 4 estados (online tudo sincronizado / offline / online com fila pendente / erro real de sincronização) — cada um visualmente distinguível dos outros.

**Riscos:** baixo, mas fácil de subestimar — é a fase que decide se o resto do trabalho técnico (B1–B6) é percebido como confiável pelo usuário ou não.

---

## Fase B8 — Testes de edge case

**Objetivo:** validar os cenários que não aparecem no caminho feliz, antes de considerar a Parte B pronta para produção.

Casos mínimos a cobrir manualmente:
- Recarregar a página **no meio** de uma fila não vazia (a fila precisa sobreviver ao reload, por estar em IndexedDB, e retomar a sincronização assim que a página volta a ficar online).
- **Múltiplas abas** abertas do mesmo usuário, uma offline e outra online — evitar que a aba online sobrescreva com dados desatualizados o que a aba offline ainda vai sincronizar.
- **Editar e depois excluir** (ou excluir uma pasta que contém uma nota) offline, ambas as ações na fila — o motor de sincronização (Fase B5) precisa lidar com uma mutação que se torna irrelevante porque uma mutação posterior na mesma fila já a invalida (ex.: não faz sentido sincronizar um "update" de uma nota que uma mutação seguinte na fila já exclui — vale um passo de compactação da fila antes do replay, ou pelo menos tolerar o 404 esperado do update numa entidade já excluída).
- **Fila com um item que falha de verdade** (não por estar offline) no meio de vários que teriam sucesso — confirmar que o resto da fila continua sendo processado (Fase B5) em vez de travar.
- **Storage cheio** (quota do IndexedDB excedida, principalmente relevante com anexos da Fase B6) — o app deve degradar de forma perceptível (avisar o usuário) em vez de falhar silenciosamente.

**Critérios de aceite:** cada cenário acima tem um resultado esperado documentado e verificado manualmente pelo menos uma vez antes do lançamento.

**Riscos:** esta fase é sobre *encontrar* riscos das fases anteriores — não tem risco técnico próprio, mas pular ela é o principal risco do projeto todo.

> ⚠️ **Nota de implementação**: os cenários de "editar e depois excluir" e "editar algo criado offline antes de sincronizar" foram tratados no design da fila (coalescência em `useMutationQueue.enqueue()` — ver Fase B3). Os demais (reload no meio da fila, múltiplas abas, item com falha real no meio da fila, storage cheio) **não foram testados manualmente** — não há navegador disponível neste fluxo de trabalho para validar isso na prática. Antes de liberar em produção, vale rodar esse checklist manualmente pelo menos uma vez.

---

## B.9 Fora de escopo (não está nesta versão)

- **Merge em tempo real tipo CRDT/OT** — só last-write-wins (Fase B5).
- **Offline para outros módulos** (Hábitos, Tarefas, etc.) — este plano é específico de Notas; o padrão pode ser reaproveitado depois, mas não faz parte desta entrega.
- **Sincronização em segundo plano via Background Sync API do navegador** (permitiria sincronizar mesmo com o app fechado) — fica como evolução futura; a v1 sincroniza quando o app está aberto e a conexão volta.

---

# Como as duas iniciativas se relacionam

São independentes uma da outra no código (dá pra implementar em qualquer ordem — ver seção 0 para a recomendação de sequenciamento), mas há um ponto de atenção quando **ambas** estiverem prontas: uma nota **compartilhada/pública** editada **offline** por alguém com permissão de edição introduz um caso de conflito adicional (duas pessoas diferentes, não só dois dispositivos do mesmo dono) — o mesmo critério de "mais recente vence" (Fase B5) se aplica, mas vale deixar explícito na UI quando uma nota compartilhada foi alterada por outra pessoa enquanto estava sendo editada localmente, para não ser uma sobrescrita silenciosa e confusa. Esse refinamento específico só faz sentido ser implementado depois que as duas partes já estiverem prontas isoladamente — não é uma fase própria, é um ajuste de UX a revisitar no fim.

---

# Checklist geral de rollout

- [x] A1 — Modelo de dados e RLS
- [x] A2 — Endpoints backend
- [x] A3 — Reconciliação de convites no login
- [x] A4 — Página pública
- [x] A5 — UI de gestão no app
- [x] A5.1 — Acesso real para quem recebe uma nota "Compartilhada" (`GET`/`PUT /api/notes/[id]` respeitando `note_shares`, lista "Compartilhadas comigo", editor somente-leitura por permissão) — adicionado depois da A5 original, ao notar que a UI de gestão sozinha não bastava para o destinatário acessar a nota
- [ ] A6 — Revisão de segurança antes de liberar em produção (rate limiting do endpoint público ainda não implementado)
- [x] B1 — Persistência local (IndexedDB)
- [x] B2 — Detecção de conectividade
- [x] B3 — Fila de mutações pendentes (com coalescência de updates e cancelamento de create+delete)
- [x] B4 — Integração com o gerenciador otimista
- [x] B5 — Motor de sincronização (reconciliação por refetch completo, não por closure — ver nota na Fase B5)
- [ ] B6 — Upload de imagem/arquivo offline (não implementado)
- [x] B7 — Estados de UI
- [ ] B8 — Testes de edge case (coalescência coberta no design; reload/multi-aba/storage cheio não testados manualmente)
