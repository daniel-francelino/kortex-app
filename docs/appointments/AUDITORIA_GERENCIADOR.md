# Auditoria do gerenciador de agendamentos (Agenda)

Auditoria completa do módulo de Agendamento — client (`useAppointments.ts`, views de
Dia/Semana/Mês, modais/popovers) e server (`server/api/appointments/**`,
`server/utils/recurrence.ts`, `server/utils/habit-event-sync.ts`) — motivada por bugs
recorrentes reportados pelo usuário. Todos os achados abaixo foram verificados lendo o
código-fonte diretamente (arquivo:linha citados); nenhum item é especulativo sem
estar marcado como tal.

Ver também [`PLANO_OFFLINE_AGENDA.md`](./PLANO_OFFLINE_AGENDA.md) — descreve a
arquitetura *pretendida* de otimismo/offline. Este documento audita o estado *real*
do código contra essa arquitetura e contra o resto do módulo.

## Como ler este documento

- **🔴 Crítico** — bug de segurança ou corrupção de dados, deve ser corrigido antes de
  qualquer outra coisa.
- **🟠 Alto** — comportamento incorreto que o usuário encontra no uso normal.
- **🟡 Médio** — comportamento incorreto em cenários menos frequentes, ou gap de
  robustez.
- **⚪ Baixo** — code smell, risco latente não disparado hoje, ou item apenas
  parcialmente verificado.
- **🔵 Feature** — não é bug; é funcionalidade pedida (TODO) que nunca foi
  implementada.

---

## Resumo executivo — os 10 itens mais importantes

**Status:** todos os 10 abaixo, mais 3.1/3.2/3.6 e o code smell do `AgendaView.vue`
morto, foram corrigidos numa sessão de implementação subsequente a esta auditoria.
3.4 e 3.5 ficaram de fora deliberadamente (ver notas nas seções correspondentes). A
seção 5 (features) não foi implementada — não são bugs, ficam para priorização de
produto separada, como a seção 6 já recomendava.

| # | Severidade | Item | Onde | Status |
|---|---|---|---|---|
| 1 | 🔴 | IDOR: `calendarId` no GET de eventos ignora dono/compartilhamento | `server/api/appointments/events.get.ts:29-30` | ✅ Corrigido |
| 2 | 🔴 | "Editar todas as ocorrências" corrompe a série (apaga ocorrências anteriores) | `app/components/appointments/EventDetailSlideover.vue:258-265` | ✅ Corrigido (ver nota na seção 1.2 — a causa raiz real era outra) |
| 3 | 🟠 | Toda falha de validação Zod em `server/api/appointments/**` retorna 500, não 400 | Todos os endpoints com `.parse()` | ✅ Corrigido |
| 4 | 🟠 | Ocorrência movida (override) é incluída/excluída do range usando a data *original*, não a nova | `server/api/appointments/events.get.ts:237` | ✅ Corrigido |
| 5 | 🟠 | Fila offline não tem limite de retry — mutação que falha permanentemente fica tentando para sempre, sem avisar o usuário | `app/composables/useAppointments.ts` (`drainMutationQueue`) | ✅ Corrigido |
| 6 | 🟠 | Detecção de conexão confia só em `navigator.onLine`, sem verificação real | `app/composables/useConnectionStatus.ts` | 🟡 Mitigado (heurística ampliada; nenhum health-check real foi adicionado) |
| 7 | 🟠 | Bucketing de dia em Mês/Semana/Dia usa fuso do navegador, evento usa `eventTimezone` — podem divergir | `MonthView.vue`, `WeekView.vue`, `DayView.vue` (funções `getDayEvents`/`isOnDay`) | ✅ Corrigido |
| 8 | 🟠 | Clique em horário vazio no modo Dia sempre cria evento às 09:00–10:00, ignora o horário clicado | `app/pages/app/appointments.vue` (`onDaySlotSelect`/`onQuickCreate`) | ✅ Corrigido |
| 9 | 🟡 | Evento de hábito vai para o primeiro calendário do usuário, não para o calendário reservado "Hábitos" | `server/utils/habit-event-sync.ts` (`resolveTargetCalendarId`) | ✅ Corrigido |
| 10 | 🟡 | Endpoints de ocorrência (modify/split/cancel) não respeitam permissão de calendário compartilhado — só checam `owner_user_id` | `modify-occurrence.post.ts`, `split-series.post.ts`, `cancel-occurrence.post.ts` | ✅ Corrigido |

