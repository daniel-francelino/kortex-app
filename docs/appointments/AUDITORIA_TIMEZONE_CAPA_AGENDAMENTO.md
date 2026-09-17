# Agendamento — auditoria de datas/fuso horário/horários + spec de capa personalizada

Este documento faz duas coisas independentes, pedidas juntas: (1) **audita** o tratamento de datas, fuso horário e horários em todo o módulo de Agendamento (editor do anfitrião, página pública `/agendar/[token]`, página de gerenciamento `/agendar/gerenciar/[manageToken]`, e os endpoints de disponibilidade/reserva no servidor); e (2) **especifica**, no mesmo nível de detalhe que os planos anteriores da pasta, uma nova feature de capa/background para a página pública de agendamento.

> Leitura de apoio: [`../timezone/ANALISE_TIMEZONE.md`](../timezone/ANALISE_TIMEZONE.md) documenta as convenções gerais de fuso horário do app (Regra 1: só o cliente conhece o fuso do navegador). Este documento assume essas convenções e audita se o módulo de Agendamento as segue de fato.

---

## Parte 1 — Auditoria de datas, fuso horário e horários

### 1.1 Resumo executivo

| # | Severidade | Achado | Arquivo |
| --- | --- | --- | --- |
| 1 | 🔴 Alto | Revalidação de vaga em `book.post.ts`/`reschedule.post.ts` usa o dia-calendário em **UTC**, não no fuso do anfitrião | [`server/api/schedule/[token]/book.post.ts:48-49`](../../server/api/schedule/%5Btoken%5D/book.post.ts), [`server/api/schedule/manage/[manageToken]/reschedule.post.ts:52-53`](../../server/api/schedule/manage/%5BmanageToken%5D/reschedule.post.ts) |
| 2 | 🟡 Médio | Horário da reserva no lado do anfitrião é formatado no fuso do **navegador de quem está olhando**, não no fuso da página | [`SchedulingBookingDetailSlideover.vue:49`](../../app/components/appointments/SchedulingBookingDetailSlideover.vue), [`bookings/[id].vue:43`](../../app/pages/app/appointments/bookings/%5Bid%5D.vue) |
| 3 | 🟡 Médio | Grade do `ScheduleMonthPicker` usa o fuso do navegador; o `Set` de dias disponíveis usa o `guestTimezone` escolhido no dropdown — podem divergir | [`ScheduleMonthPicker.vue`](../../app/components/appointments/ScheduleMonthPicker.vue), [`agendar/[token].vue:62-71`](../../app/pages/agendar/%5Btoken%5D.vue) |
| 4 | 🟢 Baixo | Recuperação de conflito (409) mistura `new Date("yyyy-MM-dd")` (parse UTC) com `.getFullYear()/.getMonth()` (getters locais) — pode buscar o mês errado | [`agendar/[token].vue:207-210`](../../app/pages/agendar/%5Btoken%5D.vue) |
| 5 | 🟢 Baixo | `formatSelectedDate()` ancora em `T12:00:00Z` mas não fixa `timeZone: 'UTC'` no formatador — depende implicitamente do offset do navegador ser menor que 12h | [`agendar/[token].vue:144-151`](../../app/pages/agendar/%5Btoken%5D.vue) |
| 6 | 🟢 Baixo | "Disponível até {data}" exibido ao convidado (dias-calendário puros) diverge do corte real aplicado no servidor (aritmética de milissegundos) em até ~1 dia | [`schedule-availability.ts:207-209`](../../server/utils/schedule-availability.ts), [`agendar/[token].vue:133-138`](../../app/pages/agendar/%5Btoken%5D.vue) |
| 7 | ℹ️ Informativo | `zonedDateTimeToUtcIso` faz aproximação de offset em uma única passada — pode errar por horas dentro da hora exata da transição de DST | [`server/utils/timezone.ts:51-59`](../../server/utils/timezone.ts), [`shared/utils/dateTime.ts:128-133`](../../shared/utils/dateTime.ts) |

Nenhum destes é um bug catastrófico (o app não perde dados nem cria reservas sobrepostas em cenário normal), mas #1 é real e reproduzível para qualquer anfitrião em fuso negativo (Américas, incluindo Brasil) que tenha horários de fim de tarde/noite, e #3 é real para qualquer convidado que troque o fuso no seletor da página pública — ambos merecem correção antes do próximo ciclo.

