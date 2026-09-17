# Perfil público com username + múltiplos eventos (padrão Cal.com)

Este documento especifica o que falta para o Kortex sair do modelo atual — **um link opaco por página de agendamento** (`/agendar/{token}`, um token aleatório = uma página = um único tipo de evento) — para o modelo do Cal.com: um **username público** (`cal.com/michaelnorris`) que serve como perfil, listando **todos os tipos de evento ativos** do anfitrião, cada um acessível pelo próprio slug (`cal.com/michaelnorris/30min`).

Este projeto já tinha sido identificado e **conscientemente adiado duas vezes** no plano anterior do módulo:

> `docs/appointments/PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md:29` — "Slug/URL amigável | ❌ (decisão deliberada da Fase 1: token opaco) | Fora desta leva; evolução futura"
> `PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md:354` — "Não criar conceito de 'username público' (isso é o projeto de slug, deliberadamente fora)."
> `PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md:387` — "Slug/URL amigável: continua sendo o projeto 'handle público', fora."

**Este documento é esse projeto.** Ele assume que §6.3 daquele plano (perfil público mínimo — nome + avatar, sem username) permanece parcialmente válido como ponto de partida, mas vai além: introduz o username em si.

> **Decisão de arquitetura de URL já tomada com o usuário**: paridade total com o Cal.com — `kortex.app/{username}` e `kortex.app/{username}/{slug}`, sem prefixo (não `kortex.app/u/{username}`, não `kortex.app/agendar/{username}`). A seção 3 detalha o que essa escolha custa e como o custo é administrado.

---

## 1. Como o Cal.com funciona (análise)

Dois níveis de identificador, dois significados de unicidade diferentes:

| Nível | Exemplo | Escopo da unicidade |
| --- | --- | --- |
| **Username** | `michaelnorris` | Único **globalmente** na plataforma inteira — é a identidade pública da pessoa |
| **Slug do tipo de evento** | `30min`, `whatsapp-chat` | Único **só dentro do username dono** — dois anfitriões diferentes podem cada um ter `/30min` |

Comportamento observado no print enviado (`cal.com/michaelnorris`):

- **Cabeçalho do perfil**: avatar, nome, bio curta (com links inline — `@Tvrtle`, `@AllofTheJobs` etc. aparecem sublinhados, sugerindo suporte a links dentro da bio).
- **Lista de tipos de evento ativos**, cada card mostrando: título, descrição curta, duração (badge "30m"/"15m") e um badge de política (`Requer confirmação`). Clicar num card leva para `cal.com/michaelnorris/{slug-do-evento}` — exatamente a tela de agendamento que o Kortex já tem hoje em `/agendar/{token}`, só que endereçada por username+slug em vez de um token opaco.
- **Tipos de evento podem ser ocultados do perfil** sem desativá-los — continuam acessíveis por link direto, só não aparecem na lista pública. É um toggle separado de "ativo/pausado".
- **Trocar o username quebra os links antigos** — o Cal.com não mantém redirect do username anterior. Aceitável e mais simples; registrado como comportamento assumido aqui também (seção 10).
- Fora do que este documento cobre: **links de agendamento em grupo** (`cal.com/user1+user2`), **times/round-robin**, **bio em markdown/rich text real** — a bio do print parece suportar link inline, mas o efeito prático (menção a `@handle`) pode ser só texto com link manual colado, não necessariamente uma sintaxe de menção. Tratado como fora de escopo na seção 10.

---

## 2. Estado atual do Kortex (auditoria)

### 2.1 Identidade do usuário hoje

Não existe **nenhum** conceito de username/handle em lugar nenhum do código. Os únicos campos de identidade pública disponíveis são:

- `user_metadata.name` e `user_metadata.avatar_url` — geridos por `server/api/auth/profile.get.ts`/`profile.put.ts`, editados em `/app/settings`.
- E-mail (nunca exposto publicamente).
- **Não existe campo de bio em lugar nenhum.**
- Fuso horário do usuário não mora no `user_metadata` — mora numa tabela separada, `public.user_preferences` (1:1 com `auth.users`, `unique(user_id)`, RLS própria de "cada um só vê a própria linha" — `supabase/migrations/20260306190000_user_preferences.sql`). Isso importa porque é o lar natural para `username`/`bio` também (seção 4).