---

## 0. Já corrigido nesta sessão (para registro histórico)

Estes bugs já foram encontrados e corrigidos durante o trabalho que motivou esta
auditoria — listados aqui para não serem re-investigados à toa:

- **`useAppointments()` não era singleton** — cada componente (`EventDetailSlideover`,
  `EventCreateModal`, `CalendarCreateModal`, páginas de scheduling) tinha sua própria
  cópia isolada de `eventsByKey`/`calendarsById`. Uma edição otimista feita num
  componente nunca aparecia na visão de outro sem um refetch completo. Corrigido com
  `createSharedComposable` (mesmo padrão de `useDashboard`/`useNotifications`).
- **`isEventInCurrentView()` comparava `viewFrom`/`viewTo` (strings `yyyy-MM-dd`)
  como se fossem meia-noite UTC**, não meia-noite local — no modo Dia (onde
  `viewFrom === viewTo`), isso colapsava o "range" pra um instante de largura zero.
  Toda atualização otimista (arrastar, editar) reavaliava a permanência do evento na
  view usando esse range quebrado e o evento sumia da tela. Corrigido com boundaries
  locais reais (`parseLocalDayBoundary`).
- **`reconcile()` de `updateEvent()` nunca reverificava a permanência na view** após a
  resposta do servidor — só fazia upsert no store. Um evento que a otimista tinha
  (incorretamente) removido da view ficava sumido mesmo depois do PATCH ter tido
  sucesso; só um refresh completo corrigia. Corrigido: `reconcile` agora reavalia
  `isEventInCurrentView` contra o evento confirmado pelo servidor.
- **`refreshEvents()` redundante** depois de mutações puramente otimistas
  (drag-and-drop, edição simples) — chamava um refetch completo que trocava
  `eventsStatus` pra `'pending'`, e as views mapeavam isso direto pra um skeleton de
  tela cheia. Corrigido: removido nos casos onde o optimistic update já é suficiente
  (mantido só onde a mutação genuinamente não é otimista, ex. `modifyOccurrence`).
- **Skeleton de tela cheia em todo refetch em segundo plano** — `eventsStatus ===
  'pending'` era usado direto como `loading` nas views. Corrigido com
  `eventsInitialLoading`, que só é `true` no primeiro carregamento (mesmo padrão de
  `notesListInitialLoading`).

---

## 1. 🔴 Crítico

### 1.1 IDOR — `GET /api/appointments/events?calendarId=X` não verifica posse/compartilhamento — ✅ Corrigido

**Onde:** `server/api/appointments/events.get.ts:27-31`

```ts
let calendarIds: string[] = []
if (params.calendarId) {
  calendarIds = [params.calendarId]
} else {
  // ... calcula ownIds ∪ sharedIds ...
}
```

Quando `calendarId` é passado, o endpoint pula inteiramente o cálculo de
"calendários próprios ∪ compartilhados aceitos" e usa o valor cru do query param.
`getSupabaseAdminClient()` (`server/utils/supabase.ts`) usa a **service-role key**
(bypassa RLS), então não existe nenhuma outra camada de defesa depois disso.

**Cenário de exploração:** qualquer usuário autenticado faz
`GET /api/appointments/events?calendarId=<uuid-de-calendario-de-outro-usuario>` e
recebe de volta título, descrição, local e horário de todos os eventos daquele
calendário — de um usuário completamente diferente, sem qualquer relação de
compartilhamento.

**Correção:** sempre calcular `ownIds ∪ sharedIds` primeiro; se `params.calendarId`
foi passado, verificar que ele está contido nesse conjunto antes de usá-lo como
filtro (senão, retornar vazio ou 403).

### 1.2 "Editar todas as ocorrências" podia mover o `DTSTART` da série e apagar ocorrências anteriores — ✅ Corrigido

**Onde:** `app/components/appointments/EventDetailSlideover.vue` (`saveWithScope`,
escopo `'all'`), `app/pages/app/appointments.vue` (`onPopoverEdit`)

**Correção do relato original abaixo:** ao implementar a correção, o rastreamento
completo do fluxo mostrou que a causa raiz é o oposto do que a análise original
descreveu — vale registrar aqui para quem for revisar o diff.

