# Plano de implementação — Metas sustentadas por Hábitos

Este documento detalha como transformar o vínculo hoje frágil entre Metas e Hábitos (`goal_habits`) numa relação de verdade: **"para alcançar esta meta, preciso destes hábitos"** — não apenas um hábito solto marcado como "relacionado", mas um vínculo que influencia o progresso da meta, é visível dos dois lados, e pode ser criado a partir da própria meta.

> Pré-requisito de leitura: [`1.GOALS.md`](./1.GOALS.md) (seções 8 e 12) e [`1.HABITS.md`](../habits/1.HABITS.md) (seção 17) documentam o estado atual — hoje o vínculo existe (`goal_habits`), mas: (1) um hábito pode estar ligado a várias metas ao mesmo tempo, contrariando a intenção de produto já registrada internamente; (2) o progresso da meta ignora completamente os hábitos vinculados, considerando só tarefas; (3) só é possível vincular a partir da tela de Metas, nunca a partir de Hábitos; (4) um hábito arquivado continua aparecendo como vinculado sem nenhuma indicação. Este plano resolve os quatro pontos. A lacuna também está registrada nos dois documentos de análise de mercado ([`docs/goals/ANALISE_METAS_MERCADO.md`](./ANALISE_METAS_MERCADO.md), item 4 do roadmap P1; [`docs/habits/ANALISE_HABITOS_MERCADO.md`](../habits/ANALISE_HABITOS_MERCADO.md), item 7 do roadmap P1) — os dois apontam para a mesma mudança; este documento é a especificação única que resolve ambos.

---

## 1. Visão do produto

Hoje, "vincular um hábito a uma meta" é só uma etiqueta — não muda nada no comportamento do app. A visão proposta:

> Uma meta pode ser sustentada por um ou mais hábitos. Quando isso acontece, o progresso da meta deixa de refletir só tarefas concluídas e passa a refletir também **a consistência real desses hábitos no dia a dia**. É possível declarar "preciso deste hábito para esta meta" tanto na hora de criar a meta quanto depois, e tanto a partir da tela de Metas quanto a partir da tela de Hábitos — hoje só funciona num sentido.

Isso muda a meta de "uma lista de tarefas com um rótulo" para algo mais próximo do que os concorrentes maduros da categoria já fazem (ver `docs/goals/ANALISE_METAS_MERCADO.md`, seção 2.4) — um app citado na pesquisa de mercado (Beyond Time) resume exatamente esse modelo: "defina um objetivo mensurável, vincule um hábito diário a ele, e veja o progresso atualizar automaticamente conforme você registra sessões".

---

## 2. Desenho geral

| Decisão | Escolha | Por quê |
| --- | --- | --- |
| Cardinalidade hábito↔meta | **1 hábito → no máximo 1 meta ativa por vez** (aplicado no banco) | Já é a intenção de produto documentada internamente (TODO da equipe, citado em `1.HABITS.md`); um hábito que "sustenta" duas metas ao mesmo tempo dilui a semântica de "este hábito existe por causa desta meta". |
| Progresso combinado | **Tarefas e hábitos contribuem juntos**, com os dois componentes sempre visíveis separadamente na UI (nunca só um número misterioso) | Resolve o pedido central sem esconder de onde o número vem — decisão de transparência, não só de cálculo. |
| Onde o progresso combinado é calculado | **Só no detalhe da meta** (não na listagem) | Calcular consistência de hábito por meta é uma consulta por data; fazer isso para cada linha da listagem causaria N+1. A listagem continua mostrando o progresso "de tarefas" (rápido, já mantido por trigger); o detalhe mostra o progresso combinado real. |
| Direção do vínculo na UI | **Bidirecional** — vincular a partir de Metas (já existe) e a partir de Hábitos (novo) | Hoje só existe um sentido; a visão do usuário ("para esta meta, preciso destes hábitos") pede o caminho inverso também. |
| Criar hábito já vinculado a uma meta | **Sim, num só passo** — a partir do detalhe da meta, "Criar hábito para esta meta" abre o formulário completo de criação de hábito, já vinculando ao salvar | Hoje só dá pra vincular hábitos que já existem; o pedido do usuário é justamente poder declarar "preciso deste hábito novo" sem sair do contexto da meta. |

---

## Fase 1 — Vínculo 1:1 aplicado + visibilidade bidirecional

### 1.1 Migration — limpar duplicatas e aplicar unicidade

