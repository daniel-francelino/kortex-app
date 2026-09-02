# Diagnóstico — Editar só "hoje" (uma ocorrência) de um evento recorrente

> **Antes de ler:** isto não é um plano de feature nova. É um diagnóstico de bug numa feature que **já existe no código, implementada de ponta a ponta** (seção 1), mas que — segundo o relato confirmado — nunca aparece na prática pelo formulário de edição. Havia também um **cenário confirmado à parte** (seção 2): arrastar-e-soltar um evento recorrente para outro dia sempre alterava a série inteira, sem nunca checar se era uma ocorrência única — provavelmente exatamente o que o usuário estava fazendo quando disse "altero um evento". **Esse cenário já foi corrigido em 2026-09-02** (seção 2.5). O que resta em aberto é só o caminho do formulário de edição completo (seção 4), que continua hipótese — ainda não verificado em runtime.

## 0. O problema relatado

> "quando altero um evento na agenda, está alterando para todos, só que posso precisar alterar somente hoje e não para os próximos dias."

Confirmado por pergunta direta ao usuário: **o modal "Aplicar alteração a quais ocorrências?" nunca aparece** — a edição salva direto, sempre para a série toda.

## 1. O que já existe (confirmado no código, `main`, árvore limpa)

A feature de escopo de edição foi implementada em `a7a480f` ("feat: implement event participant management and RSVP functionality") — mesmo commit que adicionou participantes/RSVP, o que provavelmente é por isso que passou despercebida depois.

### 1.1 Fluxo pretendido, ponta a ponta

```
Usuário clica num evento recorrente na grade (Mês/Semana/Dia)
  → onSelectEvent() (appointments.vue) abre o popover rápido
  → usuário clica "Editar" no popover
  → onPopoverEdit() (appointments.vue:331-362) monta `selectedEvent`
    preservando `evt.recurrenceId` da ocorrência clicada, e abre o
    EventDetailSlideover
  → usuário edita campos e clica "Salvar"
  → saveEdit() (EventDetailSlideover.vue:213-236):
      SE `props.event.recurrenceId` existir →
        NÃO salva direto — abre scopeModalOpen com 3 botões
      SE não existir (evento não-recorrente) →
        salva direto via updateEvent() (série não existe, não há o que perguntar)
  → usuário escolhe no modal (EventDetailSlideover.vue:266-331):
      "Somente esta"          → modifyOccurrence()   → POST .../modify-occurrence
      "Esta e as seguintes"   → splitSeries()         → POST .../split-series
      "Todas as ocorrências"  → updateEvent()         → PATCH .../events/[id] (ajusta a âncora da série)
```

### 1.2 O que cada opção de escopo faz no servidor (todas já implementadas)

| Opção | Endpoint | Efeito no banco |
| --- | --- | --- |
| Somente esta | `server/api/appointments/events/[id]/modify-occurrence.post.ts` | Upsert em `event_exceptions` (`type='modified'`, `override_title/description/location/start_at/end_at`, chave `(event_id, recurrence_id)`). A leitura (`events.get.ts`) já mescla essas sobrescritas na ocorrência expandida. |
| Esta e as seguintes | `server/api/appointments/events/[id]/split-series.post.ts` | Trunca o `rrule` da série original com `UNTIL` logo antes do ponto de divisão, insere uma linha nova em `events` a partir da ocorrência clicada (campos editados + `rrule` recalculado, ajustando `COUNT` se houver), reaponta `event_exceptions` a partir do ponto de divisão para o evento novo, copia `event_reminders`. |
| Todas as ocorrências | `server/api/appointments/events/[id].patch.ts` (via `updateEvent()`) | Edita a linha mestra normalmente — mas `saveWithScope()` primeiro recalcula `startAt`/`endAt` a partir de `seriesRoot` (a âncora real da série), não da ocorrência clicada, senão "todas" moveria a série inteira pra data errada e ocorrências anteriores ao novo DTSTART sumiriam. |

O schema de `event_exceptions` (`supabase/migrations/20260305220000_scheduling_module.sql`) já suporta os dois tipos (`cancelled`/`modified`) com `UNIQUE(event_id, recurrence_id)`.

### 1.3 Onde a documentação antiga estava errada

