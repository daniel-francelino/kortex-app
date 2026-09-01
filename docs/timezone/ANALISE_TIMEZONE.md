# Análise e Plano: Timezone do Usuário

> Auditoria completa de como o app determina/usa timezone hoje, causa raiz do bug relatado (Dashboard exibindo horário de Fortaleza para um usuário em Lisboa) e plano de implementação para a regra definida: **sempre tentar o timezone do navegador primeiro; só cair para `user_preferences.timezone` quando o navegador não estiver disponível** (o caso comum disso é: cálculo do lado do servidor, que nunca tem acesso ao navegador). O usuário pode trocar esse fallback manualmente, e o seletor deve ordenar pelos timezones mais usados primeiro. Inclui também um plano para centralizar toda manipulação de data/hora do app em `date-fns`/`date-fns-tz`, num arquivo de utils único, em vez de reimplementações espalhadas (seção 10) — foi essa própria falta de padronização que causou parte dos bugs listados aqui.

**Legenda de severidade:** 🔴 Crítico · 🟠 Alto · 🟡 Médio · ⚪ Baixo · 🔵 Feature nova (não é bug)

## As duas regras de resolução, em uma frase cada

**Regra 1 — qual timezone usar pra exibir/calcular uma data, a cada vez:**

```
navegador (Intl, só existe no client) → user_preferences.timezone (fallback) → 'UTC' (rede de segurança final)
```

Isso se desdobra em dois caminhos bem diferentes na prática, porque **"navegador" só existe quando há um navegador**:

- **Formatação feita no client** (qualquer componente Vue formatando uma data já recebida da API): tenta `Intl.DateTimeFormat().resolvedOptions().timeZone` primeiro, sempre. Cai pra `user_preferences.timezone` só se `Intl` falhar (praticamente nunca em navegador moderno — é mais uma rede de segurança que um caminho comum).
- **Cálculo feito no servidor** ("hoje" para o Dashboard, streak de hábito, tarefa atrasada, etc.): o servidor **não tem navegador** — não há como ele "tentar o navegador primeiro" sozinho. Pra regra valer de verdade aqui, o client precisa **enviar** o timezone que detectou junto da requisição (`?tz=Europe/Lisbon`), e o servidor usa: `tz enviado pelo client (validado) → user_preferences.timezone → 'UTC'`. Quando não há client (cron job, notificação agendada, request antiga sem esse parâmetro), cai direto pra `user_preferences.timezone`.

**Regra 2 — como `user_preferences.timezone` (o fallback) é populada:**

```
timezone == null  E  usuário faz login  →  grava o timezone do navegador, uma única vez
timezone != null  →  nunca mexe sozinho — só uma troca manual em Configurações atualiza
```

Ou seja, `null` é o estado "ainda sem preferência definida" — só existe até o primeiro login depois que essa coluna existir para aquele usuário. A partir do instante em que é preenchida (automaticamente no primeiro login, ou manualmente em Configurações depois), ela vira uma **âncora estável**: não fica perseguindo o navegador a cada viagem, só muda se o usuário pedir explicitamente. Isso é relevante porque é exatamente esse valor que os cálculos do servidor usam quando, por qualquer motivo, o client não manda `?tz=` na requisição — mais previsível ter um "fuso de casa" fixo do que ele pular sozinho toda vez que o navegador relatar um zone diferente.

---

## Resumo executivo

| # | Item | Severidade | Esforço |
|---|------|------------|---------|
| 1 | Dashboard inteiro (habits/tasks/events/journal) hardcoded em `America/Fortaleza` | 🔴 | Baixo |
| 2 | 8 endpoints server-side calculam "hoje" em UTC puro, sem noção de timezone nem de fallback | 🔴 | Médio |
| 3 | Preferência de timezone já existe no banco/API/composable, mas **nada lê de volta** | 🟠 | — (achado estrutural) |
| 4 | `user_preferences.timezone` nunca é preenchida a partir do navegador no primeiro login — fica presa em `'UTC'`, e nem dá pra saber se é "vazia" ou escolhida de propósito | 🟠 | Baixo |
| 5 | Dois seletores de timezone independentes e não sincronizados (Settings vs. Scheduling) | 🟡 | Médio |
| 6 | `goal-task-event-sync.ts` cria eventos com `event_timezone: 'UTC'` hardcoded | 🟡 | Baixo |
| 7 | Seletor de timezone não ordena por uso — pedido do usuário | 🔵 | Médio |
| 8 | API de preferências não valida se a string é um IANA timezone real | ⚪ | Baixo |
| 9 | Manipulação de data espalhada e reimplementada em vários lugares em vez de centralizada em `date-fns`/`date-fns-tz` | 🟠 | Médio-Alto |