O texto original dizia que `pending.startAt`/`endAt` carregava a data da *ocorrência
clicada*. Na verdade, `onPopoverEdit()` (`appointments.vue`) fazia:

```ts
selectedEvent.value = evt              // 1. a ocorrência clicada (data correta)
// ...
const detail = await fetchEventDetail(evt.id)   // 2. GET /events/[id]
selectedEvent.value = { ...detail, recurrenceId: evt.recurrenceId ?? ... }
```

`GET /api/appointments/events/[id]` (`events/[id].get.ts`) sempre lê a linha
**mestre** da série diretamente — nunca uma ocorrência expandida — então
`detail.startAt`/`endAt` é sempre o `DTSTART`/`DTEND` real da série. Como o spread
de `detail` vem primeiro e nada depois sobrescreve `startAt`/`endAt`, o formulário de
edição (`state.startDate`, populado a partir de `props.event.startAt` no `watch`)
**sempre mostrava a data original da série, nunca a data da ocorrência clicada** —
para qualquer escopo, não só "todas as ocorrências".

Efeito prático por escopo:
- **"Todas as ocorrências"**: já operava (sem querer) sobre a data do `DTSTART`, então
  normalmente parecia funcionar — a menos que o usuário alterasse a data mostrada
  achando que era a da ocorrência que clicou.
- **"Somente esta"/"Esta e as seguintes"**: aqui estava o bug real. O usuário abre a
  10ª ocorrência (ex. em março), o formulário mostra a data da 1ª ocorrência (ex.
  janeiro). Se o usuário só ajustar o horário — sem notar que a data está errada — o
  `modifyOccurrence`/`splitSeries` aplicava a exceção/split na data de janeiro, não
  na ocorrência de março que o usuário realmente queria editar.

**O que foi implementado:**
1. `onPopoverEdit()` agora mantém `startAt`/`endAt` da **ocorrência clicada** (`evt`)
   no `selectedEvent` mesclado, em vez de deixar o `detail` (mestre) sobrescrever —
   o formulário de edição passou a refletir corretamente o que foi clicado, em
   qualquer escopo.
2. Um novo ref `selectedEventSeriesRoot` guarda o `detail` (mestre) separadamente,
   passado como prop `series-root` para `EventDetailSlideover`.
3. `saveWithScope('all')` agora calcula o delta entre a data editada e a data
   *original da ocorrência* (`getZonedDate(props.event.startAt, tz)`), e aplica esse
   mesmo delta ao `startAt`/`endAt` real da série (`seriesRoot`) — em vez de enviar a
   data absoluta da ocorrência como novo `DTSTART`. Preserva a âncora da série
   corretamente e ainda permite mover a série inteira de propósito (o delta captura
   tanto mudança de horário quanto de data).

---

## 2. 🟠 Alto

### 2.1 Toda falha de validação Zod vira 500, não 400 — ✅ Corrigido (helper `parseOrThrow` em `server/utils/validation.ts`, aplicado em todos os endpoints de `server/api/appointments/**`; schemas `z.string().datetime()` também migrados para `{ offset: true }`)

**Onde:** não existe `server/middleware/` nem `server/plugins/` no projeto (confirmado
— os únicos diretórios em `server/` são `api/` e `utils/`). Nenhum hook global de
erro mapeia `ZodError` para um `H3Error` com `statusCode: 400`.

Todo endpoint chama `schema.parse(body)`/`.parse(query)` direto (ex.:
`events.post.ts:29`, `events/[id].patch.ts:27`, `modify-occurrence.post.ts:29`,
`split-series.post.ts:34`, `cancel-occurrence.post.ts:18`, `calendars.post.ts:16`).
Um `ZodError` lançado dentro de um `eventHandler` do h3/Nitro que **não** foi criado
via `createError()` vira um `500 Internal Server Error` genérico — não um `400` com a
mensagem de validação.

**Isso é a causa mais provável do TODO "corrigir erro 500 ao tentar duplicar um
evento"**: `onPopoverDuplicate` (`app/pages/app/appointments.vue`) envia
`title: \`${evt.title} (cópia)\`` e o `startAt`/`endAt` do evento original,
verbatim, para `POST /api/appointments/events`. Dois gatilhos concretos, ambos
plausíveis:
- Título já próximo do limite de 200 caracteres + `" (cópia)"` (8 chars) → estoura
  `z.string().max(200)` → 500 em vez de erro amigável.