> ✅ **Corrigido em 2026-09-02.**

`docs/appointments/1.APPOINTMENTS.md`, seção 6 (não atualizada desde antes do commit `a7a480f`) afirmava: *"Só é possível cancelar uma ocorrência, nunca editá-la individualmente... nenhum endpoint jamais cria uma exceção `modified`... editar o evento-mestre sempre altera a série toda."* — isso já era falso antes mesmo do fix desta seção. Atualizado para descrever o fluxo real (seção 1.1 acima) e para citar o fix do drag-and-drop (seção 2.5).

## 2. Cenário corrigido: arrastar-e-soltar nunca respeitava ocorrência única

> ✅ **Corrigido em 2026-09-02** — ver seção 2.5. As subseções 2.1-2.4 abaixo descrevem o bug como estava antes da correção; mantidas para referência de como o problema foi diagnosticado.

Diferente do resto deste documento (que é hipótese sobre o formulário de edição), isto era **confirmado direto na leitura do código**, sem precisar de runtime: mover um evento recorrente por arrastar-e-soltar sempre editava a série inteira, incondicionalmente, sem nunca checar `recurrenceId`. Se o usuário estava "alterando" o evento arrastando-o pra outro dia — uma interação bem mais comum e rápida do que abrir o formulário completo — era bem provável que fosse esse o caminho usado, e batia exatamente com o relato ("altera para todos, só precisava mudar hoje").

### 2.1 O código

Os três handlers de soltar em `appointments.vue` chamam `updateEvent(eventId, ...)` direto, sem nenhuma checagem de escopo:

```ts
// appointments.vue:553-561 (Semana/Dia)
async function onEventDrop(eventId: string, newStartAt: string, newEndAt: string) {
  if (eventId.startsWith('journal-')) return
  await updateEvent(eventId, { startAt: newStartAt, endAt: newEndAt })
}

// appointments.vue:563-580 (Mês)
async function onMonthEventDrop(eventId: string, newDate: string) {
  ...
  await updateEvent(eventId, { startAt: ..., endAt: ... })
}
```

E as três views emitem só o `id` bruto do evento no evento de soltar — nunca o `recurrenceId` da ocorrência arrastada:
- `MonthView.vue:19` → `dropEvent: [eventId: string, newDate: string]`
- `WeekView.vue:28` / `DayView.vue:28` → `dropEvent: [eventId: string, newStartAt: string, newEndAt: string]`

`updateEvent()` (`useAppointments.ts:655`) é, pelo próprio comentário do código-fonte ("update/archive always act on the whole series"), o primitivo de **editar a série inteira** — a mesma função que a opção "Todas as ocorrências" do modal de escopo usa. Como toda ocorrência de uma série recorrente compartilha o mesmo `.id` (só `recurrenceId`/`startAt`/`endAt` mudam por ocorrência — comentário de `eventStoreKey`, `useAppointments.ts:162-165`), arrastar **qualquer** ocorrência — inclusive a de hoje — sempre chama `updateEvent(masterId, ...)`, editando a linha mestra da série.

### 2.2 Um segundo problema, mais sério: ocorrências anteriores podem sumir da tela

Quando o modal de escopo usa "Todas as ocorrências" (`saveWithScope`, `EventDetailSlideover.vue:288-319`), ele deliberadamente **não** manda a data da ocorrência clicada crua pro servidor — calcula um delta contra `seriesRoot` (a âncora real da série) e desloca a série inteira por esse delta. O próprio comentário do código explica o porquê: `expandRecurrence()` nunca gera ocorrências antes do `DTSTART` — se a data da ocorrência clicada virasse o novo `DTSTART` direto, qualquer ocorrência anterior a ela sumiria da visualização.

O drag-and-drop **não faz esse cálculo** — `onEventDrop`/`onMonthEventDrop` mandam a data de destino do arrasto direto como `startAt`/`endAt` de `updateEvent()`. Ou seja: arrastar a ocorrência de "hoje" de uma série pra outro dia não só move a série inteira (em vez de só hoje) — também arrisca fazer as ocorrências **anteriores** à nova data sumirem da Agenda, porque o `DTSTART` da série passa a ser essa data.