---

## 0. O problema relatado

> "estou em lisboa com o navegador em lisboa, então deveria exibir com o horário de lisboa. E acho que está exibindo com o horário de fortaleza."

Confirmado. `server/api/life/dashboard.get.ts:17` define:

```ts
// Same zone hardcoded across the app (see index.vue's todayFormatted) —
// this is a single-tenant personal app, not a per-user-timezone product,
// so "today" is defined consistently everywhere against this one zone
// rather than the server's own UTC clock.
const DASHBOARD_TIMEZONE = 'America/Fortaleza'
```

Esse comentário (escrito numa sessão anterior, quando o único bug conhecido era "meia-noite em Fortaleza ≠ meia-noite em UTC") documentava uma decisão consciente — mas a premissa ("app single-tenant, um só timezone faz sentido") deixou de valer no momento em que o usuário passou a acessar de fora do Brasil. O mesmo hardcode aparece em mais 2 lugares:

- `app/components/dashboard/DashboardTodayEvents.vue:16` — formata o horário de cada evento do card "Agenda de hoje".
- `app/pages/app/index.vue:22` — formata o texto "Seu dia — segunda-feira, 31 de agosto de 2026".

**Resultado:** com o navegador em `Europe/Lisbon` (UTC+0/+1), tudo que passa por essas três linhas continua calculado como se o usuário estivesse em `America/Fortaleza` (UTC-3) — inclusive quais hábitos "são de hoje", se uma tarefa está atrasada, se o evento de calendário aparece no card, e a data do diário.

---

## 1. Achado estrutural mais importante: metade da infraestrutura já existe

Antes de desenhar algo novo, o achado mais relevante da auditoria: **o app já tem um sistema completo de preferência de timezone por usuário, ponta a ponta, só que órfão — nada consome o valor salvo, e ele nunca é preenchido a partir do navegador no primeiro login.**

- **Banco:** `user_preferences.timezone text not null default 'UTC'` (migration `20260315200000_notification_channels_onesignal_timezone.sql:2`).
- **API:** `GET /api/settings/preferences` e `PUT /api/settings/preferences` já leem/gravam essa coluna.
- **Composable:** `useUserPreferences()` (`app/composables/useUserPreferences.ts`) já tem `state.timezone`, `load()`, `save()`, `setTimezone(tz)` — tudo funcional.
- **UI:** `app/pages/app/settings/index.vue` já tem um `USelectMenu` de timezone completo, com botão "Usar timezone do dispositivo" (linha 65-90, 162-165), que salva via `saveTimezonePreference()`.
- **Onboarding:** `app/components/onboarding/FlowModal.vue` também tem uma etapa de timezone que grava na mesma coluna.

Ou seja: um usuário que abrir Configurações → Geral e trocar o timezone hoje **já consegue salvar** o fallback com sucesso — ele só (a) não é lido por **nada** que renderiza uma data, e (b) nunca é preenchido sozinho no primeiro login, então fica estagnado em `'UTC'` pra sempre até alguém visitar Configurações manualmente.

Isso muda o escopo do trabalho: não é "construir a feature do zero", é **"fazer o resto do app consumir o que já existe, e fazer esse valor nascer correto sozinho"** (seções 3 e 4 abaixo).

---

## 2. O padrão de conversão já usado pelo módulo de Agenda

`app/utils/calendarEventTime.ts` já resolve exatamente este problema, só que por evento (`event.eventTimezone`), não por usuário — e já segue a MESMA regra "navegador primeiro, fallback depois" que queremos generalizar:

| Função | Uso |
|---|---|
| `getEventTimeZone(event)` | resolve `event.eventTimezone` → fallback pro timezone do navegador → fallback `'UTC'` |
| `getZonedDate(dateInput, tz)` | `date-fns-tz`'s `toZonedTime` — Date cujos getters locais leem como wall-clock no `tz` dado |
| `formatZonedDateKey` / `formatEventTime` / `formatEventDate` | formatação para exibição, sempre no `tz` do evento |
| `zonedDateTimeToUtcIso(dateStr, timeStr, tz)` | direção inversa: wall-clock local → instante UTC real, via `fromZonedTime` |