- `startAt`/`endAt` fazem o round-trip de `normalizeEvent()`
  (`app/composables/useAppointments.ts:123-124`) sem reformatação — se o formato
  serializado pelo Postgres/PostgREST não bate com o que `z.string().datetime()`
  aceita por padrão (só aceita sufixo `Z`, não offset arbitrário, a menos que
  `{ offset: true }` seja passado — nenhum schema faz isso), a validação falha.

**Correção (duas partes):**
1. Adicionar um hook global de erro em Nitro (`server/plugins/error-handler.ts` com
   `nitroApp.hooks.hook('error', ...)`, ou envolver cada `.parse()` num helper
   `parseOrBadRequest(schema, data)` que captura `ZodError` e relança via
   `createError({ statusCode: 400, statusMessage: ..., data: err.issues })`) — resolve
   a causa sistêmica para **todos** os endpoints de uma vez, não só duplicar.
2. Investigar especificamente o formato de `startAt`/`endAt` que o cliente reenvia
   no fluxo de duplicar e garantir que os schemas usem `z.string().datetime({ offset:
   true })` ou que o cliente sempre normalize para `Z` antes de enviar.

### 2.2 Ocorrência movida some ou aparece no dia errado no grid, por causa da checagem de range — ✅ Corrigido

**Onde:** `server/api/appointments/events.get.ts:225-239`

A decisão de incluir uma ocorrência expandida no resultado (`if (occEnd < rangeStart
|| occ > rangeEnd) continue`) usa **sempre** `occ`/`occEnd` — a matemática de
recorrência pura, sem a exceção aplicada. A exceção (`override_start_at`/
`override_end_at`, de uma edição "somente esta ocorrência") só é aplicada **depois**,
nos campos retornados (linhas 254-259).

**Cenário:** usuário move uma ocorrência de 5 de março para 20 de março via "Somente
esta". Ao visualizar março inteiro: a ocorrência continua sendo incluída/agrupada
pela data **original** (5 de março) na decisão de range, mesmo que o `start_at`
retornado no payload já seja 20 de março — isso desalinha em qual dia-célula do grid
(`MonthView.vue`/`WeekView.vue`, que confiam em `evt.startAt`) ela deveria aparecer.
E se movida para *fora* do range consultado, pode nunca aparecer.

**Correção:** calcular a inclusão no range usando o horário **já com a exceção
aplicada** (mover o cálculo de `exception`/override para antes do `continue`, não
depois).

### 2.3 Fila de mutações offline sem limite de retry — ✅ Corrigido (teto de 5 tentativas; 4xx tratado como falha permanente imediata; ver nota sobre rollback não implementado dentro da seção)

**Onde:** `app/composables/useAppointments.ts` (`drainMutationQueue`, bloco `catch`)

```ts
} catch (err) {
  if (!isOnline.value) break
  console.error('[offline-sync] appointments mutation failed', mutation, err)
  await markRetry(mutation.id)
}
```

Qualquer falha que não seja "a conexão caiu no meio da tentativa" — incluindo um
`400`/`404`/`422` genuinamente permanente do servidor (ex.: o próprio bug 2.1 acima,
ou um `calendarId` que foi arquivado nesse meio tempo) — incrementa `retryCount`
(rastreado em `useMutationQueue.ts`, mas **nunca lido em lugar nenhum**) e a mutação
fica na fila pra sempre, sendo re-tentada silenciosamente a cada reconexão futura,
sem teto, sem backoff, sem fila de "mortos" (dead-letter) e sem qualquer indicação
visível pro usuário além de um `console.error`.

O estado otimista do `apply()` original continua sendo mostrado como "sucesso" na UI
indefinidamente, mesmo que o servidor tenha rejeitado a mudança permanentemente.

**Correção:** definir um teto de tentativas (ex. 5) ou distinguir erro
permanente (4xx) de transitório (rede/5xx) — 4xx não deveria nem entrar em retry, só
5xx/timeout. Mutações que estouram o teto ou recebem 4xx devem: sair da fila,
reverter o estado otimista local (rollback), e mostrar um toast explicando que a
alteração não pôde ser salva.

### 2.4 Detecção de conexão só confia em `navigator.onLine` — 🟡 Mitigado (heurística ampliada para cobrir erro de parse de JSON; nenhum health-check real foi adicionado, permanece como melhoria futura)

**Onde:** `app/composables/useConnectionStatus.ts`