### 2.3 Referência de design: o que uma agenda comum (Google Calendar) faz aqui

Diferente do formulário completo (onde faz sentido perguntar, porque vários campos podem mudar de uma vez), arrastar-e-soltar é uma interação rápida — perguntar "aplicar a quais ocorrências?" a cada arrasto quebraria o fluxo. O padrão estabelecido é: **arrastar move só a ocorrência solta, sem perguntar nada** (equivalente a sempre chamar `modifyOccurrence`, nunca `updateEvent`, quando a ocorrência arrastada pertence a uma série). Só o formulário completo de edição precisa perguntar o escopo.

### 2.4 Fix proposto

Em `onEventDrop`/`onMonthEventDrop` (`appointments.vue`): passar a receber também o `recurrenceId` da ocorrência arrastada — as views já têm o objeto completo do evento arrastado (`drag.event` em `WeekView.vue`/`DayView.vue`, `dragEvent.value` em `MonthView.vue`), só falta incluir no `emit('dropEvent', ...)`. Com o `recurrenceId` em mãos:

- Se existir → chamar `modifyOccurrence(eventId, { recurrenceId, startAt: newStartAt, endAt: newEndAt })` em vez de `updateEvent()` — sem modal, sem perguntar, só move a ocorrência solta (mesmo padrão do Google Calendar).
- Se não existir (evento não-recorrente) → continua chamando `updateEvent()` normalmente, como hoje.

Isso resolve os dois problemas de uma vez: o escopo errado (série inteira em vez de uma ocorrência) e o risco de ocorrências anteriores sumirem — `modifyOccurrence()` nunca toca no `DTSTART`/`rrule` da série, só grava uma exceção pontual em `event_exceptions`.

> ⚠️ Nota de implementação: `modifyOccurrence()` não tinha atualização otimista local (ver comentário em `saveWithScope`, `EventDetailSlideover.vue:276-279` — "no optimistic local update... the parent genuinely needs a refetch to see the result"). Isso era aceitável no fluxo do modal (um clique, uma espera curta), mas arrastar-e-soltar é uma interação que já era otimista (o evento "gruda" na nova posição visualmente antes da resposta do servidor, via `updateEvent()`). Trocar para `modifyOccurrence()` sem adicionar uma atualização otimista equivalente faria o card voltar pra posição antiga por um instante e só "pular" pra posição nova quando o servidor responder — por isso o fix (seção 2.5) também adicionou `apply`/`rollback` otimista a `modifyOccurrence()` (mesmo padrão de `updateEvent()`), não só trocou a chamada.

### 2.5 Fix implementado (2026-09-02)

- `MonthView.vue`, `WeekView.vue`, `DayView.vue`: o evento `dropEvent` ganhou um 3º/4º parâmetro `recurrenceId: string | null`, preenchido a partir do evento arrastado (`dragEvent.value.recurrenceId` / `drag.event.recurrenceId`).
- `appointments.vue`: `onEventDrop`/`onMonthEventDrop` agora recebem `recurrenceId` e, quando presente, chamam `modifyOccurrence(eventId, { recurrenceId, startAt, endAt })` em vez de `updateEvent(eventId, ...)`. Evento não-recorrente (`recurrenceId: null`) continua no caminho antigo, sem mudança de comportamento.
- `useAppointments.ts`'s `modifyOccurrence()`: ganhou `apply`/`rollback` otimistas via `runOptimisticAction`, escritos direto na entrada do store cuja chave é `payload.recurrenceId` (nunca nas outras ocorrências da mesma série — ao contrário de `updateEvent()`, que age sobre a série toda). Como o endpoint devolve a linha crua de `event_exceptions` (não um `CalendarEvent` normalizado), não há `reconcile` — o valor otimista é o que fica de pé em caso de sucesso.
- `EventDetailSlideover.vue`'s `saveWithScope('this')`: como `modifyOccurrence()` agora atualiza o store otimisticamente (mesmo padrão de `updateEvent()`), o `emit('updated')`/refetch forçado que existia só pra esse caminho foi removido — só `splitSeries()` (`this-and-following`) ainda depende de refetch, por não ter atualização otimista própria (fora de escopo deste fix).