**Recomendação:** criar `useUserTimezone()` (client), que resolve exatamente na ordem `Intl.DateTimeFormat().resolvedOptions().timeZone → useUserPreferences().state.timezone → 'UTC'`, e um helper server-side equivalente (seção 3) que resolve `tz recebido do client (validado) → user_preferences.timezone → 'UTC'`.

---

## 3. 🔴 Bug: 8 endpoints server-side calculam "hoje" em UTC puro, sem fallback nenhum

O servidor não tem navegador — a única forma de ele "tentar o navegador primeiro" é o **client mandar o timezone detectado** em cada requisição relevante. Hoje nenhum destes endpoints recebe isso nem lê `user_preferences.timezone` (a maioria nem faz a query):

| Endpoint | Linha | O que quebra |
|---|---|---|
| `server/api/life/dashboard.get.ts` | 17, 29, 159-160 | timezone fixo em `America/Fortaleza` (§0) — precisa aceitar `tz` do client |
| `server/api/habits/today.get.ts` | 17, 19 | `todayStr`/`dayOfWeek` via `new Date().toISOString()` — decide se um hábito "é de hoje" |
| `server/api/journal/today.get.ts` | 9, 16 | `today` usado para buscar a entrada "de hoje" — perto da meia-noite local, pega o dia UTC errado |
| `server/api/tasks/index.get.ts` | 66-67 | filtro de tarefa atrasada (`due_date < today`) |
| `server/api/tasks/insights.get.ts` | 19, 24-26 | mesmo filtro, endpoint separado |
| `server/api/goals/[id]/index.get.ts` | 55 | fallback de data ao computar progresso de meta vinculada a hábito |
| `server/api/life/insights.get.ts` | 9-10, 22-28, 137-139 | janelas "últimos 7/30 dias" para os gráficos de insight |
| `server/utils/habit-stacks.ts` | 31-33, 44 | decide se uma query de "stack" de hábitos é a atual |
| `server/api/habits/log.post.ts` | 153-181 | **cálculo de streak** — `new Date(); .setHours(0,0,0,0)` usa o timezone *do processo Node*, não UTC puro (diferença sutil do resto da lista); o cursor de "andar pra trás dia a dia" logo depois usa `.toISOString().split('T')[0]` (UTC), uma inconsistência interna que só não causa erro hoje porque o servidor roda em UTC |

Lisboa (UTC+0 no inverno, UTC+1 no verão) sofre bem menos que Fortaleza (UTC-3) sofria, mas o bug é o mesmo em espécie: perto da virada de dia local, "hoje" no servidor e "hoje" na tela do usuário divergem.

### Desenho do fix

**1. Helper compartilhado**, ex. `server/utils/user-timezone.ts`:

```ts
const IANA_ZONES = new Set(Intl.supportedValuesOf('timeZone'))

function isValidTimeZone(tz: unknown): tz is string {
  return typeof tz === 'string' && IANA_ZONES.has(tz)
}

// tzFromClient = o que veio de `?tz=` na querystring dessa requisição.
// Só é confiável se for de fato um IANA timezone — nunca usar direto sem validar.
export async function resolveUserTimezone(
  supabase: SupabaseClient,
  userId: string,
  tzFromClient?: string
): Promise<string> {
  if (isValidTimeZone(tzFromClient)) return tzFromClient

  const { data } = await supabase
    .from('user_preferences')
    .select('timezone')
    .eq('user_id', userId)
    .maybeSingle()

  return isValidTimeZone(data?.timezone) ? data!.timezone : 'UTC'
}
```

**2. Cada endpoint** passa a aceitar `tz` como query param opcional (zod: `tz: z.string().optional()`) e chama `resolveUserTimezone(supabase, user.id, params.tz)` antes de calcular "hoje" — trocando `new Date().toISOString().split('T')[0]` por `formatInTimeZone(new Date(), resolvedTz, 'yyyy-MM-dd')`, mesmo padrão que `dashboard.get.ts` já usa hoje para `DASHBOARD_TIMEZONE`.

**3. Cada `useFetch`/`$fetch` do lado client** (`useLifeOS.ts`, `useHabits`, `useTasks`, etc.) passa a mandar `tz: Intl.DateTimeFormat().resolvedOptions().timeZone` na query de toda chamada que hoje não manda nada.

**Vantagem concreta:** `dashboard.get.ts` **já faz** um `select` em `user_preferences` (linhas 204-208, para checar PIN do diário) — o fallback pode reaproveitar essa mesma query em vez de duplicar, sem round-trip extra.

---

## 4. 🟠 Bug: `user_preferences.timezone` nunca é populada sozinha (e não dá pra saber se está "vazia")

