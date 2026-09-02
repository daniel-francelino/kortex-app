# Análise e Plano: Marcação de Hábitos Otimista

> Auditoria de por que marcar um hábito (feito/pulado/congelado/com nota) trava a tela em loading até você poder marcar o próximo, e plano para trazer `useHabits.ts` pro mesmo padrão de atualização otimista já usado em Agenda (`useAppointments.ts`) e Notas (`useNotes.ts`).

**Legenda de severidade:** 🔴 Crítico · 🟠 Alto · 🟡 Médio · ⚪ Baixo · 🔵 Feature nova (não é bug)

## Resumo executivo

| # | Item | Severidade | Esforço | Status |
|---|------|------------|---------|--------|
| 1 | `logHabit()` já aplica a mutação local otimista, mas dispara um refetch completo logo depois que troca a tela inteira por skeleton | 🔴 | Baixo | ✅ Corrigido |
| 2 | `logHabit()` não usa `runOptimisticAction` (o padrão já estabelecido no app) — reimplementa a mão, sem `reconcile` nem fila offline | 🟠 | Médio | ✅ Corrigido |
| 3 | `POST /api/habits/log` não devolve o streak recalculado — é por isso que hoje o refetch completo "parece" necessário | 🟠 | Baixo | ✅ Corrigido |
| 4 | As outras 10+ mutações de hábito (criar, editar, arquivar, stacks, tags, identidades) têm exatamente o mesmo problema, fora do escopo relatado | 🟡 | Médio | ✅ Corrigido (pedido depois numa mensagem separada) |
| 5 | `useHabits.ts` não integra com a fila offline (`useMutationQueue`) — Agenda e Notas integram | 🔵 | Médio | ✅ Corrigido |
| 6 | Efeito colateral do fix #1, parte 1 (`he-tree`): a árvore de hábitos reconstruía o array inteiro a cada mudança, o que a própria lib avisa não ser confiável sob virtualização | 🔴 | Baixo | ✅ Corrigido |
| 7 | Efeito colateral do fix #1, parte 2 (causa raiz real): `todayData`/`listData` são `shallowRef` desde o Nuxt 4 — as mutações otimistas escreviam em propriedades aninhadas (`todayData.value.habits[i] = x`), o que não dispara reatividade nenhuma. O item 6 sozinho não resolvia porque `props.habits` nunca chegava a mudar de referência | 🔴 | Médio | ✅ Corrigido |

---

## 0. O problema relatado

> "hoje quando marco algo, ele entra em loading e tenho que esperar para marcar outra."

Confirmado, e a causa não é o que parece à primeira vista — **não é um botão travado esperando o servidor**. É a lista inteira sendo substituída por um skeleton.

## 1. 🔴 Causa raiz exata

`logHabit()` (`app/composables/useHabits.ts:247-303`) já faz a parte difícil certo: aplica a mutação **antes** da requisição, de forma síncrona (linhas 256-276 — atualiza `todayData.value.habits[habitIndex]` e `completedCount` na hora, sem esperar nada). Até aqui, já é otimista.

O problema é o que vem depois de a requisição ter sucesso:

```ts
// useHabits.ts:278-293
try {
  await $fetch('/api/habits/log', { method: 'POST', body: { ...payload, tz: clientTimezone } })
  trackHabitsEvent(...)
  if (isCompleted) toast.add({ ... })
  await refreshToday()   // ← aqui
  return true
} catch (err) { ... }
```

`refreshToday()` é o `refresh` do `useFetch('/api/habits/today', ...)` (`useHabits.ts:83-94`) — chamá-lo vira o `todayStatus` pra `'pending'` durante o refetch. E `TodayList.vue` usa exatamente esse status pra decidir o que renderizar:

```vue
<!-- TodayList.vue:249, 262 -->
<template v-if="loading">          <!-- troca a árvore INTEIRA por 4 skeletons -->
<template v-else-if="habits.length > 0 && !allDone">   <!-- a lista real -->
```

com `loading` vindo direto de `:loading="todayStatus === 'pending'"` (`app/pages/app/habits/index.vue:689`).

**A sequência real por clique:** você marca um hábito → a UI atualiza na hora (isso já funciona) → a requisição termina com sucesso → `logHabit` chama `refreshToday()` "só por garantia" → `todayStatus` vira `pending` → `TodayList` derruba a árvore inteira e mostra 4 cards de skeleton até o refetch voltar → **nesse intervalo você não consegue ver nem clicar em nenhum outro hábito**, mesmo os que não foram tocados. Não é o hábito clicado que trava — é a tela inteira que pisca.