Nenhuma mudança de schema ou de endpoint foi necessária — `modify-occurrence.post.ts` já suportava exatamente esse payload desde que a feature de escopo foi implementada (seção 1).

## 3. O que já foi descartado como causa (cenário do formulário de edição)

Rastreei manualmente cada elo da cadeia acima (sem conseguir rodar a aplicação neste ambiente — `node_modules` vazio, só leitura de código):

- **A condição em si** (`EventDetailSlideover.vue:226`, `if (props.event.recurrenceId)`) está correta e é o único guard — não há lógica adicional escondida.
- **`onPopoverEdit()`** (`appointments.vue:331-362`) preserva deliberadamente `evt.recurrenceId` mesmo depois de mesclar com `GET /events/[id]` (que só retorna a linha mestra, nunca uma ocorrência expandida — daí a necessidade do merge): `recurrenceId: evt.recurrenceId ?? detail.recurrenceId ?? null`. Já é redundante contra exatamente essa armadilha.
- **`MonthView.vue`/`WeekView.vue`/`DayView.vue`** passam adiante o mesmo objeto de `props.events` (só `.filter()`, nunca `.map()`) — nenhuma reconstrução que pudesse descartar `recurrenceId` no clique.
- **Não existe uma segunda via de edição** que ignore esse fluxo — `EventCreateModal.vue` só é usado para criar (`eventCreatePrefill = null`), nunca para editar; não há popup/atalho alternativo.
- **`normalizeEvent()`** (`useAppointments.ts:137`) já trata os dois formatos (`recurrenceId` camelCase e `recurrence_id` snake_case vindo do servidor).
- **`events.get.ts`** computa `recurrence_id` corretamente para cada ocorrência expandida quando `from`/`to` estão presentes na query — e a Agenda nunca dispara o fetch sem os dois (`useAppointments.ts`, watcher de `[viewFrom, viewTo, activeCalendarIds]`: `if (!viewFrom.value && !viewTo.value) return`).

Ou seja: **cada elo, olhado isoladamente, está correto.** O bug está em alguma interação entre eles que não aparece lendo cada arquivo isoladamente — ou é algo que só se manifesta com dado real (um `rrule` específico, um evento criado antes dessa feature existir, etc.).

## 4. Hipóteses restantes para o formulário de edição, em ordem de probabilidade

Isto é sobre o caminho do modal de escopo (seção 1) continuar sem aparecer mesmo fora do drag-and-drop — ex.: editando pelo formulário completo do `EventDetailSlideover`.

### 4.1 🔴 Mais provável: colisão de chave no store local (`eventStoreKey`)

`useAppointments.ts:172-173`:
```ts
function eventStoreKey(evt: Pick<CalendarEvent, 'id' | 'recurrenceId'>): string {
  return evt.recurrenceId ?? evt.id
}
```

O store (`eventsById`/`eventsByKey`, um `reactive(Map())`) é uma **união crescente** de tudo que já foi buscado (comentário em `useAppointments.ts`: fetch results are upserted, "não substituídos por completo"). Isso cria um cenário plausível:

1. A Agenda busca um intervalo (ex.: mês atual) → o evento recorrente é expandido, cada ocorrência ganha `recurrence_id` real → guardado no store com chave = `recurrenceId`.
2. Em algum momento (paginação, busca por texto, `debouncedRefreshEvents`, ou mesmo o `refreshEvents()` disparado pelo próprio `modifyOccurrence`/`splitSeries` via `needsRefetch`) **a mesma ocorrência é buscada de novo, mas por algum motivo o servidor devolve essa entrada sem expansão** (`recurrence_id: null` — o branch `else` de `events.get.ts:298-305`, que roda quando a linha bate no filtro SQL mas `shouldExpandRange` é `false`, ou quando ela vem pelo caminho "convidado" `invitedData` sem passar pela expansão).
3. Essa segunda gravação teria chave = `evt.id` (a chave antiga, `recurrenceId` nula) — uma **entrada nova e separada** no Map, não uma atualização da existente.
4. Se `viewEventKeys` (o que decide o que renderiza) apontar para essa segunda entrada em algum recarregamento, o evento clicado na tela carrega `recurrenceId: null` — e a condição em `saveEdit()` nunca dispara.