O fallback só é bom fallback se estiver **razoavelmente correto** mesmo quando o usuário nunca abriu Configurações — que é o caso comum. Hoje:

1. `BRAND_THEME.timezone` e `PUBLIC_THEME.timezone` (`useUserPreferences.ts:33,40`) = `'UTC'` — não o timezone do navegador.
2. A coluna no banco tem `not null default 'UTC'` — todo usuário novo nasce com `timezone = 'UTC'`, **indistinguível** de um usuário que escolheu UTC de propósito.
3. Nada, em lugar nenhum do app, **grava automaticamente** o timezone detectado do navegador nessa coluna. O único jeito de trocar é o usuário ir manualmente em Configurações → Geral → "Usar timezone do dispositivo".

Resultado: pra qualquer usuário que nunca visitou essa tela, o fallback fica travado em `'UTC'` para sempre — inclusive pros 8 endpoints da seção 3, no raro caso de o client não conseguir mandar `tz` (ex. uma aba antiga aberta antes do deploy do fix).

### Fix — regra 2 (ver topo do documento): preencher uma vez no login, nunca mais sozinho

**1. Migração de banco** — tornar a coluna nullable, sem default:

```sql
alter table user_preferences
  alter column timezone drop not null,
  alter column timezone drop default;
```

`timezone = null` passa a significar, sem ambiguidade, "nunca foi definida — nem pelo usuário, nem automaticamente". Linhas já existentes com `'UTC'` continuam como estão (ambíguas por já terem sido escritas sob a regra antiga) — não há necessidade de migrar dados retroativamente, é um app pessoal de poucos usuários; o comportamento novo passa a valer a partir daqui pra frente.

**2. No fluxo de login** (onde a sessão autenticada é confirmada pela primeira vez no client — ou, de forma equivalente e mais simples de implementar, dentro de `useUserPreferences().load()`, que já roda uma vez por sessão de app): depois do `GET /api/settings/preferences` resolver, checar se `timezone` veio `null`. Se sim — **e só nesse caso** — resolver `Intl.DateTimeFormat().resolvedOptions().timeZone` e chamar `setTimezone()` imediatamente, uma única vez, silenciosamente (sem toast). Depois desse primeiro preenchimento a coluna nunca mais fica `null`, então esse bloco nunca mais executa pra aquele usuário — a próxima mudança só acontece se ele for lá e trocar manualmente.

```ts
// dentro de useUserPreferences(), dando suporte à regra "só preenche quando null"
async function load() {
  if (state.value.loaded) return

  try {
    const data = await $fetch<UserPreferences>('/api/settings/preferences')
    state.value.primary_color = data.primary_color
    state.value.neutral_color = data.neutral_color
    state.value.color_mode = data.color_mode
    state.value.timezone = data.timezone ?? 'UTC' // exibição imediata; nunca persiste esse 'UTC' de volta sozinho
    state.value.loaded = true

    // Regra 2: só a primeira vez, só quando realmente nunca foi definida.
    if (data.timezone === null && import.meta.client) {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (browserTz) void setTimezone(browserTz)
    }
  } catch {
    state.value.loaded = true
  }
}
```

**3. Server** (`preferences.get.ts`) passa a devolver `timezone: null` de verdade quando a coluna estiver `null` (hoje faz `data.timezone ?? 'UTC'` — essa coerção pro client é que precisa sumir daqui, o `'UTC'` de exibição vira responsabilidade só do client, como no trecho acima).

**4. Fallback dos 8 endpoints da seção 3** continua igual: quando `resolveUserTimezone()` ler a coluna e ela ainda estiver `null` (janela entre o login e o `setTimezone()` do passo 2 completar, ou uma conta que nunca logou pelo client web), cai pra `'UTC'` — a rede de segurança final da Regra 1 continua valendo.

**Efeito colateral bom:** isso também deixa o fallback pronto pra qualquer contexto sem navegador que precisar dele no futuro — por exemplo notificações agendadas server-side (ver `docs/notifications/ARQUITETURA_CRON_NOTIFICACOES.md`), que precisam saber "que horas são, na cabeça do usuário" sem nenhuma requisição HTTP em andamento — com a vantagem de ser uma âncora estável (o "fuso de casa" do usuário), não algo que pula a cada viagem.

---

## 5. 🟡 Dois seletores de timezone desincronizados