Como skip, congelar, "feito depois" e "feito com nota" passam todos pela mesma `logHabit()` (só muda o `status` do payload — `TodayList.vue:46-52`, schema em `log.post.ts:12`), **o bug afeta toda ação de marcação, não só o "feito" simples.**

## 2. O padrão já estabelecido no app (`useOptimisticAction`)

`app/composables/useOptimisticAction.ts` já resolve exatamente esse tipo de problema em Agenda e Notas — `runOptimisticAction({ apply, rollback, request, reconcile, errorMessage, offline? })`:

```ts
opts.apply()                                    // aplica local, síncrono, antes de tudo
if (!isOnline.value && opts.offline) return queueOffline(opts)
try {
  const result = await opts.request()           // a requisição real, em paralelo à UI já atualizada
  opts.reconcile?.(result)                       // funde a resposta do servidor de volta — NUNCA um refetch completo
  return result
} catch (err) {
  if (opts.offline && looksLikeNetworkFailure(err)) return queueOffline(opts)
  opts.rollback()                                // desfaz a mutação local
  toast.add({ title: 'Erro', description: opts.errorMessage, color: 'error' })
  return null
}
```

`useAppointments.ts`'s `updateEvent`/`createEvent` e `useNotes.ts`'s `updateNote`/`deleteNote` seguem esse mesmo desenho: `apply` muta o Map local, `rollback` restaura o snapshot anterior, `request` é o `$fetch`, e **`reconcile` é o único lugar que toca no servidor de novo** — nunca um "refetch tudo pra garantir". É exatamente essa peça (`reconcile`) que falta em `logHabit()` — no lugar dela, tem um `refreshToday()`.

## 3. 🟠 Desenho do fix

### 3.1. Fazer o servidor devolver o que falta pro reconcile

Hoje `POST /api/habits/log` devolve só a linha crua de `habit_logs` (`server/api/habits/log.post.ts:115`, `return log`). A única coisa que o client não consegue calcular sozinho é o **streak recalculado** (current/longest/status) — tudo mais (`completed`, `status`, `note`, timestamps) o `apply()` otimista já fabrica corretamente hoje.

`updateStreakCache()` (`log.post.ts:118-226`) já calcula tudo isso, só não devolve — ele faz o `upsert` em `habit_streaks` (`:217-225`) e descarta o resultado. Fix: fazer a função retornar o objeto que ela mesma acabou de gravar, e incluir isso na resposta:

```ts
// server/api/habits/log.post.ts
async function updateStreakCache(...): Promise<{ currentStreak: number, longestStreak: number, status: 'active' | 'frozen' } | null> {
  // ... lógica existente sem mudança ...

  const { data: streakRow } = await supabase
    .from('habit_streaks')
    .upsert({ ... }, { onConflict: 'habit_id' })
    .select('current_streak, longest_streak, status')
    .single()

  return streakRow
    ? { currentStreak: streakRow.current_streak, longestStreak: streakRow.longest_streak, status: streakRow.status }
    : null
}

// no handler:
let streak = null
try {
  const timezone = await resolveUserTimezone(supabase, user.id, parsed.tz)
  streak = await updateStreakCache(supabase, user.id, parsed.habitId, timezone)
} catch (error) {
  console.error(...)  // como já é hoje — falha aqui não derruba o registro do log
}

return { ...log, streak }
```

### 3.2. Migrar `logHabit()` para `runOptimisticAction`