Hoje `goal_habits` só tem `UNIQUE(goal_id, habit_id)` — nada impede o mesmo `habit_id` de aparecer em várias linhas com `goal_id` diferentes. Antes de aplicar a restrição, é preciso decidir o que fazer com vínculos duplicados que já existirem em produção (mantém o mais recente, remove os demais):

```sql
-- supabase/migrations/<timestamp>_goal_habits_unique_per_habit.sql

-- 1. Deduplicar: para cada habit_id vinculado a mais de uma meta, manter só o vínculo mais recente
DELETE FROM goal_habits gh
USING (
  SELECT id,
         row_number() OVER (PARTITION BY habit_id ORDER BY created_at DESC) AS rn
  FROM goal_habits
) ranked
WHERE gh.id = ranked.id AND ranked.rn > 1;

-- 2. Aplicar a restrição de unicidade em habit_id sozinho
ALTER TABLE goal_habits ADD CONSTRAINT goal_habits_habit_id_unique UNIQUE (habit_id);
```

> ⚠️ Efeito colateral aceito: se algum usuário em produção já vinculou o mesmo hábito a duas metas, um dos vínculos desaparece silenciosamente nessa migration. Vale considerar logar as linhas removidas (`RAISE NOTICE` ou uma tabela de auditoria temporária) antes de rodar em produção, para poder avisar os usuários afetados se necessário.

### 1.2 Endpoint — mensagem de erro melhor ao violar a unicidade

`server/api/goals/[id]/habits.post.ts` hoje só trata o `23505` da constraint antiga (`goal_id, habit_id` duplicado) como 409 genérico. Com a nova constraint, o mesmo código de erro passa a cobrir também "hábito já vinculado a **outra** meta" — vale diferenciar a mensagem buscando a meta atual do hábito antes de tentar o insert:

```ts
// server/api/goals/[id]/habits.post.ts — antes do insert em goal_habits
const { data: existingLink } = await supabase
  .from('goal_habits')
  .select('goal_id, goals(title)')
  .eq('habit_id', parsed.habitId)
  .maybeSingle()

if (existingLink) {
  throw createError({
    statusCode: 409,
    statusMessage: `Este hábito já está vinculado à meta "${(existingLink.goals as any)?.title}"`
  })
}
```

`GoalsHabitLinker.vue` já busca `GET /api/habits?pageSize=100&archived=false`, mas hoje só exclui os hábitos já vinculados **àquela mesma meta** (`existingHabitIds`). Como um hábito agora só pode pertencer a uma meta por vez, o ideal é o próprio `GET /api/habits` (ou uma variação) devolver `goalId`/`goalTitle` quando o hábito já estiver vinculado a alguma meta, para o linker desabilitar/ocultar esses itens com uma explicação ("já vinculado a outra meta"), em vez de deixar o usuário tentar e receber um erro.

### 1.3 UI — vincular a partir de Hábitos (o sentido que falta)

Hoje só é possível vincular a partir do slideover da Meta. Adicionar o caminho inverso:

- **`app/components/habits/CreateModal.vue`** e **`app/components/habits/EditModal.vue`**: novo campo opcional "Meta vinculada" (um `USelect` populado por `GET /api/goals?pageSize=100&status=active`), dentro do acordeão "4 leis" (mesma seção que já lida com identidade — faz sentido colocar "identidade" e "meta" juntas, já que as duas dão *propósito* ao hábito). Ao selecionar uma meta e salvar, chama `linkHabit(goalId, {habitId})` (reaproveitando `useGoalActions()`, já existente); ao trocar para "Nenhuma", chama `unlinkHabit(linkId)`.
- **`app/components/habits/DetailSlideover.vue`**: mostrar a meta vinculada (se houver) como uma badge clicável que leva a `/app/goals` com a meta já selecionada — ver seção 4 (Fase 4) para o desenho completo dessa visibilidade cruzada.

### 1.4 Tipos e mapeamento

`app/types/habits.ts` (`Habit`) ganha `goalId?: string | null` e `goalTitle?: string | null` (populados via join, análogo a como `GoalHabitLink.habitName` já funciona hoje). `server/utils/habits.ts` (`mapHabit`) passa a aceitar esses campos quando presentes na consulta.

`app/types/goals.ts` (`GoalHabitLink`) ganha `habitArchivedAt?: string | null`, propagado por `server/utils/goals.ts` (`mapGoalHabitLink`) a partir do join já existente em `GET /api/goals/[id]` (`*, habit:habits(name)` → `*, habit:habits(name, archived_at)`). `GoalsDetailSlideover.vue` passa a mostrar uma badge "Arquivado" (cor neutra, ícone `i-lucide-archive`) ao lado de qualquer hábito vinculado cujo `habitArchivedAt` não seja nulo — fecha a lacuna já registrada em `1.GOALS.md` (seção 15, item 9).