Usa exclusivamente `useOnline()` do VueUse, que por sua vez é só `navigator.onLine` +
listeners de `online`/`offline` do `window`. Não existe nenhum ping/health-check real
em lugar nenhum do arquivo nem em `useOptimisticAction.ts`.

`navigator.onLine` é conhecidamente pouco confiável — reporta `true` sempre que
existe *qualquer* interface de rede ativa, mesmo sem conectividade real de internet
(portal cativo, DNS fora do ar, VPN caída). A única mitigação parcial é
`looksLikeNetworkFailure()` (`useOptimisticAction.ts`), que faz *pattern-match* na
*mensagem* do erro (`/fetch failed|network|failed to fetch|ECONNREFUSED/i`) pra
decidir retroativamente "isso parecia falha de rede, enfileira em vez de reverter".

**Cenário de falha:** um portal cativo que responde `200 OK` com uma página HTML de
login (não é falha de rede) faz a requisição "ter sucesso" com um corpo JSON
inválido — cujo erro resultante muito provavelmente não bate com aquele regex. A
mutação é **revertida com um toast de erro visível**, mesmo que o usuário esteja, na
prática, offline.

**Correção:** não é estritamente necessário implementar um health-check ativo agora
(escopo maior), mas vale documentar essa limitação como conhecida, e considerar pelo
menos ampliar `looksLikeNetworkFailure()` para também tratar erros de parse de JSON
(`SyntaxError` num corpo que deveria ser JSON) como sinal de "provável rede ruim".

### 2.5 Bucketing de dia nas views usa fuso do navegador; evento usa `eventTimezone` — ✅ Corrigido

**Onde:** `MonthView.vue` (`getDayEvents`), `WeekView.vue` (`weekDays` computed),
`DayView.vue` (`isOnDay`)

As três views calculam `dayStart`/`dayEnd` com `startOfDay(date)` / construtor local
de `Date` — usando o fuso **do sistema do navegador**. Mas o evento em si é lido via
`getZonedDate(evt.startAt, getEventTimeZone(evt))`
(`app/utils/calendarEventTime.ts`), cujos getters locais representam o fuso
**armazenado no evento** (`eventTimezone`). Os dois só coincidem quando
`eventTimezone === fuso do navegador do usuário`.

**Cenário:** eventos criados sob um fuso (ex. durante viagem, ou vindos de um
colaborador em fuso diferente via calendário compartilhado) podem ficar perto de uma
fronteira de dia e sumir do dia/semana em que deveriam aparecer quando vistos por
alguém em outro fuso. Esse é provavelmente o motivo real por trás do TODO "dados
retornados pela API mas eventos não renderizados" em Mês/Semana.

**Correção:** decidir conscientemente qual referência de fuso o *agrupamento por
dia* deve usar — mais consistente seria sempre usar o fuso do evento
(`getEventTimeZone(evt)`) para decidir em qual dia-célula ele cai, não o fuso do
navegador de quem está olhando.

### 2.6 Clique em horário vazio no modo Dia ignora o horário clicado — ✅ Corrigido

**Onde:** `app/pages/app/appointments.vue` (`onDaySlotSelect`, `onQuickCreate`)

`DayView.vue` emite `selectSlot: [date, time, mouseEvent]` com o horário real
clicado. Mas `onDaySlotSelect(_date, time, mouseEvent)` **recebe `time` e descarta**
— nunca guarda nem repassa. `onQuickCreate()` então cria sempre:

```ts
startAt: zonedDateTimeToUtcIso(data.date, '09:00', timezone),
endAt: zonedDateTimeToUtcIso(data.date, '10:00', timezone),
```

**Correção:** `onDaySlotSelect` precisa guardar `time` (ex. num
`quickCreateTime` ref ao lado de `quickCreateDate`) e `onQuickCreate` precisa usá-lo
em vez do `'09:00'`/`'10:00'` fixo — só cair no horário fixo quando a criação vier de
um clique em Mês/Semana, que não tem granularidade de horário.

### 2.7 Endpoints de ocorrência não respeitam permissão de calendário compartilhado — ✅ Corrigido (e um bug adicional encontrado no processo: `split-series.post.ts` também gravava `owner_user_id: user.id` na nova linha, em vez do dono real do calendário — corrigido junto)

**Onde:** `modify-occurrence.post.ts`, `split-series.post.ts`,
`cancel-occurrence.post.ts`