### 2.2 Padrão de link público opaco já estabelecido

Dois lugares já publicam conteúdo por token aleatório, sem listagem, sem username — o molde que `/agendar/{token}` segue hoje:

- `app/pages/agendar/[token].vue` → `GET /api/schedule/[token]` — uma página de agendamento por token.
- `app/pages/share/[token].vue` → `GET /api/share/[token]` — uma nota compartilhada por token.

Os tokens vêm de `server/utils/share-token.ts`:

```ts
export function createShareToken(): string {
  return randomBytes(24)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}
```

24 bytes aleatórios → 32 caracteres base64url. **Sem nenhuma checagem de colisão** — nem precisa, a entropia torna uma colisão real estatisticamente impossível. Isso é reaproveitado em `scheduling_pages.share_token`, `bookings.manage_token`, `notes.share_token` — um padrão real e usado em produção, que **este projeto não toca nem substitui**: o link opaco continua existindo para sempre como via "não listada" (seção 7).

Esse mesmo raciocínio **não se aplica** a um slug escolhido por humano (username, ou o slug de um tipo de evento): aí colisão é comum e esperada, e precisa de checagem de unicidade de verdade — não dá pra copiar `createShareToken()` para isso.

### 2.3 `scheduling_pages` hoje

Confirmado lendo as 4 migrations do módulo em ordem (`20260906000000`, `20260908000000`, `20260911000000`, `20260917000000_scheduling_pages_cover_image.sql`): a tabela **não tem coluna `slug`**. O único `UNIQUE` hoje é `share_token`. Não há nada a "migrar" — é tudo aditivo.

### 2.4 Rotas de nível raiz existentes (para a lista de reservados da seção 3)

```
app/pages/agendar/     (agendar/[token].vue, agendar/gerenciar/[manageToken].vue)
app/pages/app/         (toda a área autenticada)
app/pages/blog/        + app/pages/blog.vue
app/pages/brand/
app/pages/changelog/
app/pages/index.vue    (home/marketing)
app/pages/login.vue
app/pages/pricing.vue
app/pages/share/       (share/[token].vue)
app/pages/signup.vue
```

---

## 3. Decisão de arquitetura de URL

**Escolhido: paridade total com o Cal.com** — `kortex.app/{username}` (perfil) e `kortex.app/{username}/{slug}` (agendamento de um evento específico), sem prefixo.

### 3.1 Por que isso não é um conflito de roteamento

Vue Router (e por extensão o Nuxt) sempre prioriza uma rota **estática** sobre uma rota **dinâmica** de mesmo nível. Ou seja: `app/pages/[username]/index.vue` registra o padrão `/:username`, mas `/login`, `/agendar`, `/blog`, `/pricing` etc. são rotas estáticas que **sempre vencem** — visitar `/login` nunca vai cair no catch-all `/[username]` tentando interpretar "login" como um username. Isso vale também para `/agendar/{token}` (`/agendar/:token`, dois segmentos com o primeiro estático) — não colide com `/:username/:slug` porque o primeiro segmento (`agendar` vs. o username real) nunca é igual ao mesmo tempo.

**Então tecnicamente não há bug de roteamento aqui.** O que existe é um problema de **produto/UX**: se alguém registra o username `"pricing"`, a própria página estática `/pricing` sempre vai vencer, e o perfil dessa pessoa fica **silenciosamente inacessível** (não é um erro, é um 404 mudo — o roteador nunca chega a tentar o catch-all). Por isso a validação de username (seção 5) precisa de uma lista de bloqueio.

### 3.2 O preço real dessa escolha (documentar e aceitar conscientemente)

Diferente das outras opções (`/u/{username}` ou reaproveitar `/agendar/{username}`), a paridade total **reserva o namespace raiz inteiro do site para sempre**. Isso significa um compromisso operacional contínuo, não só um trabalho de implementação único:

> **Toda vez que uma nova página estática de nível raiz for adicionada ao site no futuro (ex.: `/careers`, `/changelog` — já existe —, `/status`, `/docs`), essa palavra precisa entrar na lista de reservados ANTES de a página ir ao ar.** Caso contrário, qualquer usuário que já tenha registrado aquele username vê o próprio perfil desaparecer sem aviso nenhum (a nova rota estática passa a vencer o catch-all).

