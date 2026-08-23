# Análise de mercado — Metas

Este documento compara o módulo Metas do Kortex (`app/pages/app/goals/`, `useGoals.ts`/`useGoalActions.ts`, documentado em [`1.GOALS.md`](./1.GOALS.md)) com o mercado de apps de definição e acompanhamento de metas — **GoalsOnTrack** e **Lifetick** (os dois apps dedicados mais maduros da categoria, com hierarquia de meta/sub-meta/marco e vision boards), **Strides** (já coberto em profundidade em [`docs/habits/ANALISE_HABITOS_MERCADO.md`](../habits/ANALISE_HABITOS_MERCADO.md), citado aqui só nos pontos que tocam Metas especificamente), **ClickUp Goals** e **Notion** (a referência de "metas dentro de uma ferramenta de produtividade geral", mais próxima da natureza do Kortex do que os apps dedicados), e **Coach.me** (accountability social).

> Mesmo formato de [`docs/notes/ANALISE_EDITOR_MERCADO.md`](../notes/ANALISE_EDITOR_MERCADO.md), [`docs/journal/ANALISE_DIARIO_MERCADO.md`](../journal/ANALISE_DIARIO_MERCADO.md) e [`docs/habits/ANALISE_HABITOS_MERCADO.md`](../habits/ANALISE_HABITOS_MERCADO.md): todo item "❌ Faltando"/"⚠️ Parcial" foi conferido no código (via `1.GOALS.md`, levantado lendo a migration, todos os endpoints e todos os componentes diretamente) — não é suposição. A pesquisa de mercado (seção 6) usa fontes públicas de 2026, listadas ao final.

**Escopo**: prioriza o módulo **Metas**. Onde a comparação de mercado exige (progresso alimentado por hábitos, por exemplo), este documento referencia o roadmap de Hábitos em vez de duplicá-lo.

---

## 1. O que já existe (baseline)

Metas com título, descrição, emoji, categorização por prazo (diário a longo prazo) e por área da vida (8 categorias), status (ativa/concluída/arquivada), progresso calculado automaticamente a partir de subtarefas (trigger de banco, não código de aplicação), e vínculo opcional com hábitos recorrentes. Interface simples: lista filtrável + card de detalhe com tarefas e hábitos vinculados editáveis inline.

É uma base funcional e correta no fundamento (progresso derivado de dado real, não digitado à mão), mas — como `1.GOALS.md` documenta em detalhe — bem mais rasa que a categoria dedicada de apps de metas em quase todas as dimensões estruturais: hierarquia, tipos de progresso, revisão periódica e vínculo com valores pessoais. Ao mesmo tempo, tem bugs de atualização de lista (seção 6.4) que nenhum concorrente pesquisado apresentaria.

---

## 2. Lacunas por categoria

### 2.1 Estrutura da meta (hierarquia)

| Recurso | Status | Nota |
| --- | --- | --- |
| Subtarefas simples (lista plana) | ✅ Já existe | `goal_tasks`, progresso calculado pela proporção concluída. |
| **Sub-metas / marcos (hierarquia meta → sub-meta → tarefa)** | ✅ Implementado | `goal_milestones` + `goal_tasks.milestone_id`, grupos colapsáveis no detalhe da meta (P1, item 5). |
| **Tipos de progresso além de "tarefas concluídas"** (numérico, monetário, vinculado a métrica) | ✅ Implementado | `goals.progress_type`/`target_value`/`current_value`/`unit` (P1, item 6). |
| Reordenar tarefas | ❌ Faltando | `sort_order` existe no schema mas só é definido na criação (sempre no fim); não há UI de arrastar para reordenar. |

### 2.2 Visualização e planejamento

| Recurso | Status | Nota |
| --- | --- | --- |
| **Vision board** (quadro visual da meta, com imagem/visualização do resultado desejado) | ✅ Implementado (simplificado) | `goals.cover_image_url` — uma imagem de capa por meta (não colagem múltipla), P2 item 9. |
| **Metas ancoradas em valores pessoais** | ❌ Faltando (P3) | Decisão de produto maior, fora do escopo P0–P2 — ver seção 3. |
| Templates de meta prontos | ✅ Implementado | `app/utils/goal-templates.ts`, aba de templates no modal de criação (P2, item 10). |

### 2.3 Revisão e acompanhamento contínuo