`app/pages/app/scheduling/[id].vue:48,173-175` tem seu **próprio** `timezoneOptions` (construído independente, mesmo padrão `Intl.supportedValuesOf('timeZone')`) para o timezone de disponibilidade da página de agendamento pública. Ele não lê nem escreve `user_preferences.timezone` — é um conceito propositalmente separado (o timezone de "onde estão meus horários de agendamento" pode ser diferente do fallback usado pro resto do app), mas **a lista de opções e a lógica de detecção estão duplicadas** em vez de compartilhadas.

**Fix:** extrair a lógica de "montar lista de opções de timezone" (incluindo a ordenação por uso da seção 7) para um composable único, ex. `useTimezoneOptions()`, usado tanto em Settings quanto em Scheduling — cada um decide separadamente o que fazer com a seleção, mas a UI/lista fica consistente.

---

## 6. 🟡 `goal-task-event-sync.ts` cria eventos com timezone fixo errado

`app/utils/goal-task-event-sync.ts:194` — ao criar automaticamente um evento de calendário a partir de uma tarefa de meta com data de vencimento, grava `event_timezone: 'UTC'` hardcoded, em vez do timezone do usuário. Comparar com `server/utils/habit-event-sync.ts:170`, que já faz esse cálculo corretamente para eventos sincronizados a partir de hábitos — o fix aqui é replicar o mesmo padrão, usando `resolveUserTimezone()` (seção 3) já que essa sincronização roda server-side.

---

## 7. 🔵 Feature: seletor ordenado pelos timezones mais usados

Requisito do usuário: *"nas opções fique em primeiro os que ele mais utiliza."* Este seletor agora representa "o fallback" (seção 4), não "o timezone ativo" — mas a lógica de ordenação pedida vale igual. Não existe hoje nenhum rastro de uso de timezone — precisa ser criado.

**Desenho proposto:**
- Nova coluna `user_preferences.timezone_usage jsonb not null default '{}'` — mapa `{ [ianaZone: string]: number }` de contagem de vezes que o usuário selecionou aquele zone. Incrementa em dois momentos: (a) o preenchimento automático único da Regra 2 (seção 4) quando `timezone` era `null`, e (b) toda troca manual feita em Configurações — **não** incrementa sozinho depois disso, já que a Regra 2 só roda uma vez por usuário; viajar sem trocar manualmente não conta como "uso" de um novo zone.
- `timezoneOptions` (tanto em `settings/index.vue` quanto no novo `useTimezoneOptions()` da seção 5) passa a ordenar:
  1. Timezone detectado do navegador agora (sempre no topo — é o que a Regra 1, no topo do documento, vai usar de qualquer forma pra exibição).
  2. Fallback salvo atualmente, se diferente do navegador.
  3. Demais timezones com uso > 0, ordenados por contagem decrescente.
  4. Resto da lista IANA completa, alfabética (como já é hoje).

**Alternativa mais simples** (se preferir não adicionar coluna nova agora): usar **recência** em vez de frequência — guardar só os últimos N timezones distintos vistos, mais recente primeiro, sem contagem. Mais barato de implementar, cobre o caso de uso mais comum (usuário viaja entre 2-3 fusos) quase tão bem quanto frequência real, mas não é literalmente o que foi pedido ("mais utiliza").

---

## 8. ⚪ Sem validação de IANA timezone

`server/api/settings/preferences.put.ts` valida só `z.string().trim().min(1).max(120)` — qualquer string passa, inclusive um valor inválido que quebraria `formatInTimeZone`/`Intl.DateTimeFormat` em qualquer lugar que tentar usá-lo depois. Fix simples: validar contra `Intl.supportedValuesOf('timeZone')` no server (Node 20+ suporta nativamente) — a mesma função `isValidTimeZone()` proposta na seção 3 cobre isso.

---

## 9. Locais que usam formatação implícita (sem bug de fato, mas já seguem a regra certa)

Fora do Dashboard, praticamente todo o resto do app (Journal, Habits, Tasks, Goals, Notes) usa `toLocaleDateString('pt-BR')`/`toLocaleTimeString('pt-BR')` **sem** `timeZone` explícito. Como esses componentes só renderizam no client (nunca durante SSR), isso **já segue exatamente a regra pedida** — mostra a hora no timezone do navegador de quem está olhando, sem precisar de nenhuma mudança. Não precisam ser tocados.

---

## 10. 🟠 Padronização: centralizar toda manipulação de data em `date-fns`/`date-fns-tz`