A mitigação é centralizar a lista de reservados num único arquivo fonte-da-verdade (`server/utils/reserved-usernames.ts`, seção 5.2) e deixar esse comentário nele — não há como eliminar o risco, só tornar o processo de atualizá-lo óbvio para quem mexer em `app/pages/` depois.

---

## 4. Onde fica o username e a bio

**Extensão de `user_preferences`**, não uma tabela nova — é a tabela que já existe exatamente para "dados de perfil além do `user_metadata` do Supabase Auth" (hoje guarda `primary_color`, `neutral_color`, `color_mode`, `timezone`), já tem RLS própria (`auth.uid() = user_id` para select/insert/update), já tem `unique(user_id)`. Adicionar `username`/`bio` aqui evita criar uma segunda tabela 1:1 fazendo o mesmo papel.

```sql
-- supabase/migrations/<timestamp>_user_preferences_username_bio.sql
ALTER TABLE public.user_preferences
  ADD COLUMN username text,
  ADD COLUMN bio text;

-- Unicidade case-insensitive — "MichaelNorris" e "michaelnorris" são o mesmo
-- username. Índice parcial (WHERE username IS NOT NULL) porque a maioria dos
-- usuários existentes vai ficar com username nulo até escolher um.
CREATE UNIQUE INDEX idx_user_preferences_username_lower
  ON public.user_preferences (lower(username))
  WHERE username IS NOT NULL;
```

Decisão de case: **armazenar sempre em minúsculas** (a validação de entrada já rejeita maiúsculas — seção 5.1), não só na hora de comparar. Evita qualquer ambiguidade entre "como foi digitado" e "como é comparado", que é uma fonte clássica de bugs em sistemas de username.

**Leitura pública**: o novo endpoint de perfil (seção 7) usa o `getSupabaseAdminClient()` — o mesmo client de service-role que todo outro endpoint público do repo já usa (`schedule/[token].get.ts`, `share/[token].get.ts`) — então a RLS de "só o dono vê a própria linha" **não precisa mudar em nada**; ela segue protegendo o acesso via client anônimo do navegador, e o endpoint público seleciona só as colunas necessárias (nunca `select('*')`), mesmo cuidado que o comentário já existente em `schedule/[token].get.ts:9-12` documenta ("Never exposes calendarId or any other internal identifier of the host").

---

## 5. Validação de username

### 5.1 Formato

```ts
// server/utils/username.ts
const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])?$/

export function isValidUsernameFormat(value: string): boolean {
  return USERNAME_PATTERN.test(value)
}
```

3–30 caracteres, só minúsculas/dígitos/hífen, não pode começar nem terminar com hífen. Zod no endpoint de update usa isso via `.refine()`, com mensagem clara ("use só letras minúsculas, números e hífen").

### 5.2 Lista de reservados (fonte da verdade única)

```ts
// server/utils/reserved-usernames.ts
//
// Toda vez que uma rota estática nova for adicionada em app/pages/ no nível
// raiz, ela precisa entrar aqui ANTES de ir ao ar — senão o perfil de quem já
// tiver registrado esse username some silenciosamente (rota estática sempre
// vence o catch-all /[username], ver docs/appointments/
// PLANO_USERNAME_PERFIL_PUBLICO.md seção 3.2).
export const RESERVED_USERNAMES = new Set([
  // rotas estáticas reais de app/pages/ hoje
  'agendar', 'app', 'blog', 'brand', 'changelog', 'login', 'pricing', 'share', 'signup',
  // infraestrutura do Nitro/Nuxt e do próprio domínio
  'api', 'admin', 'assets', 'static', 'public', 'cdn', 'www', 'mail', 'email',
  'favicon.ico', 'robots.txt', 'sitemap', 'sitemap.xml', 'manifest.json',
  // páginas prováveis no roadmap (evita ter que migrar um username depois)
  'settings', 'dashboard', 'help', 'support', 'docs', 'status', 'terms', 'privacy',
  'about', 'contact', 'careers', 'security',
  // genéricos/confusos
  'u', 'me', 'home', 'null', 'undefined', 'true', 'false', 'root', 'test', 'kortex'
])
```

### 5.3 Endpoint de checagem ao vivo (nice-to-have, incluído)