O PATCH normal de evento (`events/[id].patch.ts`) e a criação (`events.post.ts`) usam
`resolveCalendarForWrite()` (`server/utils/calendar-access.ts`), que aceita o dono
**ou** um colaborador com `calendar_shares.permission = 'edit'` aceito. Os três
endpoints de ocorrência, em vez disso, filtram só por `.eq('owner_user_id',
user.id)` — sem checar compartilhamento nenhum.

**Efeito:** um colaborador com permissão de edição consegue editar a série inteira
(via PATCH) mas recebe 404 "Evento não encontrado" ao tentar editar/cancelar uma
única ocorrência ou dividir a série — um limite de permissão inconsistente, sem
nenhum comentário no código indicando que isso é intencional.

**Correção:** trocar o filtro `owner_user_id` desses três endpoints por
`resolveCalendarForWrite()`, igual ao PATCH normal.

---

## 3. 🟡 Médio

### 3.1 Filtro de busca (`q`) vulnerável a quebra de sintaxe PostgREST — ✅ Corrigido

**Onde:** `server/api/appointments/events.get.ts:99,143`

```ts
queryBuilder.or(`title.ilike.%${params.q}%,description.ilike.%${params.q}%,location.ilike.%${params.q}%`)
```

`params.q` é interpolado direto numa string de filtro `.or()` do PostgREST. Um valor
contendo `,`, `(`, `)` ou `.` quebra a sintaxe pretendida (pode injetar cláusulas
adicionais ou gerar filtro malformado). Não é SQL injection clássico (PostgREST, não
SQL cru), mas é robustez/correção de entrada não validada.

**Correção:** sanitizar/escapar esses caracteres especiais antes de interpolar, ou
usar a forma de filtro parametrizada do client do PostgREST se disponível.

### 3.2 `GET /events/[id]` é exclusivo do dono, mas a UI o chama para não-donos também — ✅ Corrigido

**Onde:** `server/api/appointments/events/[id].get.ts:19` (`.eq('owner_user_id',
user.id)`)

`EventDetailSlideover.vue` tem UI de RSVP explicitamente pra convidados não-donos, e
`onPopoverEdit` (`appointments.vue`) chama `fetchEventDetail(evt.id)`
incondicionalmente — os botões de editar/arquivar/duplicar em `EventPopover.vue` não
são condicionados a posse. Pra um convidado ou colaborador com permissão só de
visualização, esse GET sempre retorna 404.

`fetchEventDetail()` (`useAppointments.ts`) cai silenciosamente pro que já está em
cache (do endpoint de listagem) quando o GET falha, então o efeito visível costuma
ser mascarado — mas `reminders`/`exceptions` nunca populam pra não-donos, e se o
evento não estiver em cache (ex. link direto antes da lista carregar), o usuário vê
um toast de erro.

**Correção:** trocar o filtro por `resolveCalendarForRead()` (ou equivalente) que
aceite dono, colaborador com compartilhamento aceito, ou participante convidado.

### 3.3 Evento de hábito cai no primeiro calendário do usuário, não no calendário reservado — ✅ Corrigido

**Onde:** `server/utils/habit-event-sync.ts` (`resolveTargetCalendarId`)

```ts
if (preferredCalendarId && calendarIds.includes(preferredCalendarId)) return preferredCalendarId
if (calendarIds.length > 0) return calendarIds[0]!   // primeiro calendário por created_at
return getOrCreateHabitsCalendar(supabase, userId)     // só se o usuário não tiver NENHUM calendário
```

O calendário "Hábitos" com cor reservada (`HABITS_CALENDAR_COLOR`) só é usado como
último recurso para um usuário totalmente novo, sem calendário nenhum. Qualquer
usuário que já tenha ao menos um calendário (o caso comum) tem seus eventos de
hábito jogados no **primeiro calendário criado**, herdando a cor dele — contradizendo
diretamente o TODO "hábitos devem ter cor reservada, não usável por calendários
comuns".

**Correção:** sempre resolver/criar o calendário "Hábitos" dedicado como destino
padrão de eventos de hábito (a menos que o hábito tenha explicitamente escolhido
outro calendário), em vez de cair no primeiro calendário por ordem de criação.

### 3.4 Estado otimista da UI não sobrevive a um reload offline (só a fila sobrevive)