**Pedido explícito do usuário:** em todos os lugares do app, manipulação de data/hora deve usar as libs já disponíveis no projeto — `date-fns` e `date-fns-tz` — em vez de código ad-hoc reimplementando a mesma coisa de formas diferentes. E centralizar todas as funções utilitárias de data/hora em um (ou poucos) arquivo(s) de utils, em vez de espalhadas.

Esse pedido não é cosmético — **a própria auditoria acima encontrou bugs reais causados exatamente por essa falta de padronização**: `dashboard.get.ts` reimplementa manualmente a construção de uma data a partir de `yyyy-MM-dd` (`new Date(dateYear, dateMonth-1, dateDay)`); `habits/log.post.ts` faz o cálculo de streak com `.setHours(0,0,0,0)` (timezone do processo) misturado com `.toISOString().split('T')[0]` (UTC) no mesmo loop — duas fontes de verdade diferentes convivendo na mesma função; 7 outros endpoints reimplementam "hoje" cada um do seu jeito. Cada reimplementação é uma chance nova de errar um detalhe de fuso, exatamente como já aconteceu.

### 10.1. Onde centralizar

O projeto já tem um precedente correto pra isso: `app/utils/calendarEventTime.ts` (ver seção 2) — só que com escopo estreito (funções tomam um `CalendarEvent` como parâmetro, não uma data solta). Proposta:

```
shared/utils/dateTime.ts       ← funções genéricas, usadas por app/ E server/ (Nuxt 4 tem
                                  a pasta shared/ exatamente pra isso — código isomórfico,
                                  sem ambiguidade de auto-import entre client/server)
app/utils/calendarEventTime.ts ← fica só com o que é específico de CalendarEvent
                                  (getEventTimeZone, formatEventTime, etc.), mas passa a
                                  implementar essas funções EM CIMA das genéricas do
                                  shared/utils/dateTime.ts, em vez de duplicar toZonedTime/
                                  formatInTimeZone/fromZonedTime direto
server/utils/user-timezone.ts  ← (proposto na seção 3) fica só com resolveUserTimezone()/
                                  isValidTimeZone(), que já dependem do shared/utils também
```

Se o projeto não quiser adotar a pasta `shared/` do Nuxt 4 agora, a alternativa é duplicar um arquivo idêntico em `app/utils/dateTime.ts` e `server/utils/dateTime.ts` — pior (dois lugares pra manter iguais), mas ainda centraliza dentro de cada lado. **Recomendação: usar `shared/utils/dateTime.ts`**, é o motivo dessa pasta existir.

### 10.2. Inventário de funções propostas para `shared/utils/dateTime.ts`

| Função | Assunto sobre `date-fns`/`date-fns-tz` | Substitui |
|---|---|---|
| `todayInZone(tz)` | `formatInTimeZone(new Date(), tz, 'yyyy-MM-dd')` | `new Date().toISOString().split('T')[0]` (raw UTC) espalhado em 7+ endpoints; `DASHBOARD_TIMEZONE` hardcoded em `dashboard.get.ts:29` |
| `parseCalendarDate(dateStr)` | `parse(dateStr, 'yyyy-MM-dd', new Date())` | `new Date(dateYear, dateMonth-1, dateDay)` manual em `dashboard.get.ts:31-32` |
| `getZonedDate(dateInput, tz)` | `toZonedTime` (já existe em `calendarEventTime.ts`, só promover pra cá) | — |
| `getZonedDateParts(dateInput, tz)` | idem (já existe) | — |
| `formatZonedDateKey(dateInput, tz)` | idem (já existe) | — |
| `zonedDateTimeToUtcIso(dateStr, timeStr, tz)` | idem (já existe) | — |
| `startOfDayInZone(dateInput, tz)` / `endOfDayInZone(dateInput, tz)` | `fromZonedTime(startOfDay(...)/endOfDay(...), tz)` | `dayStart`/`dayEnd` calculados na mão em `dashboard.get.ts:159-160`; padrão similar precisa existir pros outros 7 endpoints da seção 3 |
| `addDaysInZone(dateInput, amount, tz)` | `date-fns`'s `addDays` | `cursor.setDate(cursor.getDate() - 1)` (loop de streak em `habits/log.post.ts:178-181`); qualquer outro `.setDate(...)`/`.getDate() ± N` restante |
| `isSameCalendarDay(a, b, tz)` | `isSameDay` após `toZonedTime` nos dois | comparações de data feitas via string ou via `.getTime()` bruto |
| `differenceInCalendarDaysInZone(a, b, tz)` | `differenceInCalendarDays` após zonar os dois | gaps de streak, "dias atrasado" calculados manualmente |
| `formatDisplay(dateInput, formatStr, tz, locale = ptBR)` | `date-fns`'s `format()` com `date-fns/locale/pt-BR`, após `toZonedTime` | os ~20 call-sites de `toLocaleDateString('pt-BR', {...})`/`toLocaleTimeString('pt-BR', {...})`/`Intl.DateTimeFormat('pt-BR', {...})` listados na seção 9 — ver observação abaixo |
| `isValidTimeZone(tz)` | `Intl.supportedValuesOf('timeZone')` (não é `date-fns`, mas mora junto por ser parte do mesmo domínio) | valida antes de repassar pra qualquer função acima — mesma que `isValidTimeZone()` da seção 3/8 |