```ts
async function logHabit(payload: LogHabitPayload): Promise<boolean> {
  const isCompleted = payload.status ? payload.status !== HabitLogStatus.Skipped : payload.completed
  const status: HabitLogStatus = payload.status ?? (payload.completed ? HabitLogStatus.Done : HabitLogStatus.Skipped)

  const habitIndex = todayData.value?.habits.findIndex(h => h.id === payload.habitId) ?? -1
  const previous = habitIndex >= 0 ? { ...todayData.value!.habits[habitIndex]! } : null
  const previousCompletedCount = todayData.value?.completedCount ?? 0
  if (habitIndex < 0 || !todayData.value || !previous) return false

  const wasCompleted = previous.log?.completed ?? false
  const optimisticLog = {
    id: previous.log?.id ?? '',
    userId: previous.log?.userId ?? previous.userId,
    habitId: payload.habitId,
    habitVersionId: previous.log?.habitVersionId ?? '',
    logDate: payload.logDate,
    completed: payload.completed,
    status,
    note: payload.note ?? previous.log?.note ?? null,
    createdAt: previous.log?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const result = await runOptimisticAction({
    apply: () => {
      todayData.value!.habits[habitIndex] = { ...previous, log: optimisticLog }
      if (payload.completed !== wasCompleted) {
        todayData.value!.completedCount += payload.completed ? 1 : -1
      }
    },
    rollback: () => {
      todayData.value!.habits[habitIndex] = previous
      todayData.value!.completedCount = previousCompletedCount
    },
    request: () => $fetch('/api/habits/log', {
      method: 'POST',
      body: { ...payload, tz: clientTimezone }
    }),
    // Funde de volta só o que o servidor sabe que o client não sabia — o
    // streak recalculado — sem tocar em mais nada. Isso é o que elimina o
    // refreshToday(): não tem mais nada que precise vir de um refetch.
    reconcile: (serverResult) => {
      const idx = todayData.value?.habits.findIndex(h => h.id === payload.habitId) ?? -1
      if (idx < 0 || !todayData.value) return
      todayData.value.habits[idx] = {
        ...todayData.value.habits[idx]!,
        log: { ...optimisticLog, id: serverResult.id, habitVersionId: serverResult.habit_version_id },
        streak: serverResult.streak
          ? { habitId: payload.habitId, userId: previous.userId, currentStreak: serverResult.streak.currentStreak, longestStreak: serverResult.streak.longestStreak, status: serverResult.streak.status, lastCompletedDate: null, updatedAt: optimisticLog.updatedAt }
          : todayData.value.habits[idx]!.streak
      }
    },
    errorMessage: 'Não foi possível registrar o hábito',
    offline: {
      entity: 'habit_log',
      action: 'update',
      method: 'POST',
      url: '/api/habits/log',
      body: { ...payload, tz: clientTimezone },
      // upsert por (habit_id, log_date) no servidor (log.post.ts:94) — repetir
      // essa mutação offline-e-reenviada não duplica nada, então não precisa
      // de tempId nem de reconciliação especial de id.
      optimisticResult: { ...optimisticLog, streak: null }
    }
  })

  if (result && isCompleted) {
    toast.add({ title: 'Muito bem!', description: 'Você está construindo consistência.', color: 'success' })
  }
  if (result) {
    trackHabitsEvent(PostHogEvent.HabitLogged, { completed: isCompleted, habit_id: payload.habitId, has_note: Boolean(payload.note?.trim()), status })
  }
  return result !== null
}
```

Isso elimina o `refreshToday()` de dentro de `logHabit` inteiramente — nada mais precisa disparar o `todayStatus: 'pending'` que derruba a árvore.

### 3.3. Fila offline — extensão pequena

`PendingMutationEntity` (`app/composables/useMutationQueue.ts:3`) é um union fechado sem `'habit_log'`. Basta adicionar o member — não precisa de `tempId`/reconciliação de id como Agenda/Notas precisam, porque o `upsert` no servidor já é idempotente por `(habit_id, log_date)` (seção 3.1 acima já aproveita isso no `offline.optimisticResult`).

**✅ Implementado — duas correções encontradas na hora de codificar, não previstas nesta análise original:**

1. **`action: 'update'` colidiria entre hábitos diferentes.** `useMutationQueue`'s `enqueue()` funde mutações consecutivas de `action: 'update'` que compartilham `entity` + `url` — desenhado pra Agenda/Notas, cuja URL já embute o id do recurso (`/api/appointments/events/{id}`). `/api/habits/log` é a mesma URL pra qualquer hábito (o `habitId` vai no corpo). Marcar o hábito A e depois o B offline, ambos como `'update'`, fundiria os dois corpos numa mutação só — perdendo um dos dois silenciosamente. Fix: usar `action: 'create'` no descriptor `offline` (não passa pela lógica de merge), não `'update'` como o pseudocódigo acima sugeria.

2. **`useHabits()` não é singleton** (ao contrário de `useAppointments()`, que usa `createSharedComposable`) — é chamado direto de 12 componentes diferentes (modais de criar/editar hábito, lista do dia, etc.). Registrar o loop de drain (`onReconnect`/`onMounted`) sem guarda faria cada instância montada registrar o seu próprio, podendo reproduzir a mesma mutação da fila em duplicado se dois componentes estivessem montados ao mesmo tempo na reconexão. Fix: uma flag em nível de módulo (`offlineSyncRegistered`) garante que só a primeira chamada de `useHabits()` na vida do app registra os gatilhos.

## 4. 🟡 Fora do escopo relatado, mesma causa raiz

Todas as outras mutações de `useHabits.ts` têm o mesmo formato bloqueante — `await $fetch(...)` seguido de `Promise.all([refreshToday(), refreshList()])` ou similar, sem `apply()` otimista nenhum antes:

