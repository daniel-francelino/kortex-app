# Análise e Plano: Cálculo de Streak dos Hábitos

> Auditoria disparada a partir de `app/pages/app/habits/index.vue` — mas a página não tem lógica de streak nenhuma, é só quem renderiza os componentes que exibem o número. O cálculo de verdade mora em `server/api/habits/log.post.ts` (função `updateStreakCache`), cacheado na tabela `habit_streaks` e lido dali por todo o resto do app. Este documento audita esse motor e propõe um plano de correção. Uma parte da correção (item 2) acabou tocando o outro repositório do produto, `kortex-api`, que roda o cron de fechamento de dia dos hábitos sobre a mesma base Supabase.

**Legenda de severidade:** 🔴 Crítico · 🟠 Alto · 🟡 Médio · ⚪ Baixo

## Resumo executivo

| # | Item | Severidade | Esforço | Status |
|---|------|------------|---------|--------|
| 1 | O cálculo de streak ignora a frequência do hábito — hábitos `weekly`/`custom` nunca ultrapassam 1 dia de streak, mesmo cumpridos religiosamente | 🔴 | Médio | ✅ Corrigido |
| 2 | O cache de streak nunca é recalculado sem uma ação de log — um streak quebrado por inatividade continua exibido como "ativo" indefinidamente | 🟠 | Médio | ✅ Corrigido |
| 3 | `longestStreak` não aplica a mesma regra de "congelado cria ponte" que `currentStreak` usa — sub-conta streaks históricos que passaram por um dia congelado | 🟡 | Baixo | ✅ Corrigido |
| 4 | `.limit(400)` trunca o histórico usado por `longestStreak`, subestimando hábitos muito antigos/ativos sem avisar o usuário | 🟡 | Baixo | ✅ Corrigido |
| 5 | O schema permite `status = 'broken'`, mas nenhum código jamais escreve esse valor | ⚪ | Baixo | ✅ Corrigido |

> Itens 1 e 3 foram corrigidos no `kortex-app`, no mesmo PR — ver "Fase 1" no plano de implementação abaixo. Item 2 foi corrigido no `kortex-api` (o `close-day` job passou a atualizar `habit_streaks`) — ver "Fase 2". Itens 4 e 5 foram corrigidos nos dois repositórios juntos (a mesma função `computeStreak` existe em ambos) — ver "Fase 4" e "Fase 5".

---

## 0. Onde o cálculo realmente acontece

`app/pages/app/habits/index.vue` não tem nenhuma lógica própria de streak — ele só repassa `habit.streak` (vindo de `useHabits()`) para os componentes visuais. A cadeia real é:

1. Usuário marca um hábito → `logHabit()` em [useHabits.ts](app/composables/useHabits.ts) → `POST /api/habits/log`
2. [`server/api/habits/log.post.ts`](server/api/habits/log.post.ts) grava o log e, na sequência, chama `updateStreakCache()` (mesmo arquivo, linhas 121-232) — **é aqui que o streak é de fato calculado**
3. O resultado é gravado na tabela `habit_streaks` (cache) e devolvido na resposta do POST
4. Todo o resto do app (`today.get.ts`, `[id].get.ts`, `index.get.ts`, `insights.get.ts`, `life/insights.get.ts`, `share.get.ts`, `my-progress.get.ts`) só **lê** esse cache via `mapStreak()` em [server/utils/habits.ts:28-40](server/utils/habits.ts) — nenhum desses endpoints recalcula nada
5. No cliente, o badge "Xd" aparece em [AllTreeRow.vue](app/components/habits/AllTreeRow.vue), [TodayTreeRow.vue](app/components/habits/TodayTreeRow.vue) e [DetailSlideover.vue](app/components/habits/DetailSlideover.vue), todos lendo `habit.streak.currentStreak`/`.longestStreak`/`.status` direto do cache

Ou seja: **existe um único algoritmo de streak em todo o app** (não há duplicação/divergência entre telas) — o que significa que qualquer bug nele se propaga para todo lugar que mostra um streak.

---

## 1. 🔴 O cálculo ignora a frequência do hábito

### Causa raiz