**Sobre `formatDisplay` e a seção 9:** hoje esses ~20 lugares (`EntryDetailModal.vue`, `EntryList.vue`, `TodayEditor.vue`, `ChangeHistoryList.vue`, `DetailSlideover.vue` de habits/tasks/goals, `HeatmapChart.vue`, `IdentityManagerModal.vue`, `InsightsPanel.vue`, `ShareImageCard.vue`, `TodayList.vue`, `WeeklyReview.vue` de habits e goals, `TasksList.vue`, `JournalLinker.vue`, `TaskRow.vue`, `NoteEditor.vue`, `NotePropertiesPanel.vue` — inventário completo com linha exata na auditoria original) usam `toLocaleDateString`/`Intl.DateTimeFormat` nativo do JS. Isso **não é um bug de fuso** (seção 9 já explica por quê), mas é exatamente o tipo de "função aleatória reimplementada em 20 lugares" que o pedido do usuário quer eliminar — cada um escreve suas próprias `options` de formatação (`{ day: '2-digit', month: 'short', ... }`), com pequenas inconsistências de estilo entre telas. Centralizar em `formatDisplay()` com um punhado de format-strings nomeados (ex. `formatDisplay(date, 'dd MMM yyyy')`, `formatDisplay(date, 'HH:mm')`) dá o mesmo resultado visual com uma única implementação, e already ganha de graça a resolução de timezone da Regra 1 (seção do topo) caso algum desses locais precise dela no futuro.

### 10.3. Inventário completo de locais a migrar

**Arquivos com manipulação de data manual (`.setDate`/`.setHours`/`.getDate`/construção manual de `Date`/`.toISOString().split('T')[0]`):**

| Arquivo:linha | Padrão atual | Vira |
|---|---|---|
| `server/api/life/dashboard.get.ts:29-32` | `formatInTimeZone(...)` + `new Date(dateYear, dateMonth-1, dateDay)` | `todayInZone(tz)` + `parseCalendarDate(date)` |
| `server/api/life/dashboard.get.ts:159-160` | `fromZonedTime(localMidnight, tz)`/`fromZonedTime(new Date(y,m,d,23,59,59,999), tz)` | `startOfDayInZone(date, tz)`/`endOfDayInZone(date, tz)` |
| `server/api/habits/today.get.ts:17,19` | `new Date().toISOString()`, `new Date(\`${date}T12:00:00Z\`).getUTCDay()` | `todayInZone(tz)`, `getDay(parseCalendarDate(date))` (padrão que `dashboard.get.ts` já usa corretamente pra `dayOfWeek`) |
| `server/api/journal/today.get.ts:9,16` | `new Date().toISOString().split('T')[0]` | `todayInZone(tz)` |
| `server/api/tasks/index.get.ts:66-67` | idem | `todayInZone(tz)` |
| `server/api/tasks/insights.get.ts:19,24-26` | idem | `todayInZone(tz)` + `addDaysInZone`/`subDays` pras janelas de 7/30 dias |
| `server/api/goals/[id]/index.get.ts:55` | idem | `todayInZone(tz)` |
| `server/api/life/insights.get.ts:9-10,22-28,137-139` | idem, + loop `cursor` dia a dia | `todayInZone(tz)` + `addDaysInZone` no loop, em vez de mutação manual |
| `server/utils/habit-stacks.ts:31-33` (`getTodayDate()`) | idem | `todayInZone(tz)` |
| `server/api/habits/log.post.ts:153-181` | `setHours(0,0,0,0)` + `setDate(getDate()-1)` + `.toISOString().split('T')[0]` (3 técnicas diferentes na mesma função) | `startOfDayInZone`, `subDays` (`date-fns`), `formatZonedDateKey` |