```
GET /api/auth/username/check?value=michaelnorris
→ { available: boolean, reason?: 'format' | 'reserved' | 'taken' }
```

Debounced no formulário de Settings (seção 8.2) — feedback instantâneo é importante aqui porque, diferente da maioria dos campos de formulário do app, um username é uma URL pública que outras pessoas vão ver e compartilhar; errar e ter que trocar depois quebra links já distribuídos (seção 10).

### 5.4 Salvar o username

Estende `server/api/auth/profile.put.ts` (já é o endpoint único de "salvar meu perfil" usado por `/app/settings`) em vez de criar um endpoint separado — mantém uma única ação de salvar no formulário de Settings, consistente com a UX atual (name+avatar_url já salvam juntos ali):

```ts
// bodySchema atual só tem name/avatar_url — adicionar:
username: z.string()
  .transform(v => v.trim().toLowerCase())
  .refine(v => v === '' || isValidUsernameFormat(v), 'Formato inválido')
  .refine(v => v === '' || !RESERVED_USERNAMES.has(v), 'Este username não está disponível')
  .optional(),
bio: z.string().max(280).optional()
```

No handler: se `username` mudou, checar unicidade via `select` no índice `lower(username)` (admin client, excluindo a própria linha) antes do `update`/`upsert` em `user_preferences` — em caso de corrida rara entre a checagem e o `UPDATE`, o índice `UNIQUE` do banco é quem garante a integridade de verdade (a checagem em código é só para dar uma mensagem de erro amigável, não é a única linha de defesa).

---

## 6. Slug por página de agendamento (event type)

### 6.1 Coluna nova + escopo de unicidade

```sql
-- Passo 1 — nullable, sem constraint ainda (existem páginas hoje sem slug)
ALTER TABLE scheduling_pages
  ADD COLUMN slug text,
  ADD COLUMN show_on_profile boolean NOT NULL DEFAULT true;
```

O `show_on_profile` é o equivalente ao toggle "ocultar do perfil" do Cal.com (seção 1) — independente de `is_active`. Uma página pode estar ativa (aceitando reservas) e ainda assim fora da lista pública, acessível só por quem tem o link direto.

**Backfill** (script único, roda uma vez, fora de uma migration SQL pura porque precisa de normalização de acentos que é mais simples em JS do que em SQL puro):

```ts
// script único de backfill — não faz parte do runtime da app
for (const page of allPagesWithoutSlug) {
  const base = slugify(page.title) // ver 6.2
  const slug = await ensureUniqueSlug(supabase, page.user_id, base)
  await supabase.from('scheduling_pages').update({ slug }).eq('id', page.id)
}
```

```sql
-- Passo 2 — depois do backfill confirmado, migration separada
ALTER TABLE scheduling_pages
  ALTER COLUMN slug SET NOT NULL;

ALTER TABLE scheduling_pages
  ADD CONSTRAINT uq_scheduling_pages_user_slug UNIQUE (user_id, slug);
```

Note o escopo: `UNIQUE (user_id, slug)`, **não** `UNIQUE (slug)` — dois anfitriões diferentes podem cada um ter uma página com slug `30min`, exatamente como no Cal.com (seção 1).

### 6.2 Geração e edição do slug

```ts
// server/utils/slug.ts
export function slugify(input: string): string {
  return input
    .normalize('NFKD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'evento'
}

export async function ensureUniqueSlug(
  supabase: SupabaseClient, userId: string, base: string, excludeId?: string
): Promise<string> {
  let candidate = base
  let suffix = 2
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase.from('scheduling_pages').select('id').eq('user_id', userId).eq('slug', candidate)
    if (excludeId) query = query.neq('id', excludeId)
    const { data } = await query.maybeSingle()
    if (!data) return candidate
    candidate = `${base}-${suffix++}`
  }
}
```

- **Na criação** (`scheduling-pages/index.post.ts`): gera automaticamente de `title` via `slugify` + `ensureUniqueSlug`. **Não expor um campo de slug no `SchedulingQuickCreateModal.vue`** — mantém a criação rápida com os mesmos 3 campos de hoje (Título + Duração + Calendário); o slug pode ser ajustado depois no editor completo.
- **No editor** (`scheduling/[id].vue`, aba Evento, ao lado do campo Título): campo "URL" mostrando `kortex.app/{username}/` como prefixo fixo + input editável para o slug, com preview completo e checagem de unicidade (mesmo padrão de UX da seção 5.3, aqui escopada a `(user_id, slug)`).
- **No `[id].patch.ts`**: aceitar `slug` no `bodySchema` com o mesmo formato regex de username (reaproveitar `USERNAME_PATTERN`, já que a forma é idêntica), checando unicidade escopada ao usuário antes do `update` (`ensureUniqueSlug` com `excludeId` = a própria página).