**Onde:** `app/composables/useMutationQueue.ts` (persistência via `idb-keyval`) vs.
`app/composables/useAppointments.ts` (`eventsByKey`/`viewEventKeys`, estado Vue
reativo comum, não persistido)

A fila de mutações pendentes **é** persistida em IndexedDB e sobrevive a reload —
isso está correto. Mas o estado otimista *em memória* (o que a tela mostra) não é.

**Cenário:** usuário arrasta um evento offline, fecha a aba antes de reconectar,
reabre ainda offline. A fila ainda tem o PATCH pendente corretamente, mas a tela
busca o evento do zero do servidor (que ainda tem a posição antiga) e mostra o
evento de volta no lugar original até a conexão voltar e `drainMutationQueue()`
reaplicar. Do ponto de vista do usuário, "minha alteração sumiu" — mesmo não tendo
sumido de verdade.

**Correção:** ao montar `useAppointments()`, antes/junto do primeiro fetch, aplicar
localmente os `optimisticResult` de qualquer mutação pendente na fila que pertença a
`event`/`calendar`, igual ao `apply()` que rodaria se a ação tivesse acabado de
acontecer — não só esperar `drainMutationQueue()` no reconnect.

### 3.5 `recurrence_id` de exceções pode ficar orfão se `eventTimezone` mudar

**Onde:** `server/utils/recurrence.ts` (`expandRecurrence`) vs.
`server/api/appointments/events/[id].patch.ts`

`expandRecurrence()` calcula `recurrence_id` como `occ.toISOString()`, dependente do
fuso configurado no momento (`event_timezone`). Se o fuso do evento-mestre for
alterado depois de já existirem `event_exceptions` (criadas com `recurrence_id`
calculado sob o fuso antigo), essas exceções ficam com uma chave que não bate mais
com nenhuma ocorrência recém-expandida (defasagem = diferença de offset entre os dois
fusos). Não encontrei nenhum código disparando esse cenário hoje, nem nenhuma
proteção contra ele — risco latente, não bug confirmado em produção.

**Correção (se decidirem endereçar):** ao mudar `eventTimezone` de um evento
recorrente com exceções existentes, recalcular/re-chavear os `recurrence_id`
existentes, ou bloquear a troca de fuso em eventos com exceções.

### 3.6 Falha de `persist()` na fila pode causar replay duplicado — ✅ Mitigado (persist() não propaga mais erro; dequeue()/markRetry() agora chamam ensureLoaded()). Idempotência completa de PATCH/DELETE via versionamento otimista não foi implementada.

**Onde:** `useMutationQueue.ts` (`enqueue`/`dequeue`/`markRetry`, todos sem
try/catch ao redor de `persist()`)

Se `dequeue()` já removeu a mutação da lista em memória (porque a requisição teve
sucesso) mas `persist()` falha ao gravar em IndexedDB (quota, erro do navegador), a
entrada volta a aparecer no próximo reload e é reenviada. Para `create`, isso é
inofensivo (o servidor trata conflito de `id` como idempotente — ver
`PLANO_OFFLINE_AGENDA.md`), mas não existe proteção equivalente pra `update`/`delete`
reenviados — um PATCH antigo repetido pode sobrescrever um estado mais novo do
servidor com valores desatualizados.

**Correção:** garantir idempotência de PATCH/DELETE também (ex. incluir
`updatedAt`/versão esperada no PATCH e o servidor rejeitar se o registro já mudou
depois — otimistic concurrency control), ou pelo menos logar/alertar quando
`persist()` falha em vez de silenciar.

---

## 4. ⚪ Baixo / code smells

- **`dequeue()`/`markRetry()` não chamam `ensureLoaded()` internamente**, ao
  contrário de `enqueue()`. Hoje todo call site já garante o load antes (via
  `drainMutationQueue`), então não dispara — mas é uma API frágil: um chamador futuro
  que não seguir essa convenção pode persistir um array em memória desatualizado por
  cima do que está realmente no IndexedDB, apagando mutações pendentes de *outros*
  módulos (Notas/Diário compartilham a mesma fila).
- **Três round-trips sequenciais/paralelos** em `events.get.ts` (calendários próprios,
  compartilhados, eventos convidado) em vez de uma única query — não é N+1 de
  verdade (não é um loop por linha), mas dá pra consolidar.