| Recurso | Status | Nota |
| --- | --- | --- |
| **Check-in/revisão periódica dedicada à meta** | ✅ Implementado | `goal_reflections`, seção "Revisão semanal" no detalhe da meta (P2, item 8). |
| Lembretes/notificações por meta | ❌ Faltando | Nenhuma notificação específica de meta existe hoje (contraste com o lembrete de revisão semanal de Hábitos, que é módulo-inteiro, não por hábito — ver `docs/habits/ANALISE_HABITOS_MERCADO.md`, item 6 do roadmap). Fora do escopo P0–P2 (depende de infraestrutura de notificação por entidade). |
| Journaling vinculado à meta | ✅ Implementado | `entity_links`/`useLifeOS()` — vínculo bidirecional entre meta e entrada de diário, com label resolvido em `GET /api/life/links` (P2, item 11). |

### 2.4 Progresso alimentado por hábitos (o gap mais citado internamente)

| Recurso | Status | Nota |
| --- | --- | --- |
| Vincular um hábito a uma meta | ✅ Já existe | `goal_habits`, editável a partir do slideover da meta. |
| **Progresso da meta alimentado pela consistência do hábito** | ✅ Implementado | `calculateHabitConsistency()` combina taxa de consistência dos hábitos com progresso de tarefas em `GET /api/goals/[id]` (P1, item 4). |
| Cardinalidade hábito↔meta (1 hábito, 1 meta) | ✅ Aplicado | `UNIQUE(habit_id)` em `goal_habits`, com migration de dedup (P1, item 7). |

### 2.5 Social e responsabilização (accountability)

| Recurso | Status | Nota |
| --- | --- | --- |
| Parceiro de responsabilidade / compartilhar meta com alguém | ❌ Faltando | Recurso central do Lifetick ("accountability partners") e de apps mais novos citados na pesquisa (Milestones, Progressly) — convidar alguém para acompanhar e comentar o progresso de uma meta específica. O Kortex não tem nenhum conceito de meta compartilhada. |
| Comunidade/coaching | ❌ Faltando | Coach.me combina o rastreador com uma rede social e a opção de contratar um coach humano — fora de escopo natural para o Kortex hoje (ver seção 4), mas vale registrar como o extremo social da categoria. |

---

## 3. Roadmap sugerido (por esforço x impacto)

> **Status (2026-08-23): itens 1–12 (P0+P1+P2) implementados.** Só o P3 (itens 13–15) segue em aberto — decisões de produto maiores, e o item 15 (IA) contraria a decisão já registrada de deferir features de IA até os módulos base estarem prontos. Ver `docs/goals/PLANO_METAS_HABITOS.md` para o detalhe de implementação dos itens 4/7/12.

### P0 — Corrigir bugs confirmados + ligar o que já está construído ✅
1. ✅ **Lista atualiza** após criar, editar, concluir, arquivar ou restaurar uma meta pelo menu de contexto — todo handler de mutação em `goals/index.vue` chama `refreshList()`; `CreateModal`/`EditModal` emitem `saved`.
2. ✅ **Regra de "concluir uma meta" unificada** — removido o gate de progresso ≥ 100% do slideover; concluir manualmente exige só `status === active`, igual ao menu de contexto da lista.
3. ✅ **Painel de Insights conectado** — aba "Insights" em `goals/index.vue` (`UTabs`), carregada sob demanda.

### P1 — Fecha o gap estrutural nº1 da categoria: hierarquia e progresso real ✅
4. ✅ **Progresso da meta alimentado por hábitos vinculados** — `calculateHabitConsistency()` + `GET /api/goals/[id]` retorna `taskProgress`/`habitProgress`/`combinedProgress`, com as três barras visíveis no detalhe.
5. ✅ **Sub-metas/marcos** — tabela `goal_milestones`, `goal_tasks.milestone_id`, grupos colapsáveis no detalhe da meta.
6. ✅ **Tipos de progresso** (tarefas/numérico/monetário) — `goals.progress_type`/`target_value`/`current_value`/`unit`, trigger de progresso guardado para só recalcular metas do tipo `tasks`.
7. ✅ **Cardinalidade hábito↔meta aplicada** — `UNIQUE(habit_id)` em `goal_habits` (com migration de dedup), erro 409 nomeando a meta atual ao tentar vincular um hábito já ocupado.