**Como verificar:** abrir o Vue DevTools, achar a instância do `useAppointments()` (é singleton, deve aparecer uma vez), inspecionar `eventsById`/`eventsByKey` e contar quantas entradas existem para o `id` do evento recorrente em questão. Mais de uma entrada com o mesmo `id` mas chaves diferentes confirma a hipótese.

**Correção, se confirmada:** `upsertEventInStore` precisa checar se já existe uma entrada com `evt.id` igual mas chave diferente (por `recurrenceId` ter mudado de valor não-nulo pra nulo) e não permitir que uma versão *menos informada* (recurrenceId nulo) substitua/coexista com uma mais informada — ou, mais simples, nunca fazer `upsertEventInStore` de uma linha vinda de um fetch sem expansão quando já existe uma versão expandida da mesma ocorrência no período visível.

### 4.2 🟠 Segunda hipótese: o `rrule` do evento em questão não é reconhecido por `expandRecurrence()`

Se o `rrule` salvo no banco tiver uma sintaxe que `server/utils/recurrence.ts`'s `expandRecurrence()` não sabe interpretar (silenciosamente devolvendo zero ocorrências ou entrando num caminho de erro engolido), o evento apareceria na Agenda pelo fallback "evento normal" — mas isso deveria fazer o evento **sumir** das datas futuras, não aparecer normalmente em todas elas. Menos provável dado o relato ("altera para todos" implica que a recorrência está funcionando visualmente), mas vale checar rapidamente: qual é o `rrule` exato do evento que o usuário tentou editar (`SELECT rrule FROM events WHERE ...`).

### 4.3 🟡 Terceira hipótese: o evento não é realmente recorrente

Se o "evento recorrente" na verdade for várias linhas **separadas** em `events` (criadas uma a uma, sem `rrule`, só com títulos/horários parecidos) — um padrão de uso perfeitamente possível se o usuário criou os compromissos manualmente em vez de usar o campo de recorrência — então não há nada a "escopar": cada uma já é editável independentemente hoje. Nesse caso o comportamento relatado ("editar altera todos") não bateria com essa hipótese (editar uma linha solta nunca afeta outra linha solta), então isso serviria só para descartar via uma pergunta direta ao usuário, não via código.

**Como verificar:** perguntar ao usuário se, ao criar o evento, ele configurou um campo de repetição (diário/semanal/etc.) no formulário de criação, ou se são vários eventos criados manualmente um a um.

## 5. Ordem recomendada de investigação/fix

1. ~~Corrigir o drag-and-drop~~ — feito, seção 2.5. Se o relato original vinha desse caminho (bem provável — é a interação mais comum e mais rápida), o problema já deve estar resolvido; vale o usuário testar antes de investir tempo na seção 4.
2. **Se o formulário completo de edição ainda reproduzir o bug** (evento editado pelo `EventDetailSlideover`, não por arrastar): confirmar 4.1 (é a hipótese mais provável e mais barata de checar, com Vue DevTools, sem precisar de acesso a banco).
3. Se 4.1 for confirmada, corrigir `upsertEventInStore`/`eventStoreKey` para não deixar uma gravação sem `recurrenceId` pisar/coexistir com uma gravação expandida da mesma ocorrência.
4. Se 4.1 não bater, confirmar 4.2 com uma query direta no `rrule` do evento problemático.
5. ~~Corrigir `docs/appointments/1.APPOINTMENTS.md` §6~~ — feito junto com o fix do drag-and-drop, já refletia informação desatualizada independente da causa raiz do formulário.

## 6. Fora de escopo deste diagnóstico

Não foi possível rodar a aplicação neste ambiente (`node_modules` vazio) — tudo em torno da seção 4 é rastreamento manual de código, não confirmado em runtime. A seção 2 (drag-and-drop) foi diagnosticada e corrigida só de ler o código, sem precisar rodar nada — mas o fix em si (seção 2.5) também não pôde ser testado em runtime neste ambiente; vale o usuário confirmar visualmente após o deploy. O próximo passo real pro cenário do formulário, se ainda reproduzir depois do fix do drag-and-drop, é reproduzir com o DevTools aberto (seção 4.1) antes de qualquer mudança de código.