### Critérios de aceite — Fase 1

- Vincular um hábito já vinculado a outra meta retorna erro claro, nomeando a meta atual.
- É possível vincular/desvincular uma meta a partir do formulário de criar/editar hábito, sem precisar navegar até Metas.
- Um hábito arquivado continua aparecendo na lista de hábitos vinculados de uma meta, mas com indicação visual clara de que está arquivado.
- Migration de deduplicação roda sem erro em uma cópia de produção (testar antes de aplicar).

---

## Fase 2 — Progresso combinado (tarefas + consistência de hábitos)

### 2.1 Pré-requisito — consolidar `isDueOnDay()`

`1.HABITS.md` (seção 19, item 20) já registra que `isDueOnDay()` está duplicada em três arquivos (`today.get.ts`, `life/dashboard.get.ts`, `cron-skip.post.ts`), com uma delas divergente. Antes de escrever uma quarta cópia para o cálculo de progresso de meta, mover essa função para `server/utils/habits.ts` (junto de `mapHabit`/`fetchHabitTagMap`) e importar nos quatro lugares. Isso corrige de brinde a inconsistência já documentada como bug (`1.HABITS.md`, item 7).

### 2.2 Cálculo de consistência de hábito por período

Nova função em `server/utils/habits.ts`:

```ts
export async function calculateHabitConsistency(
  supabase: SupabaseClient,
  habitId: string,
  frequency: HabitFrequency,
  customDays: number[] | null,
  fromDate: string, // ISO date — maior entre "criação do hábito" e "início do período"
  toDate: string // hoje
): Promise<{ dueDays: number, completedDays: number, rate: number }> {
  // 1. Enumera as datas devidas no intervalo usando isDueOnDay() (agora compartilhada)
  // 2. Busca habit_logs no intervalo com status IN ('done', 'done_later')
  // 3. rate = completedDays / dueDays (0 se dueDays === 0, hábito ainda não teve nenhum dia devido)
}
```

Janela recomendada: desde a **data de criação do hábito** (ou do vínculo com a meta, o que for mais recente) até hoje, com um teto de 90 dias — evita que um hábito com 2 anos de histórico penalize a meta por dias antigos irrelevantes, e evita custo de consulta ilimitado.

### 2.3 Combinar no endpoint de detalhe

`GET /api/goals/[id]` (`server/api/goals/[id]/index.get.ts`) passa a, quando `habitLinks.length > 0`:

1. Rodar `calculateHabitConsistency()` para cada hábito vinculado (paralelo, `Promise.all` — o teto de hábitos por meta é naturalmente pequeno, não é um problema de escala como seria na listagem).
2. Calcular `habitProgress = média das taxas de consistência dos hábitos vinculados × 100`.
3. Calcular `combinedProgress`:
   - Só tarefas (sem hábitos vinculados): `combinedProgress = taskProgress` (comportamento atual, inalterado).
   - Só hábitos (meta sem nenhuma tarefa): `combinedProgress = habitProgress`.
   - Ambos: `combinedProgress = (taskProgress + habitProgress) / 2` (peso igual — simples e previsível; um peso configurável por meta é um refinamento possível, mas não necessário para a primeira versão).
4. Retornar os três valores (`taskProgress`, `habitProgress`, `combinedProgress`) no payload — a coluna `goals.progress` no banco **continua sendo só `taskProgress`** (mantida pelo trigger existente, sem mudança), usada como está hoje na listagem; `combinedProgress` é calculado só na resposta do detalhe, nunca persistido.

`app/types/goals.ts` (`Goal`) ganha `taskProgress?: number`, `habitProgress?: number` — `progress` continua existindo (é o valor de tarefas, para retrocompatibilidade com a listagem).

### 2.4 UI — mostrar os dois componentes, nunca só um número

`GoalsDetailSlideover.vue`: o card "Evolução da meta" (que hoje só mostra a barra de progresso de tarefas) passa a mostrar, quando a meta tem hábitos vinculados:
- A barra combinada em destaque (`combinedProgress`).
- Duas barras menores abaixo, rotuladas "Tarefas" e "Consistência dos hábitos", cada uma com seu próprio percentual — para que o número combinado nunca seja uma caixa-preta.