---

## 7. Rotas e endpoints novos

### 7.1 Páginas (Nuxt)

```
app/pages/[username]/index.vue   → perfil público (lista de event types)
app/pages/[username]/[slug].vue  → agendamento de um evento específico
                                    (mesma tela/fluxo de agendar/[token].vue —
                                    3 passos: horário → dados → confirmação)
```

`agendar/[token].vue` e `agendar/gerenciar/[manageToken].vue` **continuam existindo exatamente como estão hoje** — o link opaco/não-listado não é removido nem substituído, é uma segunda via de acesso à mesma tabela `scheduling_pages` (seção 2.2).

### 7.2 Endpoints (server)

```
GET  /api/profile/[username]                    → perfil + lista de event types públicos
GET  /api/profile/[username]/[slug]              → mesmo payload de PublicSchedulingPage hoje
GET  /api/profile/[username]/[slug]/availability → espelha /api/schedule/[token]/availability
POST /api/profile/[username]/[slug]/book         → espelha /api/schedule/[token]/book
```

**Não duplicar a lógica de negócio.** `/api/schedule/[token]/*` hoje resolve a linha de `scheduling_pages` por `share_token`; os novos endpoints resolvem a mesma linha por `(username → user_id, slug)`. A partir do momento em que a linha é resolvida, o resto (montar o payload público, calcular disponibilidade, revalidar e criar a reserva) é **idêntico**. Extrair essa parte comum:

```ts
// server/utils/schedule-public.ts (novo)
export async function buildPublicSchedulingPagePayload(supabase, page: Record<string, unknown>) { /* corpo hoje em schedule/[token].get.ts:27-51 */ }
export async function bookSlot(supabase, page: Record<string, unknown>, payload: BookingPayload) { /* corpo hoje em schedule/[token]/book.post.ts */ }
```

E os dois conjuntos de rotas (`/api/schedule/[token]/*` e `/api/profile/[username]/[slug]/*`) ficam finos: resolvem a página do jeito que for (por token ou por username+slug), devolvem 404 se não achar, e chamam a função compartilhada. Isso garante que uma correção futura (como as da auditoria de fuso horário — ver `AUDITORIA_TIMEZONE_CAPA_AGENDAMENTO.md`) não precise ser feita em dois lugares.

### 7.3 Query do perfil público

Espelha a listagem já existente do dono (`scheduling-pages/index.get.ts`), com três diferenças: client admin (não autenticado), filtro extra `is_active = true` e `show_on_profile = true`, e resolve o `user_id` a partir do username em vez de vir de `requireAuthUser`:

```ts
const { data: pref } = await supabase
  .from('user_preferences')
  .select('user_id, username, bio')
  .eq('username', usernameFromRoute) // já normalizado para minúsculas na entrada
  .maybeSingle()

if (!pref) throw createError({ statusCode: 404, statusMessage: 'Perfil não encontrado' })

const { data: pages } = await supabase
  .from('scheduling_pages')
  .select('id, title, description, duration_minutes, slug, color, cover_image_url, requires_confirmation')
  .eq('user_id', pref.user_id)
  .eq('is_active', true)
  .eq('show_on_profile', true)
  .is('archived_at', null)
  .order('created_at', { ascending: true })
```

Nome/avatar do anfitrião continuam vindo de `supabase.auth.admin.getUserById()`, igual a `schedule/[token].get.ts:34-37` hoje.

### 7.4 O que não muda

`bookings.manage_token` e todo o fluxo de `/agendar/gerenciar/[manageToken]` (cancelar, reagendar) são **completamente independentes** de como o convidado chegou na página de agendamento — zero mudança necessária ali.

---

## 8. Mudanças de UI

### 8.1 Editor da página de agendamento (`scheduling/[id].vue`)