**Arquivos com formatação de exibição nativa (`toLocaleDateString`/`toLocaleTimeString`/`Intl.DateTimeFormat` sem passar por um helper central):** os ~20 locais listados na seção 9 e no item 10.2 acima — todos migram para `formatDisplay()`.

**Outros arquivos com timezone hardcoded** (já cobertos nas seções 0 e 6, incluídos aqui só pra reforçar que a correção **é** essa centralização, não um hardcode diferente): `DashboardTodayEvents.vue:16`, `index.vue:22`, `goal-task-event-sync.ts:194`.

### 10.4. O que NÃO migrar

- Código que já usa `date-fns`/`date-fns-tz` corretamente não precisa ser tocado — várias partes do app (Agenda, boa parte de `dashboard.get.ts` fora dos pontos listados acima) já seguem o padrão certo desde correções de sessões anteriores.
- Validações de formato via `zod` (`z.string().regex(/^\d{4}-\d{2}-\d{2}$/)`, etc.) continuam como estão — são validação de shape de string, não manipulação de data.
- IDs/timestamps brutos vindos do Supabase (`created_at`, `updated_at` como ISO string) não precisam de conversão só por existir — só quando o valor é efetivamente exibido, comparado ou usado em aritmética de data.

---

## 11. Ordem de implementação recomendada

1. **`shared/utils/dateTime.ts`** (seção 10): criar o arquivo centralizado primeiro — `todayInZone`, `parseCalendarDate`, `startOfDayInZone`/`endOfDayInZone`, `addDaysInZone`, `isSameCalendarDay`, `differenceInCalendarDaysInZone`, `formatDisplay`, `isValidTimeZone`, e promover `getZonedDate`/`getZonedDateParts`/`formatZonedDateKey`/`zonedDateTimeToUtcIso` de `calendarEventTime.ts` pra cá. Tudo daqui pra frente já nasce em cima dele, em vez de precisar de uma segunda passada de refactor depois.
2. **Migração de banco** (seção 4): `timezone` vira nullable, sem default.
3. **`server/utils/user-timezone.ts`**: helper `resolveUserTimezone()` (seção 3), implementado sobre `isValidTimeZone()` do passo 1.
4. **`preferences.get.ts`**: parar de coagir `timezone` pra `'UTC'` na resposta — devolver `null` de verdade quando a coluna estiver `null`.
5. **`useUserPreferences().load()`**: implementar a Regra 2 — quando `timezone` vier `null`, resolver do navegador e chamar `setTimezone()` uma única vez, silenciosamente (seção 4).
6. **`dashboard.get.ts`**: aceitar `tz` opcional na query; trocar `DASHBOARD_TIMEZONE` fixo, a construção manual de data e os cálculos de `dayStart`/`dayEnd` pelas funções do passo 1 (`resolveUserTimezone` + `todayInZone` + `parseCalendarDate` + `startOfDayInZone`/`endOfDayInZone`) — resolve o bug relatado originalmente.
7. **`useLifeOS.ts`**: mandar `tz: Intl.DateTimeFormat().resolvedOptions().timeZone` na chamada a `/api/life/dashboard` (e `/api/life/insights`).
8. **`DashboardTodayEvents.vue` / `index.vue`**: parar de hardcodar `'America/Fortaleza'`, formatar direto com `formatDisplay()` usando o timezone do navegador (client-side, sem depender do payload do servidor).
9. **Demais 7 endpoints da seção 3/10.3**: mesma técnica dos passos 3 e 6, um por um — cada um trocando sua reimplementação manual de "hoje"/streak/janela de dias pelas funções do passo 1, e recebendo `tz` do respectivo composable client-side.
10. **`goal-task-event-sync.ts`** (seção 6): usar `resolveUserTimezone()` em vez de `'UTC'` fixo.
11. **Os ~20 locais de `toLocaleDateString`/`Intl.DateTimeFormat` nativo** (seção 10.2/10.3): migrar para `formatDisplay()` — pode ser feito em paralelo com qualquer um dos passos acima, é independente do resto do plano.
12. **`useTimezoneOptions()` compartilhado + ordenação por uso** (seções 5 e 7).
13. **Validação de IANA timezone no PUT** (seção 8) — reaproveita `isValidTimeZone()` do passo 1.

Itens 1-8 resolvem diretamente o que foi relatado (as duas regras + o bug do Dashboard, já nascendo sobre a base centralizada). 9-13 fecham o resto da auditoria, a padronização de `date-fns` em todo o app e a feature de ordenação pedida.