O botão "Marcar como concluída" passa a checar `combinedProgress >= 100` (em vez de só `progress`, que hoje é só tarefas) — ver Fase 1 do roadmap de mercado (`docs/goals/ANALISE_METAS_MERCADO.md`, P0 item 2) sobre unificar também a regra do menu de contexto da lista, que é um bug independente já registrado e não é escopo deste plano.

### Critérios de aceite — Fase 2

- Uma meta com hábitos vinculados mas nenhuma tarefa mostra progresso > 0% quando os hábitos estão sendo cumpridos (hoje seria travada em 0% para sempre).
- O detalhe da meta sempre mostra de onde o número combinado vem (tarefas vs. hábitos), nunca um percentual sem explicação.
- A listagem de metas continua rápida (sem N+1) — progresso ali continua vindo só de `goals.progress` (tarefas), sem cálculo de consistência por linha.

---

## Fase 3 — "Preciso destes hábitos para esta meta" (fluxo de criação assistida)

Esta é a fase que resolve diretamente o pedido original: hoje só dá pra vincular hábitos **que já existem**. Falta o caminho "estou criando/vendo uma meta e percebo que preciso de um hábito novo para sustentá-la".

### 3.1 Criar hábito a partir do detalhe da meta

`app/components/goals/HabitLinker.vue` ganha uma segunda ação, ao lado da lista de hábitos existentes para vincular: **"Criar novo hábito para esta meta"**. Ao clicar, abre `HabitsCreateModal.vue` (reaproveitado, não duplicado) com uma nova prop opcional `initialGoalId`. `HabitsCreateModal.vue` precisa de dois ajustes mínimos:

1. Aceitar `initialGoalId?: string` como prop.
2. No `onSubmit`, depois de criar o hábito com sucesso, se `initialGoalId` estiver presente, chamar `linkHabit(initialGoalId, {habitId: novoHabito.id})` antes de fechar o modal.

Isso reaproveita o formulário completo (nome, 4 leis, agendamento, dificuldade, tags) em vez de criar um mini-formulário paralelo específico de Metas — mantém uma única fonte de verdade para "como se cria um hábito".

`GoalsDetailSlideover.vue` precisa importar e montar `HabitsCreateModal` (hoje ele só existe na página de Hábitos) — ou, alternativa mais simples de implementar, emitir um evento `create-habit` que a página `goals/index.vue` escuta e usa para abrir o modal (evita duplicar a lógica de import entre módulos, mantendo o padrão já usado para os outros modais da própria página).

### 3.2 Sugestão no momento de criar a meta (opcional, não bloqueante)

Depois de criar uma meta com sucesso (`GoalsCreateModal.vue`), oferecer um passo opcional: um toast ou um segundo modal leve perguntando "Quer adicionar hábitos que vão sustentar essa meta agora?" com um botão que abre o mesmo fluxo da seção 3.1, já com a meta recém-criada como `initialGoalId`. Deve ser **dispensável com um clique** (não travar o fluxo de quem só quer criar a meta e seguir depois) — o mesmo princípio já usado no onboarding do app (`useOnboarding().pendingHabitHandoff`, que sinaliza uma ação pendente sem forçar o usuário a completá-la imediatamente).

### Critérios de aceite — Fase 3

- É possível, sem sair do contexto da meta, criar um hábito novo já vinculado a ela.
- O formulário de criação de hábito usado nesse fluxo é o mesmo formulário completo já usado em Hábitos — nenhuma duplicação de UI.
- A sugestão pós-criação de meta é dispensável e não bloqueia o fluxo principal.

---

## Fase 4 — Visibilidade cruzada no lado do Hábito

Hoje, olhar o detalhe de um hábito não dá nenhuma pista de que ele existe para sustentar uma meta. Depois da Fase 1 (campo `goalId`/`goalTitle` disponível), fechar o círculo visualmente:

- **`app/components/habits/DetailSlideover.vue`**: badge "Meta: {título}" (ícone `i-lucide-target`), clicável, navegando para `/app/goals` com a meta correspondente já aberta no slideover (reaproveitar o padrão de `onSelectGoal` já existente em `goals/index.vue`, via query param ou store leve — o mecanismo exato de "abrir already-selected" ainda não existe em nenhum dos dois módulos hoje e teria que ser adicionado; alternativa mais simples para uma primeira versão: navegar para `/app/goals` sem selecionar automaticamente, e o usuário localiza a meta pela lista/busca).
- **`app/components/habits/TodayTreeRow.vue`** / **`AllTreeRow.vue`**: ícone pequeno (`i-lucide-target`, sem texto, só tooltip "Sustenta a meta: {título}") ao lado dos badges já existentes — nice-to-have, não bloqueia a entrega da fase, pode ficar para depois se o tempo apertar.