| Função | Linha | O que refaz |
|---|---|---|
| `createHabit` | `:177-195` | `refreshToday()` + `refreshList()` |
| `updateHabit` | `:197-215` | idem |
| `archiveHabit` | `:217-230` | idem |
| `restoreHabit` | `:232-245` | idem |
| `createIdentity`/`archiveIdentity`/`updateIdentity` | `:305-361` | idem |
| `createTag`/`deleteTag` | `:363-394` | idem |

Essas ações são mais raras (criar/editar hábito, não marcar todo dia), então o incômodo é bem menor na prática — mas se algum dia isso incomodar, o fix é o mesmo padrão da seção 3.2, função por função. `createStack`/`removeStack`/`syncHabitTree` (`:497-585`) já são a exceção — usam `silentRefreshAfterStackChange()` (`:459-495`), que busca os dados de novo mas escreve direto em `stacks.value`/`todayData.value`/`listData.value` **sem** passar pelo `refresh()` que muda `status` — ou seja, esse helper já existe no arquivo especificamente para evitar o mesmo flash de skeleton, só nunca foi usado em `logHabit`. Dá pra usar esse mesmo helper como alternativa mais simples à seção 3.1/3.2 se um dia quiser aplicar o padrão nas outras funções sem migrar todas pro `runOptimisticAction` de uma vez.

**✅ Implementado (pedido numa mensagem separada, depois da análise original):**

- `updateHabit`, `archiveHabit`, `restoreHabit` migraram pro padrão completo `runOptimisticAction` (`apply`/`rollback`/`reconcile`) — edita/remove/restaura em `todayData` e `listData` na hora, sem esperar o servidor.
- `createIdentity`, `updateIdentity`, `archiveIdentity`, `createTag`, `deleteTag` — mesmo padrão, com `create` usando um id temporário (`temp-${crypto.randomUUID()}`) trocado pelo real no `reconcile`.
- `createHabit` ficou de fora do `runOptimisticAction` de propósito: saber se o hábito novo "é de hoje" depende da mesma lógica de frequência/dia-da-semana que o servidor já resolve — fabricar isso no client só pra um insert otimista arriscava mostrar (ou não mostrar) o hábito errado por um instante. Em vez disso, usa `silentRefreshAfterStackChange()` — não é otimista de verdade, mas também não trava a tela, que era o problema real.
- Duas correções que só apareceram na hora de codificar, não previstas nesta análise original — detalhadas na seção 3.3 acima: o `action: 'create'` (não `'update'`) pra evitar colisão na fila offline, e a trava de registro único (`offlineSyncRegistered`) porque `useHabits()` não é singleton.

## 5. Ordem de implementação recomendada

1. `updateStreakCache()` (`log.post.ts`) passa a retornar o streak gravado, em vez de descartar.
2. `POST /api/habits/log` inclui `streak` na resposta.
3. `logHabit()` migra pra `runOptimisticAction` (seção 3.2) — resolve o bug relatado.
4. `PendingMutationEntity` ganha `'habit_log'` (seção 3.3) — fila offline pra marcação de hábito, de graça.
5. *(Opcional, não relatado)* Repetir o padrão nas demais mutações da seção 4, se algum dia incomodar.

Itens 1-3 resolvem o que foi relatado. 4 é bônus de paridade com Agenda/Notas. 5 é follow-up opcional.

## 6. 🔴 Regressão pós-fix, parte 1: `@he-tree/vue` não re-renderiza sob virtualização (2026-09-02)

### 6.1 O problema relatado

> "em hábitos, quando marco um hábito como feito, não está atualizando como se estivesse feito, tenho que dar f5 para ver o estado de feito."

### 6.2 Causa (necessária, mas — como a seção 7 mostra — não suficiente sozinha)

Efeito colateral direto do fix da seção 1: antes, marcar um hábito disparava `refreshToday()` — um refetch completo que trocava `todayStatus` para `'pending'`, o que fazia `TodayList.vue` esconder `<BaseTree>` atrás do `v-if="loading"` e remontá-lo do zero quando os dados novos chegavam. Uma remontagem completa sempre renderiza certo, então isso mascarava um problema que já existia por baixo: `TodayList.vue`/`AllList.vue` reconstroem `treeData` inteiro (`treeData.value = buildTreeData()`, um array novo com objetos de nó novos) toda vez que `props.habits` muda — inclusive numa mera marcação de "feito".