### P2 — Recursos de "app de meta maduro" ✅
8. ✅ **Revisão periódica dedicada a metas** — `goal_reflections` (upsert por `user_id, goal_id, week_key`), seção colapsável "Revisão semanal" no detalhe.
9. ✅ **Vision board simplificado** — `goals.cover_image_url`, banner no detalhe (reaproveita `POST /api/editor/uploads`) e thumbnail na listagem.
10. ✅ **Templates de meta prontos** — `app/utils/goal-templates.ts` (10 templates por área da vida), aba "Começar de um template" no modal de criação, com tarefas sugeridas criadas junto.
11. ✅ **Vincular entradas do Diário a uma meta** — reaproveita `entity_links`/`useLifeOS()`; `GET /api/life/links` agora resolve `sourceLabel`/`targetLabel` em lote. UI nos dois sentidos (detalhe da meta e detalhe da entrada).
12. ✅ **UI bidirecional de vínculo com hábitos** — campo "Meta vinculada" em criar/editar hábito, badge "Meta: {título}" no detalhe do hábito, "Criar hábito para esta meta" a partir do vinculador da meta.

### P3 — Apostas maiores / diferenciação
13. **Metas ancoradas em valores pessoais** — reformular a criação de meta para opcionalmente começar por "o que importa para você" (inspirado no Lifetick), com "área da vida" deixando de ser só uma categorização e passando a ser um agrupamento navegável por valor.
14. **Parceiro de responsabilidade / meta compartilhada** — convidar alguém para acompanhar e comentar uma meta específica; reaproveitaria conceitualmente a infraestrutura de compartilhamento já construída (mesmo que hoje incompleta) em Hábitos e Notas.
15. **IA como assistente de definição de meta** — ajudar a transformar uma ideia vaga em uma meta SMART bem formada, sugerir subtarefas/marcos, e resumir o progresso num check-in periódico. Conecta com os itens de IA já mapeados nos roadmaps de Notas, Diário e Hábitos — mesma pergunta de arquitetura de dados unificada.

---

## 4. Fora de escopo (não recomendo perseguir agora)

- **Rede social/coaching completo estilo Coach.me** — contratar coaches humanos e um feed social são um produto à parte; o item 14 (parceiro de responsabilidade simples) captura o essencial do valor de accountability sem esse investimento.
- **OKRs corporativos/de time** (alinhamento entre metas de equipe, cascata organizacional) — fora do escopo de um app pessoal como o Kortex; a categoria de OKR "empresarial" (Ally.io, Weekdone) resolve um problema diferente (alinhamento entre pessoas), não o de uma pessoa planejando sua própria vida.

---

## 5. Relação com os outros roadmaps do Kortex

- **Progresso alimentado por hábitos** (P1, item 4) é o ponto de maior sinergia — a mesma lacuna aparece, do outro lado, no roadmap de Hábitos (`docs/habits/ANALISE_HABITOS_MERCADO.md`, item 7/17). Os dois deveriam ser desenhados como uma única mudança, não duas.
- **Vínculo de Diário a metas** (P2, item 11) usa a mesma infraestrutura genérica de vínculo do Life OS já usada por Hábitos e Diário — vale revisar `server/api/life/links/*` antes de desenhar, em vez de criar um mecanismo novo.
- **IA como assistente** (P3, item 15) — mesma decisão arquitetural que aparece nos roadmaps de Notas, Diário e Hábitos: se o Kortex investir em IA sobre o conteúdo do usuário, definir desde já se é uma fonte de dados unificada entre os quatro módulos.
- **Compartilhamento/accountability** (P3, item 14) — pode reaproveitar decisões já tomadas (e problemas já encontrados, como o link público de Hábitos que está construído mas inacessível — ver `1.HABITS.md`, seção 11) em vez de repetir os mesmos erros num quarto módulo.

---

## 6. O que a comunidade/mercado pede (pesquisa)

Levantamento em reviews e comparativos de 2026 dos apps dedicados de meta mais maduros (GoalsOnTrack, Lifetick), do híbrido meta+hábito (Strides, já coberto no roadmap de Hábitos), de ferramentas de produtividade geral com metas nativas (ClickUp, Notion) e de apps recentes de accountability (Coach.me, Milestones, Progressly).

### 6.1 Hierarquia é o que separa um "app de meta" de uma lista de tarefas rotulada

A comparação mais reveladora da pesquisa: tanto GoalsOnTrack quanto Lifetick estruturam explicitamente **meta → sub-meta/marco → ação**, não meta → tarefa direto. É a mesma lição que apareceu na análise de Hábitos sobre o modelo de "4 tipos de rastreador" do Strides (ver `docs/habits/ANALISE_HABITOS_MERCADO.md`, seção 6.4): a categoria madura trata "meta" como algo com profundidade estrutural, não como uma lista de checkbox com um rótulo diferente. O Kortex hoje está no lado raso dessa comparação — reforça a prioridade do item 5 do roadmap (P1).