- **`AgendaView.vue` é código morto** — não é importado em lugar nenhum (confirmado
  via busca). O seletor de visualização atual só oferece Dia/Semana/Mês. Provavelmente
  a origem do TODO "corrigir Invalid Date na visualização Agenda", que hoje não
  existe mais como aba. Decidir: apagar o arquivo, ou religar como uma 4ª visualização
  se ainda fizer sentido no produto.
- **Performance no carregamento inicial** — os `useFetch` de calendários/eventos já
  são `lazy: true, immediate: false, watch: false`, disparados só por
  `refresh*()`/pelo watcher debounced de `[viewFrom, viewTo, activeCalendarIds]` — não
  achei evidência de requests duplicados desnecessários lendo o código estaticamente.
  Recomenda-se confirmar na aba Network do navegador antes de tratar como bug ainda
  aberto.

---

## 5. 🔵 Não são bugs — funcionalidades pedidas e nunca implementadas

Itens do TODO original que são pedidos de feature, não comportamento quebrado:

- **Hábitos como tipo de calendário filtrável** — hoje um hábito só cai *dentro* de um
  calendário comum; não existe conceito de "calendário de hábitos" como filtro de
  primeira classe na UI.
- **Marcar hábito concluído/não-concluído direto no calendário** — eventos vindos de
  hábito são renderizados como qualquer `CalendarEvent` normal, sem nenhuma affordance
  de conclusão nas views ou no popover/slideover.
- **Alterar o horário de um hábito em um dia específico sem afetar a série** —
  `syncHabitLinkedEvent()` sempre faz `updateEventById()` na linha inteira do evento
  vinculado (equivalente a editar a série inteira); nunca cria uma
  `event_exceptions` por dia. A infraestrutura de "somente esta ocorrência" existe
  para eventos normais mas não está conectada a hábitos.
- **Hábitos sem horário no topo do dia** (estilo tarefas do Google Calendar) —
  `buildHabitEventPayload()` retorna `null` quando não há `scheduledTime`, e nesse
  caso o hábito simplesmente não aparece na agenda — não existe uma seção separada
  "sem horário" nas views.
- **Habit stacking empilhado visualmente** — nada em `habit-event-sync.ts` ou nas
  views de calendário faz referência a `habit_stacks`; o empilhamento existe como
  feature isolada (`server/api/habits/stacks*.ts`) sem integração com o layout do
  calendário.
- **Seleção de data facilitada em Semana/Mês** (além de prev/next/hoje) — não existe
  um seletor de "pular para data" dedicado.
- **Selecionar ícone como avatar do evento** — não existe campo de ícone no form de
  criar/editar evento.
- **Sidebar expandir ao passar o mouse** — só expande por clique hoje; hover-to-expand
  não está implementado (`app/layouts/app.vue`, sem nenhum listener de
  `mouseenter`/`mouseleave`).

---

## 6. Ordem de implementação recomendada

Pensando em risco (segurança/corrupção de dados primeiro) e depois em frequência de
impacto no uso diário:

1. **1.1 (IDOR)** — corrigir imediatamente, é uma vulnerabilidade de segurança ativa.
2. **1.2 (corrupção de série recorrente)** — corrupção de dados do usuário, sem opção
   de desfazer facilmente hoje.
3. **2.1 (500 genérico em vez de 400)** — afeta *todos* os endpoints validados, base
   pra diagnosticar corretamente qualquer bug de validação futuro, incluindo o de
   duplicar evento.
4. **2.6 (horário do clique ignorado no modo Dia)** — pequeno e isolado, mas visível
   toda vez que alguém usa a criação rápida em Dia.
5. **2.2 (range de ocorrência movida)** e **2.5 (fuso no bucketing)** — ambos afetam
   diretamente "por que um evento não aparece onde deveria", a categoria de bug mais
   reportada.
6. **2.7 (permissão inconsistente em ocorrências)** — só afeta quem usa calendários
   compartilhados, mas é um bug de autorização real.
7. **2.3 (retry sem teto)** e **2.4 (detecção de conexão)** — melhoram robustez do
   modo offline; menos urgentes que os itens acima porque dependem de o usuário
   realmente cair de conexão.
8. **3.x** — corrigir conforme capacidade; nenhum é bloqueante sozinho.
9. **Seção 5 (features)** — avaliar prioridade de produto separadamente; não são
   bugs e não deveriam competir por urgência com os itens 1-7 acima.