### Critérios de aceite — Fase 4

- O detalhe de um hábito vinculado a uma meta mostra qual meta é, sem precisar ir até Metas para descobrir.

---

## 3. Fora de escopo (deste plano)

- **Peso configurável por meta** entre tarefas e hábitos (hoje fixo em 50/50 quando os dois existem) — deixar para uma iteração futura se o peso igual se mostrar inadequado na prática; não há sinal hoje de que os usuários precisem disso desde o primeiro dia.
- **Muitos-para-muitos entre hábito e meta** — decidido conscientemente contra na seção 2; se o produto mudar de ideia depois, é uma migration nova revertendo a constraint, não um redesenho.
- **Correção do bug de "concluir meta com qualquer progresso pelo menu de contexto"** (`1.GOALS.md`, seção 15, item 4) — bug pré-existente e independente deste plano, já registrado em `docs/goals/ANALISE_METAS_MERCADO.md` (P0, item 2); deve ser corrigido, mas não faz parte desta especificação.
- **Notificações/lembretes cruzados** ("você não fez o hábito X que sustenta a meta Y") — recurso de retenção interessante, mas depende de infraestrutura de notificação por hábito que ainda não existe (`docs/habits/ANALISE_HABITOS_MERCADO.md`, P1 item 6) — pré-requisito não entregue por este plano.

## 4. Riscos

- **Migration de deduplicação (1.1) é destrutiva** — remove vínculos reais se algum usuário já tiver o mesmo hábito ligado a duas metas. Mitigar rodando primeiro em ambiente de teste com uma cópia dos dados de produção e revisando quantas linhas seriam afetadas antes de aplicar.
- **Cálculo de consistência (2.2) pode ficar lento** para metas com muitos hábitos vinculados e janelas longas — o teto de 90 dias e o `Promise.all` mitigam, mas vale medir o tempo de resposta de `GET /api/goals/[id]` depois de implementado, especialmente em contas antigas com hábitos de anos.
- **Reaproveitar `HabitsCreateModal.vue` entre módulos (3.1)** acopla um componente hoje exclusivo de Hábitos ao módulo Metas — aceitável (é reaproveitamento deliberado, não duplicação), mas qualquer mudança futura no formulário de hábito passa a ter dois pontos de chamada a considerar.

## 5. Checklist de rollout

> **Status (2026-08-23): todas as fases implementadas.**

- [x] Fase 1.1 — migration de deduplicação + constraint (`20260827000000_goal_habits_unique_per_habit.sql`) — ⚠️ ainda precisa ser testada numa cópia de produção antes de aplicar (é destrutiva, ver seção 4)
- [x] Fase 1.2 — mensagem de erro 409 melhorada (`habits.post.ts`) + `GET /api/habits` expõe `goalId`/`goalTitle`/`goalLinkId` via `fetchHabitGoalMap()`
- [x] Fase 1.3 — campo "Meta vinculada" em `CreateModal`/`EditModal` de Hábitos
- [x] Fase 1.4 — tipos atualizados, badge "Arquivado" no detalhe da meta para hábitos vinculados arquivados
- [x] Fase 2.1 — `isDueOnDay()` consolidada em `server/utils/habits.ts` (corrigiu de brinde a divergência em `cron-skip.post.ts`, que tratava hábitos semanais como devidos todo dia)
- [x] Fase 2.2 — `calculateHabitConsistency()` implementada (janela de até 90 dias, `completed = true` como sinal de conclusão)
- [x] Fase 2.3 — `GET /api/goals/[id]` retorna `taskProgress`/`habitProgress`/`combinedProgress`
- [x] Fase 2.4 — UI do detalhe da meta mostra as três barras de forma transparente
- [x] Fase 3.1 — "Criar hábito para esta meta" a partir do vinculador de hábitos da meta (`HabitsCreateModal` com `initialGoalId`)
- [x] Fase 3.2 — toast dispensável após criar uma meta, com ação "Adicionar hábito" (`goals/index.vue`, `onGoalCreated`)
- [x] Fase 4 — badge "Meta: {título}" no detalhe do hábito, clicável para `/app/goals`; ícone com tooltip "Sustenta a meta: {título}" em `TodayTreeRow.vue` e `AllTreeRow.vue`