### 6.2 O modelo de progresso importa tanto quanto a hierarquia

ClickUp é citado especificamente por modelar progresso como "um número, um valor monetário, verdadeiro/falso, ou tarefas vinculadas, que sobem para uma porcentagem geral conforme as tarefas vinculadas são concluídas" — ou seja, mesmo nas ferramentas de produtividade geral (não dedicadas a metas pessoais), a expectativa de mercado é que "progresso" seja um conceito flexível, não travado a um único mecanismo. O Kortex trava isso a "proporção de tarefas concluídas" — funciona bem para metas que naturalmente se decompõem em tarefas discretas, mas força qualquer meta quantitativa (economizar dinheiro, ler livros, perder peso) a simular isso artificialmente.

### 6.3 Valores antes de metas — uma inversão de framing, não só uma feature

O diferencial do Lifetick não é uma funcionalidade isolada, é uma inversão de fluxo: "primeiro defina o que importa (saúde, família, carreira, criatividade), depois crie metas SMART alinhadas a esses valores" — em vez do fluxo padrão (definir a meta primeiro, categorizá-la depois). Vale registrar isso como uma decisão de produto genuína a se considerar (item 13, P3), não como um "recurso a mais": pode mudar a forma como o usuário aborda a criação de uma meta desde o primeiro passo, não só adicionar uma tela.

### 6.4 Onde o Kortex já perde para qualquer concorrente, independente de recurso

Nenhuma fonte pesquisada aponta isso diretamente (é um achado do código, não do mercado) — mas vale o contraste: **nenhum app de meta com qualquer maturidade teria uma lista que não reflete uma ação que acabou de ser confirmada com sucesso pelo próprio app** (criar, editar, concluir, arquivar — ver `1.GOALS.md`, seções 2–4). Esse é um problema de qualidade básica de produto, não de posicionamento competitivo — vale resolver antes de qualquer investimento em recursos novos (P0, itens 1–2).

### 6.5 Revisão periódica é tratada como o "produto", não como um extra

Tanto GoalsOnTrack/Lifetick quanto o padrão de planejadores semanais fora da categoria estrita de metas (Sunsama, Full Focus Planner) colocam a revisão periódica no centro da experiência, não como uma tela secundária. O Kortex tem revisão semanal — mas ela pertence inteiramente ao módulo Hábitos, sem nenhuma pergunta voltada a metas. É a lacuna mais barata de fechar da lista P2 (item 8), já que a infraestrutura de "revisão semanal" (UI de navegação por semana, formulário, persistência) já existe e funciona em Hábitos — o trabalho é adaptar o conceito para metas, não inventá-lo do zero.

### Fontes consultadas

- [Top 10 Best Goal Planner Software of 2026 — gitnux](https://gitnux.org/best/goal-planner-software/)
- [12 Best Goal Tracking Apps in 2026 — OnPlanners](https://onplanners.com/apps/goal-tracking)
- [Best Personal Goal Setting Apps for 2026 (Habits + Life Goals) — goalsandprogress.com](https://goalsandprogress.com/best-goal-setting-apps/)
- [9 Best Goal Tracking Apps for 2026 (Tested & Compared) — ClickUp](https://clickup.com/blog/goal-tracking-apps/)
- [The Ultimate Guide to the Best Goal Tracker Apps for 2026 — Mindful Suite](https://www.mindfulsuite.com/reviews/best-goal-tracker-apps)
- [GoalsOnTrack — App Store](https://apps.apple.com/us/app/goalsontrack/id1464072292)
- [The Best Visual Goal Trackers - Free and Paid — Goalscape](https://goalscape.com/blog/the-best-visual-goal-trackers/)
- [7 Best Goal Tracker Apps (2026) — Tested & Compared — Kayzn](https://www.kayzn.app/blog/best-goal-tracker-app/)
- [5 Best Goal Tracking Apps for 2026 — Connecteam](https://connecteam.com/best-goal-tracking-apps/)
- [14 Best Goal Tracker Apps for 2026 — Reclaim](https://reclaim.ai/blog/goal-tracker-apps)
- [Sunsama Review 2026: Features, Pricing & Alternatives — Dupple](https://dupple.com/tools/sunsama)
- [Milestones: Growing Together — App Store](https://apps.apple.com/us/app/-/id6757097089)
- [Progressly Accountability Pal — App Store](https://apps.apple.com/mx/app/progressly-accountability-pal/id6743720934)
- [Goal Tracker - GoalScript — App Store](https://apps.apple.com/py/app/goal-tracker-goalscript/id6738457904?l=en-GB)