- Aba **Evento**: campo "URL" novo, ao lado do Título — prefixo fixo `kortex.app/{username}/` (ou aviso "defina seu username em Configurações" se o usuário ainda não tiver um) + input do slug, com checagem de unicidade ao vivo.
- Aba **Privacidade**: novo toggle "Mostrar no meu perfil público" (`show_on_profile`) — mesmo padrão visual dos toggles já existentes ali (`hideDetailsOnManagePage`), com a mesma descrição curta em `text-muted` embaixo.

### 8.2 Configurações (`/app/settings`)

Nova seção "Perfil público" (ou estendendo a seção de perfil já existente):

- Campo **Username** — prefixo `kortex.app/` fixo, input com checagem ao vivo (seção 5.3), aviso "sua página de agendamento fica em `kortex.app/{username}`".
- Campo **Bio** — textarea, até 280 caracteres, texto puro (sem markdown/rich text nesta entrega — seção 10).
- Aviso permanente, visível sempre que o campo de username tem foco ou muda: **"Trocar seu username quebra links já compartilhados com esse endereço."** — mesma limitação assumida do Cal.com (seção 1), sem redirect automático.

### 8.3 Página pública nova (`[username]/index.vue`)

Estrutura próxima ao print de referência: avatar + nome + bio no topo, seguido da lista de tipos de evento ativos e visíveis (`show_on_profile = true`), cada card com título, descrição curta, duração, e badge "Requer confirmação" quando `requiresConfirmation` for verdadeiro — reaproveitando o mesmo `LOCATION_TYPE_META`/formatação já usados em `agendar/[token].vue`. Clique no card navega para `/{username}/{slug}`.

---

## 9. SEO e privacidade

- **Perfil (`[username]/index.vue`)**: diferente das páginas de agendamento de hoje (`robots: 'noindex'`), este é o único ponto do fluxo público que **deveria ser indexável** — é literalmente o objetivo do recurso (a pessoa ser encontrada). `useSeoMeta({ title: displayName, description: bio, ogImage: avatarUrl })`, sem `robots: 'noindex'`.
- **Página de evento individual (`[username]/[slug].vue`)**: manter `robots: 'noindex'` por enquanto, mesma politica de hoje em `agendar/[token].vue` — decisão revisitável, não crítica para esta entrega.
- **Nunca expor** `share_token`, `manage_token`, `user_id`/`calendar_id` reais nos novos endpoints públicos — mesmo cuidado documentado no comentário já existente em `schedule/[token].get.ts`.

---

## 10. Fora de escopo desta entrega (registrar para o futuro)

- **Links de agendamento em grupo** (`cal.com/user1+user2`) — feature própria do Cal.com, não mencionada em nenhum plano do Kortex até hoje.
- **Bio em markdown/rich text com menções** (`@handle` sublinhado como no print) — bio nesta entrega é texto puro. Se o produto quiser links de verdade na bio depois, é um projeto à parte de sanitização de HTML/markdown.
- **Redirect de username antigo → novo** depois de uma troca — o link antigo simplesmente para de funcionar (mesmo comportamento do Cal.com). Uma tabela `username_history` resolveria isso no futuro, não é necessária agora.
- **Analytics de perfil** (visualizações, taxa de clique por tipo de evento) — mencionado como fora de escopo também em `AUDITORIA_LINK_AGENDAMENTO_UX.md` §2 para o link individual; vale o mesmo aqui para o perfil.
- **Onboarding forçado de username no cadastro** — usuários existentes ficam com `username = null` até escolherem um em Settings; sem username, a página pública deles simplesmente não existe (o link opaco `/agendar/{token}` continua sendo a única via, exatamente como hoje).

---

## 11. Checklist de implementação (ordem sugerida)

**Status: implementado em 2026-09-17.** Duas decisões tomadas durante a implementação que divergem do pseudocódigo original deste documento, ambas registradas nos itens abaixo: (1) o backfill de `slug` virou SQL inline dentro da própria migration (com `unaccent` + `row_number()`) em vez de um script Node separado — elimina a dependência de uma segunda etapa manual; (2) o item 7 ganhou um endpoint extra não previsto, `GET /api/appointments/scheduling-pages/[id]/slug-check`, porque sem ele o editor não tinha como mostrar o erro específico de "essa URL já está em uso" — o composable `useSchedulingPages` sempre substitui a mensagem de erro do servidor por um texto genérico fixo (`runOptimisticAction`), então a checagem ao vivo (mesmo padrão do username) foi o jeito de dar esse feedback sem mudar esse comportamento genérico do composable. `node_modules` está vazio neste ambiente — sem build/typecheck/lint real disponível; verificação foi leitura cuidadosa de cada arquivo tocado + checagem manual de todos os caminhos de import relativos dos endpoints novos.