### 1.2 O que já está correto (contexto — para não gerar retrabalho)

O módulo segue, na maior parte, as convenções certas:

- **Armazenamento**: todo evento/reserva grava um instante UTC (`start_at`/`end_at` timestamptz) mais um fuso de referência (`event_timezone` no evento, `timezone` na página de agendamento) — nunca "hora local sem fuso".
- **Conversão fuso→UTC no servidor**: [`computeAvailableSlots`](../../server/utils/schedule-availability.ts#L167) usa `zonedDateTimeToUtcIso(dateStr, rule.startTime, page.timezone)` para transformar cada janela de disponibilidade (definida em hora local do anfitrião) em um instante UTC real antes de comparar com eventos ocupados — é o jeito certo de fazer isso.
- **Dia da semana sem risco de deslocamento**: o cálculo de `dayOfWeek` em [`schedule-availability.ts:218`](../../server/utils/schedule-availability.ts#L218) usa `new Date(\`${dateStr}T12:00:00Z\`).getUTCDay()` — meio-dia UTC é uma âncora segura para "qual dia da semana é isso" porque nenhum fuso real desloca a data em ±12h, então o dia da semana nunca muda. Padrão correto.
- **Formatação no fuso do convidado**: `formatSlotTime`/`formatZonedDateKey`/`availableDates` em `agendar/[token].vue` e `agendar/gerenciar/[manageToken].vue` passam `{ timeZone: guestTimezone }` corretamente para exibir os horários dos slots.
- **Convenção geral do app**: as visões de Agenda (`DayView`/`WeekView`/`MonthView`/`EventDetailSlideover`) sempre resolvem o fuso a partir do **evento** (`getEventTimeZone(evt)`), nunca do fuso ambiente do navegador — é o padrão que os achados #2 acima quebram.

### 1.3 Achados em detalhe

#### 1. 🔴 Revalidação de vaga usa o dia-calendário em UTC, não no fuso do anfitrião

```ts
// server/api/schedule/[token]/book.post.ts:48-49 (idêntico em reschedule.post.ts:52-53)
const requestedStart = new Date(payload.startAt)
const dayStr = requestedStart.toISOString().split('T')[0]!
```

`computeAvailableSlots(..., dayStr, dayStr)` interpreta `dayStr` como um dia-calendário **no fuso da página** (`page.timezone`) — é assim que a função é usada em todo o resto do código (`availability.get.ts`). Mas aqui `dayStr` vem de `.toISOString()`, ou seja, do dia-calendário **em UTC** do instante reservado, não do dia-calendário no fuso do anfitrião.

**Cenário que quebra:** anfitrião com `timezone = "America/Sao_Paulo"` (UTC-3) tem uma janela de disponibilidade das 18:00 às 22:00 no domingo. Um convidado reserva 21:30 de domingo → esse instante é `00:30 UTC de segunda-feira`. `dayStr` vira a segunda-feira. `computeAvailableSlots` então calcula as janelas de disponibilidade **de segunda-feira** (que pode não ter nenhuma, ou ter um horário totalmente diferente) em vez de domingo — o slot que acabou de ser oferecido e escolhido na própria UI do convidado falha a revalidação, e a reserva é recusada com "Esse horário acabou de ser reservado por outra pessoa" (409), mesmo estando livre. O mesmo vale para qualquer fuso positivo com horários de manhã cedo (ex.: reserva às 00:30 local em `Asia/Tokyo`, UTC+9, cai no dia UTC anterior).

Isso não é um edge case raro: qualquer página com horário de disponibilidade que passe da meia-noite UTC no fuso do anfitrião (o que é o caso comum para qualquer fuso fora de UTC±0 com janelas à noite ou de madrugada) pode gerar falsos 409 perto da borda do dia.

**Correção recomendada:** trocar a derivação de `dayStr` por algo que já existe no repo — `formatZonedDateKey`/`getTimeZoneParts` (o mesmo helper que `schedule-availability.ts` já usa para `confirmedByDay`, linha 200-201):

```ts
import { getTimeZoneParts } from '../../../utils/timezone'
// ...
const parts = getTimeZoneParts(requestedStart, page.timezone as string)
const dayStr = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
```

Aplicar a mesma correção nos dois endpoints (`book.post.ts` e `reschedule.post.ts`), já que o trecho é idêntico nos dois.

#### 2. 🟡 Horário da reserva formatado no fuso do navegador de quem olha, não no fuso da página

```ts
// SchedulingBookingDetailSlideover.vue:47-51
function formatDateTime(iso: string | null): string {
  if (!iso) return 'Horário não disponível'
  const raw = formatDisplay(iso, "EEEE, dd 'de' MMMM 'às' HH:mm") // sem { timeZone }
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
```

`formatDisplay` sem `options.timeZone` cai no branch `new Date(dateInput)` + `format()` do `date-fns`, que lê os getters **locais do runtime** — ou seja, o fuso do sistema operacional/navegador de quem está vendo a tela, não `page.timezone` (que o componente já recebe via prop — `props.page.timezone` existe e não é usado aqui). O mesmo padrão se repete em [`bookings/[id].vue:43`](../../app/pages/app/appointments/bookings/%5Bid%5D.vue).

Isso contraria a convenção do resto do app (seção 1.2 acima): `EventDetailSlideover.vue` sempre resolve o fuso pelo **evento**, nunca pelo navegador. Aqui, o "evento" equivalente é a página de agendamento, e `page.timezone` já está disponível nas duas telas.

**Cenário que quebra:** anfitrião configura a página de agendamento com `timezone = "America/Sao_Paulo"` para o negócio, mas está de viagem e seu notebook está com o relógio em `Europe/Lisbon` (UTC+0/+1) no momento em que abre a lista de reservas — o painel mostra os horários das reservas 3-4h adiantados em relação ao que o convidado viu ao reservar e ao que está de fato marcado na Agenda (que usa `event_timezone`, igual a `page.timezone`).

**Correção recomendada:**

```ts
const raw = formatDisplay(iso, "EEEE, dd 'de' MMMM 'às' HH:mm", { timeZone: props.page?.timezone })
```

E o equivalente em `bookings/[id].vue`, usando o `timezone` da página carregada na tela.

#### 3. 🟡 `ScheduleMonthPicker` não é ciente do `guestTimezone` selecionado

`ScheduleMonthPicker.vue` monta sua grade (`grid`, `todayStr`, `dateStr` de cada célula) inteiramente com `new Date(y, m, d)` + getters locais — ou seja, no fuso do **navegador do convidado**. Já o `Set` `availableDates` que decide quais células ficam clicáveis é calculado em `agendar/[token].vue:62-71` assim:

```ts
const availableDates = computed(() => {
  const set = new Set<string>()
  for (const slot of monthSlots.value) {
    const zoned = new Date(slot.startAt).toLocaleDateString('en-CA', { timeZone: guestTimezone.value })
    set.add(zoned)
  }
  return set
})
```

— no `guestTimezone` **escolhido no dropdown**, que é livre (`Intl.supportedValuesOf('timeZone')` inteiro) e não precisa coincidir com o fuso real do navegador. A página oferece esse dropdown exatamente para o caso de alguém agendando em nome de outra pessoa, em outro fuso.

**Cenário que quebra:** convidado está fisicamente em `America/Sao_Paulo` mas troca o dropdown para `Asia/Tokyo` (está agendando para um colega). Um slot às 23:00 de terça-feira em Tóquio é, no fuso local do navegador (São Paulo, UTC-3, 12h atrás de Tóquio), ainda terça-feira de manhã. `availableDates` marca terça-feira (chave calculada em Tóquio) como disponível, mas a grade do `ScheduleMonthPicker` (calculada no fuso do navegador) pode estar posicionando esse dia errado perto da virada de mês, ou o dia "disponível" simplesmente não bate visualmente com o que o convidado espera ver realçado. Nos casos mais comuns (fusos com diferença pequena) o efeito é só 1 dia de disparidade perto de meia-noite; em fusos com grande diferença (>12h, ex. Havaí ↔ Ásia) pode empurrar a disparidade para o mês errado.

**Correção recomendada:** o jeito mais direto é o `ScheduleMonthPicker` receber `guestTimezone` como prop e usar `getZonedDateParts`/`formatZonedDateKey` (já existentes em `shared/utils/dateTime.ts`) em vez de `new Date(y, m, d)` + getters locais para montar `dateStr`/`todayStr`/`dayOfWeek` — assim a grade e o `Set` de disponibilidade falam a mesma "linguagem" de fuso horário. Alternativa mais barata (mitigação, não correção completa): recalcular a grade sempre que `guestTimezone` mudar, mas isso não resolve o descompasso de base entre "calendário desenhado no fuso do navegador" vs "disponibilidade calculada no fuso escolhido".

#### 4. 🟢 Recuperação de conflito (409) mistura parse UTC com getters locais

```ts
// agendar/[token].vue:202-210
if ((err as { statusCode?: number })?.statusCode === 409 && selectedDate.value) {
  step.value = 'pick-time'
  await onMonthChange(
    new Date(selectedDate.value).getFullYear(),
    new Date(selectedDate.value).getMonth(),
  )
}
```

`selectedDate.value` é uma string `"yyyy-MM-dd"`. Por spec do ECMAScript, `new Date("yyyy-MM-dd")` (formato *date-only*) é interpretado como **meia-noite UTC**, mas `.getFullYear()`/`.getMonth()` leem no fuso **local** do runtime — o clássico descompasso "parse UTC, leitura local".

**Cenário que quebra:** `selectedDate.value = "2026-03-01"` e o navegador está num fuso negativo (ex.: `America/Sao_Paulo`, UTC-3). `new Date("2026-03-01")` = `2026-03-01T00:00:00Z` = `2026-02-28T21:00:00` em hora local. `.getMonth()` retorna `1` (fevereiro), não `2` (março). Depois de um 409 num dia 1º do mês, a página recarrega a disponibilidade do **mês anterior** em vez do mês certo — o convidado vê a grade errada logo após um conflito de horário, no pior momento possível (ele já está frustrado por ter perdido a vaga).

**Correção recomendada:** usar `parseCalendarDate` (de `#shared/utils/dateTime`, já importado no arquivo) em vez de `new Date(string)`:

```ts
const parsed = parseCalendarDate(selectedDate.value)
await onMonthChange(parsed.getFullYear(), parsed.getMonth())
```

(`parseCalendarDate` usa `date-fns/parse` com uma data de referência fixa, sem o parse UTC-string implícito do construtor nativo — ver o comentário do próprio helper em `shared/utils/dateTime.ts:81-90`.)

#### 5. 🟢 `formatSelectedDate()` depende implicitamente do offset do navegador

```ts
// agendar/[token].vue:144-151
function formatSelectedDate(): string {
  if (!selectedDate.value) return ''
  const raw = formatDisplay(new Date(`${selectedDate.value}T12:00:00Z`), "EEEE, dd 'de' MMMM")
  return raw.charAt(0).toUpperCase() + raw.slice(1)
}
```

A âncora em `T12:00:00Z` é a técnica certa (ver seção 1.2), mas `formatDisplay` sem `{ timeZone }` formata usando o fuso **local do navegador**, não UTC explicitamente. Isso só funciona por acidente: para qualquer fuso entre UTC-12 e UTC+11, meio-dia UTC cai no mesmo dia-calendário local, então o resultado é "coincidentemente" certo. Só quebra em fusos reais de UTC+12 a UTC+14 (Kiribati, Tonga, Nova Zelândia/Chatham em certas épocas do ano, Samoa) — ali, meio-dia UTC vira madrugada do dia seguinte local, e o texto mostraria o dia errado.

**Correção recomendada:** passar `{ timeZone: 'UTC' }` explicitamente, já que a string já foi deliberadamente ancorada em UTC para ser "dia-calendário puro":

```ts
const raw = formatDisplay(new Date(`${selectedDate.value}T12:00:00Z`), "EEEE, dd 'de' MMMM", { timeZone: 'UTC' })
```

Severidade baixa (afeta só ~5 fusos reais, todos de baixíssimo tráfego), mas a correção é uma palavra e remove a dependência implícita.

#### 6. 🟢 "Disponível até {data}" no convidado diverge do corte real no servidor

No cliente:

```ts
// agendar/[token].vue:133-138 — dias de calendário puros
const availableUntilLabel = computed(() => {
  const todayStr = todayInZone(guestTimezone.value)
  const untilStr = addCalendarDays(todayStr, publicPage.value.maxAdvanceDays)
  return formatDisplay(parseCalendarDate(untilStr), "dd 'de' MMMM")
})
```

No servidor:

```ts
// schedule-availability.ts:207-209 — aritmética de milissegundos sobre o instante atual
const now = new Date()
const advanceThreshold = new Date(now.getTime() + page.maxAdvanceDays * 86400000)
```

O texto exibido ("Horários disponíveis até 15 de outubro") é calculado como "hoje + N dias-calendário" no fuso do convidado. O corte de fato aplicado no servidor é "agora + N×24h" em milissegundos absolutos, a partir do instante exato da requisição — não do início/fim de um dia-calendário. Isso pode divergir do texto exibido em até quase 1 dia inteiro (se `now` for, digamos, 20h, o corte real cai perto das 20h do dia N+1, não à meia-noite). Fora de fusos com DST, o efeito é só essa deriva de "hora do dia"; em fusos com DST ativo (não é o caso do Brasil desde 2019, mas é o caso de anfitriões/hóspedes nos EUA/Europa), pode haver ±1h adicional de deriva na semana da troca de horário.

**Correção recomendada:** decidir uma única definição e aplicá-la nos dois lados. A mais simples de comunicar ao usuário é "dias-calendário completos no fuso do anfitrião" — trocar o cálculo do servidor para:

```ts
import { addCalendarDays, endOfDayInZone, todayInZone } from '#shared/utils/dateTime'
// ...
const advanceThreshold = endOfDayInZone(addCalendarDays(todayInZone(page.timezone), page.maxAdvanceDays), page.timezone)
```

(mantendo o texto do cliente como já está, já que ele expressa exatamente essa definição). Impacto prático baixo — só desalinha a mensagem de expectativa por horas, não permite reservas fora da janela pretendida — mas vale corrigir porque é uma inconsistência visível ("a página disse que dava até dia X, e não deu").

#### 7. ℹ️ `zonedDateTimeToUtcIso`: aproximação em passe único perto de transições de DST

```ts
// server/utils/timezone.ts:51-59 (mesma lógica em shared/utils/dateTime.ts:128-133 via date-fns-tz)
export function zonedDateTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string): string {
  const utcGuess = Date.UTC(year, month - 1, day, hour, minute, 0)
  const offset = getTimeZoneOffsetMilliseconds(new Date(utcGuess), timeZone)
  return new Date(utcGuess - offset).toISOString()
}
```

Essa é a técnica padrão (a mesma usada internamente por bibliotecas como `date-fns-tz`) para converter "hora de parede" + fuso em instante UTC: chuta um instante, mede o offset do fuso *nesse* instante, e corrige. Funciona corretamente na esmagadora maioria dos casos, mas por ser uma única iteração (não itera até convergir), pode produzir um resultado ambíguo ou levemente errado para horários que caem **exatamente dentro da janela de transição de horário de verão** (a hora "pulada" na virada de DST, ou a hora "duplicada" na volta). O Brasil não observa mais horário de verão desde 2019, então isso não afeta anfitriões/convidados brasileiros — mas afeta em teoria qualquer página com `timezone` em fuso que ainda observa DST (EUA, Europa, partes da Oceania), bem como qualquer convidado que escolha um desses fusos no dropdown livre da página pública. O impacto prático é restrito a slots dentro da 1h de transição, 2x por ano, por fuso.

Não é uma correção urgente — registrar como limitação conhecida. Se for endereçado no futuro, a correção é iterar a aproximação uma segunda vez (recalcular o offset a partir do resultado da primeira correção) ou trocar por uma biblioteca com resolução explícita de ambiguidade (`Temporal` quando disponível, ou `date-fns-tz` com as opções de `disambiguation` se a versão em uso suportar).

### 1.4 Checklist de correção recomendada (por prioridade)

1. [ ] **#1** — trocar `toISOString().split('T')[0]` por `getTimeZoneParts(..., page.timezone)` em `book.post.ts` e `reschedule.post.ts` (revalidação de vaga no fuso certo).
2. [ ] **#2** — passar `{ timeZone: page.timezone }` em `SchedulingBookingDetailSlideover.vue:49` e `bookings/[id].vue:43`.
3. [ ] **#3** — tornar `ScheduleMonthPicker` ciente de `guestTimezone` (prop nova + `getZonedDateParts`/`formatZonedDateKey` em vez de `new Date(y,m,d)` local).
4. [ ] **#4** — trocar `new Date(selectedDate.value)` por `parseCalendarDate(selectedDate.value)` em `agendar/[token].vue:207-210`.
5. [ ] **#5** — adicionar `{ timeZone: 'UTC' }` em `formatSelectedDate()`.
6. [ ] **#6** — alinhar `advanceThreshold` do servidor à mesma definição de "dias-calendário no fuso do anfitrião" usada no texto do cliente.
7. [ ] **#7** — só documentar; sem ação imediata.

Nenhum item requer migration de banco — são todos ajustes de lógica em arquivos já existentes.

---

## Parte 2 — Nova feature: capa/background personalizado na página pública de Agendamento

### 2.1 Objetivo

Permitir que o anfitrião envie uma imagem de capa para a própria página de agendamento (`/agendar/[token]`), na mesma linha do que já existe para Metas (`goals.cover_image_url` — ver [`20260831000000_goal_cover_image.sql`](../../supabase/migrations/20260831000000_goal_cover_image.sql)). Hoje a única personalização visual da página pública é a cor (`state.color`), que **nem aparece para o convidado** — o comentário no próprio editor confirma isso: "Usada só para diferenciar suas páginas na lista. O convidado não vê." ([`scheduling/[id].vue:847-849`](../../app/pages/app/appointments/scheduling/%5Bid%5D.vue)). Uma capa dá ao anfitrião a primeira personalização visual que o convidado de fato vê.

### 2.2 Reaproveitamento: o pipeline de upload já existe

Não é preciso criar bucket, endpoint de upload nem lógica de validação de arquivo — `goals` já resolveu exatamente esse problema e o endpoint é genérico:

- **Endpoint**: `POST /api/editor/uploads` ([`server/api/editor/uploads.post.ts`](../../server/api/editor/uploads.post.ts)) — autenticado (`requireAuthUser`), aceita `multipart/form-data` com campos `file` + `kind: 'image'`, valida MIME (`png`/`jpeg`/`webp`/`gif`; bloqueia `svg` e executáveis), aplica limite de tamanho configurável (`editorImageMaxBytes`), grava em `storage.editor-uploads/{userId}/editor/{ano}/{mes}/{uuid}-{nome}` e devolve `{ url }` (URL pública do bucket).
- **Padrão de uso no cliente** (copiar de [`goals/DetailSlideover.vue:180-205`](../../app/components/goals/DetailSlideover.vue)):

```ts
async function onCoverFileSelected(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  coverUploading.value = true
  try {
    const form = new FormData()
    form.append('file', file)
    form.append('kind', 'image')
    const uploaded = await $fetch<{ url: string }>('/api/editor/uploads', { method: 'POST', body: form })
    const updated = await updateSchedulingPage(pageId, { coverImageUrl: uploaded.url })
    if (updated) applyPageToState(updated)
  } finally {
    coverUploading.value = false
  }
}
```

Como o upload é feito **na área autenticada** (`/app/appointments/scheduling/[id]`, dentro do editor), reaproveitar `/api/editor/uploads` é direto — não é preciso um endpoint público separado só para isso.

### 2.3 Modelo de dados

Nova migration aditiva, seguindo o padrão de [`20260908000000_scheduling_pages_editor_fields.sql`](../../supabase/migrations/20260908000000_scheduling_pages_editor_fields.sql) (coluna nullable, sem default obrigatório, sem quebra):

```sql
-- supabase/migrations/<timestamp>_scheduling_pages_cover_image.sql
-- ============================================================================
-- Scheduling pages — capa personalizada da página pública de agendamento.
-- Additive only.
-- ============================================================================

ALTER TABLE scheduling_pages
  ADD COLUMN cover_image_url text;
```

Sem necessidade de tabela nova nem de índice — é um campo de exibição, não filtrável/pesquisável.

### 2.4 Backend

**`server/utils/scheduling.ts`** — `mapSchedulingPage` ganha o campo (ao lado de `color`, linha 35):

```ts
color: row.color ?? null,
coverImageUrl: row.cover_image_url ?? null,
```

**`server/api/appointments/scheduling-pages/[id].patch.ts`** — schema e handler, seguindo exatamente o padrão de `color`:

```ts
// no bodySchema, ao lado de color (linha 33)
coverImageUrl: z.string().url().max(2000).nullable().optional(),

// no handler, ao lado de color (linha 94)
if (payload.coverImageUrl !== undefined) updateData.cover_image_url = payload.coverImageUrl
```

**`server/api/appointments/scheduling-pages/index.post.ts`** (criação) — se a criação rápida (`SchedulingQuickCreateModal.vue`) não expõe capa no fluxo inicial (não deveria — capa é um refinamento pós-criação, igual em Metas), não precisa de mudança aqui; a coluna nasce `null` e é preenchida depois pelo editor.

**`server/api/schedule/[token].get.ts`** — **importante**: este endpoint é público e hoje faz `select` explícito de colunas (linha 19) justamente para não vazar campos internos por engano. É preciso adicionar `cover_image_url` nessa lista e no objeto de retorno:

```ts
.select('id, user_id, title, description, duration_minutes, location_type, location_details, max_advance_days, requires_confirmation, is_active, archived_at, cover_image_url')
// ...
return {
  // ...
  coverImageUrl: (page.cover_image_url as string | undefined) || null,
  // ...
}
```

Sem essa mudança explícita a capa nunca chegaria à página pública — o `select('*')` não é usado aqui de propósito, então é fácil esquecer este arquivo especificamente.

### 2.5 Tipos (`app/types/scheduling.ts`)

```ts
export interface SchedulingPage {
  // ...
  color: string | null
  coverImageUrl: string | null // novo
  // ...
}

export interface CreateSchedulingPagePayload {
  // ...
  color?: string | null
  coverImageUrl?: string | null // novo
  // ...
}

export interface PublicSchedulingPage {
  // ...
  hostAvatarUrl: string | null
  coverImageUrl: string | null // novo
  // ...
}
```

`UpdateSchedulingPagePayload` já deriva de `Partial<CreateSchedulingPagePayload>`, então não precisa de mudança própria.

### 2.6 Editor (`app/pages/app/appointments/scheduling/[id].vue`)

Adicionar um card "Capa" na aba **Evento**, logo após o card "Cor" (linha 821-851), com o mesmo componente visual do `goals/DetailSlideover.vue` (banner `h-32`/`object-cover` com botões flutuantes trocar/remover, e um botão "Adicionar capa" quando vazio):

```vue
<UCard>
  <template #header>
    <p class="text-sm font-medium text-highlighted">Capa</p>
  </template>
  <div class="space-y-2">
    <div v-if="state.coverImageUrl" class="relative h-32 overflow-hidden rounded-lg">
      <img :src="state.coverImageUrl" alt="" class="size-full object-cover">
      <div class="absolute inset-x-0 bottom-0 flex justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent p-2">
        <UButton icon="i-lucide-image" size="xs" color="neutral" variant="solid" :loading="coverUploading" aria-label="Trocar capa" @click="coverInputRef?.click()" />
        <UButton icon="i-lucide-trash-2" size="xs" color="neutral" variant="solid" aria-label="Remover capa" @click="onRemoveCoverImage" />
      </div>
    </div>
    <UButton v-else label="Adicionar capa" icon="i-lucide-image-plus" size="sm" color="neutral" variant="subtle" :loading="coverUploading" @click="coverInputRef?.click()" />
    <input ref="coverInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" class="hidden" @change="onCoverFileSelected">
    <p class="text-xs text-muted">Aparece no topo da página pública. Recomendado: 1200×400px, até 5MB.</p>
  </div>
</UCard>
```

Adicionar `state.coverImageUrl` ao `state` reativo, a `applyPageToState`, e ao `buildPayload()` — nos mesmos moldes de `state.color`. Adicionar `coverUploading`/`coverInputRef`/`onCoverFileSelected`/`onRemoveCoverImage`, copiados de `goals/DetailSlideover.vue:177-215` trocando `updateGoal(goalId, ...)` por `updateSchedulingPage(pageId, ...)`.

### 2.7 Página pública (`app/pages/agendar/[token].vue`)

**Onde renderizar**: o layout atual é um card com duas colunas (`lg:grid-cols-[280px_minmax(0,1fr)]`) — coluna esquerda fixa com avatar/título/descrição/duração/local, coluna direita com o fluxo de agendamento. Duas opções, do mais simples ao mais elaborado:

- **Opção A (recomendada para o primeiro corte) — banner no topo do card inteiro**: uma faixa `h-32 sm:h-40` com a imagem (`object-cover`), ocupando as duas colunas, acima do grid atual. Simples, não interfere no fluxo de duas colunas existente, e é o padrão mais comum (Cal.com/Calendly fazem exatamente isso).

  ```vue
  <div class="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-default bg-default shadow-sm">
    <div v-if="publicPage.coverImageUrl" class="h-32 w-full overflow-hidden sm:h-40">
      <img :src="publicPage.coverImageUrl" alt="" class="size-full object-cover">
    </div>
    <div class="grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <!-- header + main atuais, sem alteração estrutural -->
    </div>
  </div>
  ```

  O `<UAvatar>` do anfitrião (linha 313-317) passa a se sobrepor levemente à capa (`-mt-8` no header, ou manter como está e deixar a capa só como faixa decorativa acima — decisão de design, não técnica).

- **Opção B (mais trabalho, fora do escopo desta entrega) — capa como plano de fundo ambiente da página inteira** (`background-image` com blur no `<body>`/wrapper externo, atrás do card translúcido) — visual mais "personalizado" no estilo Linktree, mas exige cuidado extra de contraste/acessibilidade (texto sobre imagem variável) e um segundo campo (`backgroundBlur`/overlay) para garantir legibilidade em qualquer imagem enviada. Registrar como evolução futura (seção 2.9), não implementar já.

**Fallback sem capa**: manter o visual atual (sem faixa) — não sintetizar um gradiente automático a partir de `state.color` nesta primeira entrega; é complexidade extra sem pedido explícito.

**SEO/meta**: `useSeoMeta` (linha 37-41) pode ganhar `ogImage: publicPage.value.coverImageUrl ?? undefined` de graça — links de agendamento compartilhados no WhatsApp/Slack passam a mostrar a capa na prévia, o que é um ganho real do recurso sem custo adicional de implementação.

### 2.8 Considerações de UX

- **Tamanho/aspecto**: recomendar 1200×400px (proporção ~3:1) no texto de ajuda do editor; `object-cover` no `<img>` absorve variações sem distorcer.
- **Limite de arquivo**: já herdado de `editorImageMaxBytes` (config existente) — não precisa de limite novo específico para capas.
- **Tipos aceitos**: os mesmos já validados pelo endpoint (`png`/`jpeg`/`webp`/`gif`); `svg` já é bloqueado no upload genérico por risco de XSS (script embutido em SVG) — nada a fazer aqui, o endpoint já protege.
- **Remoção**: botão "Remover capa" volta `coverImageUrl` para `null` — sem soft-delete necessário (é só uma URL de exibição, o arquivo em si pode ficar órfão no bucket; mesmo comportamento que Metas já tem hoje, não é regressão introduzida por esta feature).
- **Mobile**: a faixa `h-32 sm:h-40` já é responsiva por si só; não precisa de tratamento adicional além do que o resto da página pública já faz (`px-4 py-6 sm:px-6 sm:py-12`).

### 2.9 Fora de escopo desta entrega (registrar para o futuro)

- Recorte/crop no navegador antes do upload (hoje a imagem enviada é usada como está, só com `object-cover` no CSS).
- Biblioteca de templates/gradientes prontos para quem não quer subir uma imagem própria.
- Capa como plano de fundo ambiente com blur (Opção B da seção 2.7).
- Reaproveitar a mesma capa como imagem de compartilhamento (`og:image`) com dimensões otimizadas separadas (hoje a mesma URL serve para os dois usos, o que é aceitável para o primeiro corte mas não é o ideal para Open Graph, que prefere 1200×630).