`updateStreakCache` ([log.post.ts:121-232](server/api/habits/log.post.ts#L121-L232)) recebe `(supabase, userId, habitId, timezone)` — **nunca recebe `frequency` nem `customDays`**. O algoritmo:

```ts
// log.post.ts:178-195 — caminha dia a dia, sem noção de "dia devido"
for (let i = 0; ; i++) {
  if (completedDates.has(cursor)) {
    currentStreak++
  } else if (frozenDates.has(cursor)) {
    if (i === 0) anchorIsFrozen = true
  } else {
    break   // ← quebra em QUALQUER dia sem log, devido ou não
  }
  cursor = subCalendarDays(cursor, 1)
}
```

Isso contrasta com o resto do backend, que **é** consciente de frequência: `isDueOnDay()` ([server/utils/habits.ts:5-12](server/utils/habits.ts#L5-L12)) filtra hábitos "de hoje" em `today.get.ts:45,60` e alimenta `calculateHabitConsistency()` ([server/utils/habits.ts:192-234](server/utils/habits.ts#L192-L234)). O streak é o único cálculo do módulo que não passa por essa função.

O mesmo problema se repete no cálculo de `longestStreak` ([log.post.ts:197-216](server/api/habits/log.post.ts#L197-L216)), que também assume cadência diária:

```ts
const diff = differenceInCalendarDaysInZone(prev, curr)
if (diff === 1) {          // ← só "conta" se os dois completados foram em dias consecutivos
  tempStreak++
} else {
  longestStreak = Math.max(longestStreak, tempStreak)
  tempStreak = 1
}
```

### Reprodução concreta

Hábito com `frequency = 'weekly'` (due somente às segundas, `isDueOnDay` retorna `true` só para `dayOfWeek === 1`). Usuário completa 5 segundas-feiras seguidas, sem nunca deixar de cumprir:

| Segunda | Ação do usuário | `currentStreak` calculado |
|---|---|---|
| Semana 1 | completa | 1 |
| Semana 2 | completa | 1 (terça sem log já quebra o walk) |
| Semana 3 | completa | 1 |
| Semana 4 | completa | 1 |
| Semana 5 (hoje) | completa | 1 |

`currentStreak` nunca passa de 1, e `longestStreak` também trava em 1 (a diferença entre segundas consecutivas é 7 dias, nunca 1 — o `Math.max(..., currentStreak)` final só empata em 1 porque o `currentStreak` também é 1). Um usuário que nunca falhou em 5 semanas vê "1d" no badge — o mesmo número que veria se tivesse acabado de começar. O mesmo vale para `frequency = 'custom'` com dias não-consecutivos (ex.: seg/qua/sex).

Isso é quase certamente o "erro" que motivou o pedido de auditoria: para hábitos diários o número até bate (todo dia é devido, então "próximo dia sem log" == "quebrou o streak de verdade"), mas para `weekly`/`custom` o número exibido está estruturalmente errado.

---

## 2. 🟠 O cache de streak nunca decai sozinho ✅ Corrigido

`updateStreakCache` (no monorepo do app, `kortex-app`) só é chamado a partir de um único lugar: dentro do handler de `POST /api/habits/log`, ou seja, **só roda quando o próprio hábito recebe uma nova ação de log**. Não há nenhuma chamada a `habit_streaks`/`computeStreak`/`updateStreakCache` fora de `server/api/habits/*` e `server/utils/habits.ts` dentro do `kortex-app`.

Consequência: se um usuário tinha um streak de 5 dias e simplesmente **para de interagir** com aquele hábito específico (não abre o app, não marca "pulado", não faz nada), a linha em `habit_streaks` continua com `current_streak = 5, status = 'active'` **indefinidamente**, porque nada dispara um novo cálculo. O badge "5d" e o ícone de streak ativo continuam corretos aos olhos da UI até a próxima vez que o usuário logar *qualquer* ação nesse hábito — só então o recálculo roda e (corretamente) zera.

Isso é diferente do bug #1: mesmo um hábito `daily` puro sofre com isso. É um problema de cache que nunca invalida sozinho, não de fórmula.

### O que já existia: o `close-day` job, sem tocar `habit_streaks`

Já existia um cron em `kortex-api` (`src/jobs/close-day.job.ts`, agendado em `src/jobs/scheduler.ts` via `CRON_CLOSE_DAY_SCHEDULE`, default `55 23 * * *` — 23:55 todo dia) rodando `CloseDayService.execute()` (`src/services/close-day.service.ts`). Ele processa os últimos `BACKFILL_DAYS` (7) dias: para cada hábito **devido** num dia passado que **não tem nenhum log** naquela data, insere um `habit_logs` com `status: 'skipped'` — idempotente via `UNIQUE(habit_id, log_date)` + upsert, e nunca sobrescreve um log já existente.

Na auditoria original, confirmei (busca por `habit_streaks`/`current_streak`/`longest_streak`/`computeStreak`/`updateStreak` em todo o `kortex-api` — zero ocorrências) que esse job só escrevia em `habit_logs` e nunca tocava `habit_streaks`: ele resolvia uma lacuna diferente (garantir que `habit_logs` tivesse um registro explícito para todo dia devido do passado), não a do item 2 — o badge continuava desatualizado mesmo depois do cron rodar.

### Correção aplicada

Estendi o `close-day` job (`kortex-api/src/services/close-day.service.ts`) para também recalcular e persistir `habit_streaks`, seguindo a abordagem (a) descrita no plano:

1. `CloseDayService` agora mantém `affectedHabits` (`Map<habitId, {userId, frequency, customDays}>`), populado dentro de `processVersionBatch` sempre que um hábito devido é encontrado sem log numa data — exatamente o mesmo conjunto que já alimentava os inserts de `status: 'skipped'`, sem nenhuma query nova para descobrir "quem mudou".
2. Ao final de `execute()` (depois de fechar todas as datas do backfill), `refreshStreaksForAffectedHabits()` busca os logs recentes (`done`/`done_later`/`frozen`, em lote via `HabitRepository.getRecentLogsForHabits`) de cada hábito afetado e chama `computeStreak` — a mesma função da Fase 1, **portada** para `kortex-api/src/utils/habits.ts` (arquivo novo, com um comentário `MANTENHA EM SINCRONIA COM kortex-app/server/utils/habits.ts` — o mesmo padrão que `kortex-api/src/utils/timezone.ts` já usa para ficar em sincronia com o `kortex-app`, já que os dois repositórios não compartilham um pacote de código).
3. O resultado é gravado em `habit_streaks` via `HabitRepository.upsertStreaks` (upsert em lote, `onConflict: 'habit_id'`), em chunks de `CLOSE_DAY_UPSERT_BATCH_SIZE` (mesma env var já usada para os `skipped`, sem nenhuma env var nova).
4. Recálculo é best-effort e isolado num `try/catch` dedicado: se falhar, os `skipped` já persistidos continuam válidos e o job não é reportado como falho só por causa do cache secundário — o próximo run tenta de novo (mesma filosofia de `kortex-app/server/api/habits/log.post.ts`, que também não deixa uma falha no recálculo de streak derrubar o registro do log em si).
5. `CloseDayResult` ganhou o campo `streaksUpdated`, devolvido tanto pelo cron quanto pelo endpoint manual (`GET/POST /jobs/close-day`).

Isso fecha o ciclo: um hábito que fica sem log num dia devido agora tem, no fim daquele mesmo run do cron, seu `current_streak`/`longest_streak`/`status` recalculados — sem precisar que o usuário volte a interagir com ele.

---

## 3. 🟡 `longestStreak` não usa a mesma "ponte" de congelamento que `currentStreak`

O walk de `currentStreak` trata um dia congelado como transparente — não incrementa, mas também não quebra a sequência:

```ts
// log.post.ts:186-192
if (completedDates.has(cursor)) {
  currentStreak++
} else if (frozenDates.has(cursor)) {
  if (i === 0) anchorIsFrozen = true   // não quebra, só não soma
} else {
  break
}
```

Já o cálculo de `longestStreak` ([log.post.ts:197-216](server/api/habits/log.post.ts#L197-L216)) varre só `sortedCompletedDates` (dias congelados **não entram** nessa lista) e exige `diff === 1` entre dois completados consecutivos. Um dia congelado no meio de uma sequência cria um `diff === 2`, o que é tratado como "sequência quebrada" — mesmo sendo exatamente o cenário que o congelamento existe para perdoar.

Exemplo: completo em 1/jan, congelado em 2/jan, completo em 3/jan, e depois o usuário some (streak atual = 0 hoje). O histórico real foi um streak de 3 dias efetivos "costurado" pelo congelamento, mas como esse streak não é mais o atual (`currentStreak` de hoje é 0), o `Math.max(longestStreak, tempStreak, currentStreak)` final não resgata esse valor — `longestStreak` fica registrado como 1, quando deveria ser (pelo menos) 2 dias completados com uma ponte válida entre eles.

Isso só passa despercebido quando o streak "com ponte" ainda é o streak *atual* — aí o `Math.max(..., currentStreak)` no fim da função mascara o problema por coincidência, não por design.

---

## 4. 🟡 `.limit(400)` trunca o histórico usado por `longestStreak` ✅ Corrigido

```ts
// log.post.ts:128-135
const { data: logs } = await supabase
  .from('habit_logs')
  .select('log_date, status')
  .eq('habit_id', habitId)
  .eq('user_id', userId)
  .in('status', ['done', 'done_later', 'frozen'])
  .order('log_date', { ascending: false })
  .limit(400)
```

Para `currentStreak` os 400 registros mais recentes bastam (o walk pára no primeiro buraco). Mas `longestStreak` deveria olhar o histórico inteiro do hábito — com o limite, um hábito diário com mais de ~13 meses de logs (`done`/`done_later`/`frozen`) nunca mais consegue "ver" streaks antigos além dessa janela, mesmo que tenham sido o recorde real. O usuário não recebe nenhum aviso de que o número é parcial.

---

## 5. ⚪ `status = 'broken'` existe no schema mas nunca é escrito ✅ Corrigido

A migration [`20260901000000_habit_streak_freeze.sql`](supabase/migrations/20260901000000_habit_streak_freeze.sql) declara:

```sql
ALTER TABLE habit_streaks
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active'
  CHECK (status IN ('active', 'frozen', 'broken'));
```

mas `updateStreakCache` só atribui `'active'` ou `'frozen'` ([log.post.ts:219](server/api/habits/log.post.ts#L219)) — `'broken'` nunca é produzido por nenhum caminho de código. Não é um bug numérico, mas é um estado "fantasma": o schema promete uma distinção (ex.: "quebrou hoje" vs. "sempre foi ativo, nunca teve streak") que o código não entrega. Vale decidir se implementa ou remove do CHECK, pra não deixar essa lacuna passando a impressão de feature pronta.

---

## Plano de implementação

### Fase 1 — Tornar o cálculo consciente de frequência (resolve #1) ✅ Corrigido

Implementado em [server/utils/habits.ts](server/utils/habits.ts) — nova função pura e exportada `computeStreak(logs, frequency, customDays, today)`, ao lado de `isDueOnDay`/`calculateHabitConsistency` (deixou de viver inline dentro do handler HTTP). `updateStreakCache` em [log.post.ts](server/api/habits/log.post.ts) agora busca `frequency`/`custom_days` junto com a query de ownership do hábito e repassa para `computeStreak`.

O walk retroativo do `currentStreak` deixou de quebrar em qualquer dia sem log — agora só quebra num dia que **é devido** (`isDueOnDay`) e não tem log; um dia não-devido é pulado (não soma, não quebra), e o próprio dia de hoje sempre recebe o benefício da dúvida (pode ainda não ter sido logado).

> Nota: testes unitários para `server/utils/` ficaram fora deste PR — o projeto ainda não tem suíte de testes configurada para o server (nenhum `*.test.ts` fora de `node_modules`), então introduzi-la é um esforço à parte de configuração de tooling, não só de escrever os casos.

### Fase 2 — Parar de exibir um streak "morto" como ativo (resolve #2) ✅ Corrigido

Implementado como a abordagem (a) do plano original: estendido o `close-day` job existente em vez de criar uma rotina nova — ver detalhamento em "Correção aplicada" na seção 2 acima. Arquivos tocados no `kortex-api`: `src/utils/habits.ts` (novo — `isDueOnDay`/`computeStreak` portados), `src/utils/date.ts` (dois helpers genéricos novos: `addCalendarDaysUtc`/`subCalendarDaysUtc`), `src/types/habits.ts` (`HabitLogStatus.Frozen`, `HabitLogStreakRow`, `HabitStreakUpsert`), `src/repositories/habit.repository.ts` (`getRecentLogsForHabits`, `upsertStreaks`) e `src/services/close-day.service.ts`.

A abordagem (b) (recomputar sob demanda na leitura, no `kortex-app`) segue como rede de segurança opcional e independente, caso valha a pena ter as duas — não foi implementada nesta rodada.

### Fase 3 — Alinhar `longestStreak` com a regra de ponte de `currentStreak` (resolve #3) ✅ Corrigido

Implementado junto da Fase 1, na mesma `computeStreak`. O scan de `longestStreak` deixou de comparar `diff === 1` entre datas completadas e passou a varrer a lista combinada de datas completadas + congeladas em ordem cronológica, cortando uma sequência apenas quando `hasDueDayBetween()` encontra um dia devido sem log entre duas entradas — a mesma regra de "congelado/dia-não-devido cria ponte" usada no walk do `currentStreak`, agora compartilhada pelos dois cálculos em vez de duas implementações divergentes.

### Fase 4 — Remover/ampliar o `.limit(400)` (resolve #4) ✅ Corrigido

Em vez de um número arbitrário, `MAX_STREAK_LOOKBACK_DAYS` (3650 — a mesma constante que já existia como rede de segurança contra um walk infinito em `computeStreak`, ver Fase 1) virou o teto único e documentado, exportado de `server/utils/habits.ts` e usado como `.limit(MAX_STREAK_LOOKBACK_DAYS)` em `log.post.ts`. A justificativa: como um hábito loga no máximo um `done`/`done_later`/`frozen` por dia, nenhuma linha além desse teto poderia influenciar o resultado de qualquer forma — `computeStreak` nunca olha tão longe. Não é mais um limite "menor que o necessário" (400), é o limite exato do que o algoritmo consegue usar.

No `kortex-api`, o mesmo `MAX_STREAK_LOOKBACK_DAYS` foi exportado de `src/utils/habits.ts` e substituiu o `STREAK_LOG_HISTORY_LIMIT = 400` local em `close-day.service.ts` (o teto por hábito aplicado em memória depois da busca em lote) — os dois repositórios agora concordam no mesmo número, pela mesma razão.

### Fase 5 — Decidir o destino de `status = 'broken'` (resolve #5) ✅ Corrigido — implementado

Optei por implementar em vez de remover do `CHECK`: o frontend (`app/types/habits.ts`) já tinha `HabitStreakStatus.Broken` e sua entrada em `HABIT_STREAK_STATUS_META` (label "Quebrado", ícone `i-lucide-circle-off`) definidos e nunca usados — sinal de que o valor já era esperado, só faltava o backend produzi-lo.

`computeStreak` (em ambos os repositórios) ganhou uma terceira saída na última linha: `status = anchorIsFrozen ? 'frozen' : currentStreak > 0 ? 'active' : 'broken'`. Como a função já garante, antes desse ponto, que existe histórico de `done`/`done_later`/`frozen` (o caso "nunca logado" já retornou cedo com `status: 'active'`), chegar em `currentStreak === 0` sem estar congelado hoje só acontece quando um dia devido recente ficou sem log — exatamente o sinal que `'broken'` deveria carregar, sem precisar ler o valor anterior do cache nem passar parâmetros extra para a função.

Os tipos que espelhavam `'active' | 'frozen'` em código foram todos ampliados para incluir `'broken'`: `server/utils/habits.ts` (`StreakComputation.status`), `server/api/habits/log.post.ts` (as duas anotações de retorno), `app/composables/useHabits.ts` (`HabitLogResult.streak.status`) no `kortex-app`; `src/utils/habits.ts` (`StreakComputation.status`) e `src/types/habits.ts` (`HabitStreakUpsert.status`) no `kortex-api`. Nenhuma migration nova foi necessária — o `CHECK (status IN ('active', 'frozen', 'broken'))` já permitia o valor.

**Ponto em aberto, fora do escopo desta correção:** `AllTreeRow.vue` e `TodayTreeRow.vue` (`kortex-app`) hoje colapsam qualquer status que não seja `'frozen'` para `'Active'` antes de consultar `HABIT_STREAK_STATUS_META` (`status = habit.streak.status === Frozen ? Frozen : Active`), e o badge de streak só renderiza quando `currentStreak > 0` — que é justamente quando `'broken'` nunca ocorre. Ou seja: o backend agora escreve `'broken'` corretamente, mas nenhuma tela ainda o exibe de forma distinta — é dado pronto para uma badge futura ("seu streak quebrou"), não uma mudança visual imediata.

---

## Ordem sugerida

1. ~~Fase 1 é a mais crítica~~ — ✅ feita (`kortex-app`): era a única que produzia números **errados** para hábitos não-diários, não apenas desatualizados.
2. ~~Fase 3 pode ser feita junto da Fase 1~~ — ✅ feita junto, mesma função (`computeStreak`), mesmo PR.
3. ~~Fase 2 tem um caminho natural~~ — ✅ feita (`kortex-api`): o `close-day` job passou a chamar `computeStreak`/atualizar `habit_streaks` para os hábitos que ficam sem log num dia devido. `computeStreak` foi portado para `kortex-api/src/utils/habits.ts`, mantido em sincronia manual com a versão do `kortex-app` (mesmo padrão já usado por `kortex-api/src/utils/timezone.ts`).
4. ~~Fases 4 e 5 são de baixo risco/baixo impacto~~ — ✅ feitas nos dois repositórios: Fase 4 unificou o teto de busca (`MAX_STREAK_LOOKBACK_DAYS`, a mesma constante já usada como rede de segurança do walk); Fase 5 passou a escrever `status: 'broken'`, completando um valor que o frontend já esperava mas nunca recebia.

Todos os cinco itens do resumo executivo estão corrigidos. O único ponto ainda em aberto é de UI (fora do escopo desta auditoria): `AllTreeRow.vue`/`TodayTreeRow.vue` no `kortex-app` ainda não distinguem `'broken'` de `'active'` visualmente — ver nota ao final da Fase 5.