1. [x] Migration: `user_preferences.username`/`bio` + índice único case-insensitive.
2. [x] Migration: `scheduling_pages.slug`/`show_on_profile` — feita como migration única (colunas + backfill SQL inline com `unaccent`/`row_number` + `NOT NULL`/`UNIQUE` na mesma transação), não em dois arquivos separados.
3. [x] `server/utils/slug.ts` (`slugify`, `ensureUniqueSlug`) e `server/utils/username.ts` (`isValidUsernameFormat`, agora também rejeitando hífens consecutivos) e `server/utils/reserved-usernames.ts`.
4. [x] Backfill — inline na migration do item 2, não um script separado (ver nota acima).
5. [x] `NOT NULL` + `UNIQUE(user_id, slug)` — na mesma migration do item 2.
6. [x] `server/utils/schedule-public.ts` — extraída a lógica compartilhada; `schedule/[token].get.ts`, `availability.get.ts` e `book.post.ts` viraram wrappers finos.
7. [x] Endpoints novos: `GET /api/profile/[username]`, `GET /api/profile/[username]/[slug]`, `.../availability`, `.../book`, `GET /api/auth/username/check` — **+ `GET /api/appointments/scheduling-pages/[id]/slug-check`** (não previsto no documento original, ver nota acima).
8. [x] `server/api/auth/profile.get.ts`/`profile.put.ts` — aceitar/expor `username`/`bio` com validação (get também precisou mudar, para o preview do editor e o formulário de Settings lerem o valor atual).
9. [x] `server/api/appointments/scheduling-pages/index.post.ts`/`[id].patch.ts` — aceitar/gerar `slug`, aceitar `show_on_profile`. A criação resolve colisão silenciosamente (`-2`, `-3`...); o editor rejeita explicitamente com 409 se o slug digitado já existe (são UX diferentes de propósito — ver §6.2/§7 do corpo do documento).
10. [x] `app/pages/[username]/index.vue` e `app/pages/[username]/[slug].vue` — a tela de agendamento em si foi extraída para um componente novo, `app/components/appointments/PublicBookingFlow.vue`, compartilhado com `agendar/[token].vue` (que também virou um wrapper fino) — sem isso o fluxo de 3 passos (~900 linhas de UI) teria sido duplicado entre os dois pontos de entrada.
11. [x] Settings: campos Username + Bio, com checagem ao vivo (debounce de 400ms) e aviso de que trocar o username quebra links antigos.
12. [x] Editor: campo URL (slug) na aba Evento (com preview `kortex.app/{username}/{slug}` e checagem ao vivo), toggle "Mostrar no meu perfil" na aba Privacidade.
13. [x] `app/types/scheduling.ts`/`app/composables/useSchedulingPages.ts`: `slug`, `showOnProfile` nos tipos e nos três construtores otimistas (`createSchedulingPage`, `updateSchedulingPage`, `duplicateSchedulingPage`) + no `normalizeSchedulingPage` — mesmo cuidado já necessário para `coverImageUrl` em `AUDITORIA_TIMEZONE_CAPA_AGENDAMENTO.md` §2.10.

### 11.1 Nota de segurança adicional (fora do escopo original, adicionada durante a implementação)

`server/utils/username.ts` ganhou uma checagem extra que o documento original não detalhava: rejeitar hífens consecutivos (`--`), e um comentário extenso explicando por que o padrão é uma *allow-list* ASCII-only — a razão real é prevenção de ataques de homóglifo/confusável (ex.: um "с" cirílico visualmente idêntico a "c" latino permitiria um username phishing quase indistinguível de um real). Isso não é uma mudança de comportamento em relação ao que já estava especificado (a regra "só a-z0-9-" já cobria isso implicitamente), só ficou documentado explicitamente para que uma mudança futura não afrouxe esse regex sem entender a implicação de segurança.