Com `logHabit()` agora otimista (sem refetch, sem loading, `<BaseTree>` nunca desmonta), essa reconstrução por inteiro passou a ser a *única* forma de o componente `@he-tree/vue` (`BaseTree`) saber que algo mudou — e a própria documentação da lib avisa que isso não é confiável sob virtualização (ativada quando há mais de 12 hábitos, `virtualizationEnabled`, `TodayList.vue`/`AllList.vue`): "it's safer to modify existing node objects in place rather than wholesale array replacement" — substituir o array inteiro não garante o re-render de linhas virtualizadas já visíveis.

### 6.3 Fix aplicado

Em `TodayList.vue` e `AllList.vue`: o `watch(() => [props.habits, props.stacks], ...)` agora só reconstrói `treeData` do zero quando a *forma* da árvore muda de fato (hábito adicionado/removido, `sortOrder` mudou, ou uma relação de empilhamento mudou — comparado via uma assinatura `structuralSignature()`). Para qualquer outra mudança (log, streak, nome editado, nota) — o caso comum de marcar como feito — os objetos de nó existentes são mutados no lugar (`patchTreeDataInPlace`, `node.habit = updated`), sem trocar a referência do array nem criar objetos novos, seguindo exatamente a recomendação da documentação da lib para atualização reativa sob virtualização.

**Isso não resolveu o problema sozinho** — o usuário confirmou que continuava igual depois desse fix. A razão está na seção 7: `props.habits` nunca sequer chegava a mudar de referência, então esse fix (por mais correto que fosse) nunca tinha a chance de entrar em ação.

## 7. 🔴 Regressão pós-fix, parte 2 (causa raiz real): `useFetch` é `shallowRef` no Nuxt 4 (2026-09-02)

### 7.1 O problema relatado (mesmo, confirmado que persistia)

> "de hábitos ainda está estranho, estou marcando, parece até a notificação que foi marcado com sucesso, mas continua sem mudar o estado do hábito. Tinha pedido para resolver anteriormente."

O toast de sucesso aparecia (a mutação chegava ao servidor e voltava certo — `runOptimisticAction` completava o fluxo inteiro), mas a tela nunca refletia. F5 sempre mostrava o estado certo.

### 7.2 Causa raiz

**O Nuxt 4 mudou o padrão de `useFetch`/`useAsyncData`: o ref `data` agora é `shallowRef`, não profundamente reativo como era no Nuxt 3.** Confirmado no changelog/docs do Nuxt 4 — dá pra optar por reatividade profunda de novo com `{ deep: true }`, mas isso não está configurado em `useHabits.ts`.

Sob um `shallowRef`, só reatribuir `.value` inteiro dispara reatividade — mutar uma propriedade aninhada não dispara nada. E era exatamente isso que `logHabit`/`updateHabit`/`archiveHabit`/`restoreHabit` faziam:

```ts
// Não dispara reatividade nenhuma sob shallowRef — Vue nunca fica sabendo
todayData.value.habits[habitIndex] = { ...previousHabit, log: optimisticLog }
todayData.value.habits = todayData.value.habits.filter(h => h.id !== id)
```

`createIdentity`/`createTag`/`silentRefreshAfterStackChange` nunca tiveram esse problema porque sempre reatribuíam o `.value` inteiro (`identities.value = [...]`, `todayData.value = data`) — por isso pareciam funcionar normalmente, e por isso o padrão-ouro do projeto (`useAppointments.ts`/`useSchedulingPages.ts`, um `reactive(new Map())` à parte, nunca tocando o `.value` bruto do `useFetch`) nunca teve esse bug: aquele padrão foi desenhado, por outro motivo (dedupe de paginação), mas por acidente também contorna esse problema do Nuxt 4.

A seção 6 não estava errada — só não era suficiente: com `todayData.value` nunca trocando de referência, `props.habits` (passado de `index.vue` pra `TodayList.vue`) também nunca trocava, então nem chegava a acionar o watch que decide entre reconstruir a árvore ou aplicar o patch em linha.

### 7.3 Fix aplicado

Em `useHabits.ts`, `logHabit`/`updateHabit`/`archiveHabit`/`restoreHabit` (`apply`/`rollback`/`reconcile`) passam a reatribuir `todayData.value`/`listData.value` por inteiro (`todayData.value = { ...todayData.value, habits: replaceAt(...) }`) em vez de mutar `habits`/`data` no lugar. Helper novo `replaceAt(list, index, value)` no topo do arquivo. Com isso, `props.habits` passa a mudar de referência de verdade a cada marcação — e aí sim o fix da seção 6 (patch em linha na árvore) entra em ação.
