# Análise de mercado — Hábitos

Este documento compara o módulo Hábitos do Kortex (`app/pages/app/habits/`, `useHabits.ts`, documentado em [`1.HABITS.md`](./1.HABITS.md)) com o mercado de apps de construção de hábitos — **Habitica** (gamificação/RPG), **Streaks** e **HabitKit** (minimalismo radical), **Atoms** (abordagem "gentil", sem pressão de sequência), **Become** (o concorrente mais próximo: também é construído em cima do framework de *Atomic Habits*, com identidade e empilhamento), e **Strides** (o híbrido meta+hábito mais maduro da categoria, referência direta para o módulo Metas do Kortex).

> Mesmo formato de [`docs/notes/ANALISE_EDITOR_MERCADO.md`](../notes/ANALISE_EDITOR_MERCADO.md) e [`docs/journal/ANALISE_DIARIO_MERCADO.md`](../journal/ANALISE_DIARIO_MERCADO.md): todo item "❌ Faltando"/"⚠️ Parcial" foi conferido no código (via `1.HABITS.md`, já levantado lendo migrations, composables, todos os endpoints e componentes) — não é suposição. A pesquisa de mercado (seção 6) usa fontes públicas de 2026, listadas ao final.

**Escopo**: prioriza o módulo **Hábitos**, mas cobre pontos de contato com **Metas** onde a comparação de mercado exige (Strides, por exemplo, é ao mesmo tempo um app de hábito e de meta — não dá pra comparar um sem o outro).

---

## 1. O que já existe (baseline)

Hábitos com frequência diária/semanal/customizada, dificuldade, tipo (positivo/negativo), as **4 leis** de *Atomic Habits* (tornar óbvio/atraente/fácil/satisfatório) como campos de texto rico por hábito, **identidades** ("eu sou uma pessoa disciplinada") vinculadas a hábitos, **empilhamento de hábitos** ("depois de X, farei Y") em árvore editável por arrastar-e-soltar, **versionamento automático** de configuração do hábito (histórico imutável, cada log preso à versão vigente no dia), streaks com cache, revisão semanal, heatmap anual de consistência (ao vivo, funcional), sincronização unidirecional com um calendário, e exportação de imagem de progresso por hábito.

Esse é um conjunto de recursos genuinamente avançado — a combinação de **identidade + 4 leis + empilhamento + versionamento histórico** num único produto é rara mesmo no mercado estabelecido (só o app "Become" cobre o mesmo território conceitual, ver seção 6.1). O que falta, então, não é sofisticação conceitual — é o conjunto de mecanismos de **motivação/retenção** que a categoria inteira já validou, e (como `1.HABITS.md` documenta em detalhe) **conectar recursos que já foram construídos e nunca ligados à interface**.

---

## 2. Lacunas por categoria

### 2.1 Motivação e retenção (o problema nº1 da categoria)

| Recurso | Status | Nota |
| --- | --- | --- |
| **Gamificação** (pontos, níveis, recompensas, avatar evoluindo) | ❌ Faltando | O schema original do Kortex (`habit_cues`/`habit_rewards`/`habit_settings`, tipos `points`/`badge`/`unlockable`) foi desenhado para isso — mas não tem nenhum endpoint nem UI, e parece ter sido abandonado em favor do modelo das 4 leis (`1.HABITS.md`, seção 15). É o recurso central do Habitica (RPG completo — personagem, equipamento, batalhas), citado como "core free forever" mesmo nos comparativos mais críticos do app. |
| **Streak freeze / recuperação de sequência sem culpa** | ❌ Faltando | Recurso citado como diferencial explícito de vários concorrentes recentes (HabitBrix: "mantém o progresso intacto ao perder um dia, sem perder a sequência"). O Kortex hoje não distingue "perdeu por um dia" de "quebrou a sequência" — o streak simplesmente reseta. |
| **Abordagem "gentil"/sem pressão de sequência** | ❌ Faltando | O posicionamento inteiro do app Atoms é tratar dias perdidos como "dado neutro, não fracasso", com prompts de reflexão sobre o que funcionou/não funcionou — reduzindo abandono por culpa. O Kortex tem o oposto disso hoje: streak quebrada é visualmente punitiva (reseta a zero) e não há nenhum prompt de reflexão pós-falha (a Revisão semanal existe, mas é só semanal, não por hábito perdido). |
| **Lembrete/notificação por hábito** (horário específico, não só o lembrete semanal de revisão) | ❌ Faltando | O Kortex só tem um toggle **módulo-inteiro** (`habit_reminders`) na tela genérica de notificações — nenhum concorrente pesquisado (Streaks, HabitKit, Habitica, Become) trata lembrete como "tudo ou nada"; todos notificam por hábito/horário individual. |
| **Widget de tela inicial** | ❌ Faltando | Fora de escopo de um app web (ver seção 4), mas citado como recurso quase universal na categoria — Streaks, HabitBrix e outros o destacam como diferencial de retenção. |

### 2.2 Identidade e comportamento (força do Kortex — comparar com o concorrente mais próximo)

| Recurso | Status | Nota |
| --- | --- | --- |
| Hábitos baseados em identidade | ✅ Já existe | Comparável diretamente ao app "Become" — que também parte de "quem você quer se tornar" e trata cada conclusão como um "voto" para essa identidade. O Kortex tem o dado (identidade vinculada, progresso por identidade nos Insights), mas **não emoldura a conclusão como "voto"** na UI — é uma oportunidade de enquadramento (framing), não de dado faltando. |
| 4 leis do comportamento | ✅ Já existe | Igual ou mais completo que a maioria dos concorrentes pesquisados — a maior parte dos apps trata isso como conteúdo educativo (posts de blog), não como campo estruturado por hábito. O Kortex é um dos poucos que estrutura isso como dado editável. |
| Empilhamento de hábitos | ✅ Já existe | O "Become" também oferece empilhamento; a implementação do Kortex (árvore com múltiplos filhos por gatilho, editável por drag-and-drop) é comparável ou mais rica. |
| "Emergência" — versão mínima do hábito num dia ruim | ❌ Faltando | Recurso citado do "Become" ("versões de emergência para nunca quebrar a corrente completamente") — uma versão reduzida do hábito (ex.: "1 flexão" em vez de "20 minutos de treino") que ainda conta como cumprido num dia difícil. Não existe equivalente no Kortex; hoje é feito/não-feito binário (mais status `done_later`/`skipped`, sem uma noção de "versão mínima"). |

### 2.3 Metas + hábitos combinados (comparar com Strides)

| Recurso | Status | Nota |
| --- | --- | --- |
| Metas com categorias de tempo/vida | ✅ Já existe | `goal_time_category`/`goal_life_category` — organização comparável à de Strides. |
| **4 tipos de rastreador** (meta/hábito/média/marco de projeto) | ❌ Faltando | O diferencial central de Strides é tratar "meta" e "hábito" como o mesmo mecanismo de rastreamento com 4 modos (alvo numérico, hábito de consistência, média, marcos de projeto) — o Kortex trata Metas e Hábitos como **dois módulos separados** com um vínculo fraco entre eles (`goal_habits`), sem um tipo de meta "numérica com progresso automático" alimentado por hábitos. |
| **Progresso de meta alimentado por hábitos** | ❌ Faltando | Hoje o progresso de uma meta no Kortex vem só de tarefas concluídas (`goal_tasks`) — nunca de hábitos vinculados, mesmo a UI sugerindo essa relação (`1.HABITS.md`, seção 17). Em Strides, um "hábito" pode ser diretamente um dos 4 tipos de meta, então o progresso é nativamente unificado. |
| Templates de meta/hábito prontos | ❌ Faltando | Strides tem 150+ templates prontos; o Kortex sempre parte de um formulário em branco. |

### 2.4 Visualização e insights

| Recurso | Status | Nota |
| --- | --- | --- |
| Heatmap anual de consistência | ✅ Já existe | Ao vivo e funcional (`1.HABITS.md`, seção 5) — no nível do que a categoria oferece (GitHub-style é o padrão de fato). |
| Taxa de conclusão, streak médio, "melhor dia" | ✅ Já existe | Comparável aos relatórios de Strides/HabitKit. |
| **Correlação entre hábitos e humor** (cruzando com o módulo Diário) | ❌ Faltando | Nenhum concorrente pesquisado tem isso nativamente (é uma combinação hábito+diário, categorias tipicamente vendidas como apps separados) — mas é uma oportunidade de diferenciação real do Kortex, que já tem os dois módulos e os dois dados (humor por dia no Diário, conclusão por dia em Hábitos) sem nenhuma análise cruzada hoje. Ver seção 6.1. |
| Integração com dados de saúde (Apple Health, passos, sono) | ❌ Faltando | Streaks e Strides destacam isso como recurso de retenção (hábito "correr" auto-marcado quando o Health registra uma corrida). Fora de escopo natural para um app web (ver seção 4), mas vale registrar como lacuna estrutural, não só de prioridade. |

### 2.5 Social / accountability

| Recurso | Status | Nota |
| --- | --- | --- |
| Compartilhar progresso publicamente | ⚠️ Construído, quebrado/inalcançável | Existe todo o schema/endpoint (`habit_user_settings.share_token`), mas **sem UI para ativar** e com um bug confirmado que zera as taxas de conclusão exibidas (`1.HABITS.md`, seções 11–12). É, ao mesmo tempo, a lacuna de maior esforço-já-investido e menor retorno atual do módulo — arrumar isso é puramente "ligar o que já existe", não construir algo novo. |
| Desafios/grupos com amigos ou comunidade | ❌ Faltando | Recurso central do Habitica (guildas, desafios, batalhas cooperativas) e citado como diferencial de apps mais novos como Streakly ("junte-se a desafios com amigos ou a comunidade"). O Kortex não tem nenhum conceito de hábito compartilhado/colaborativo — só a imagem estática exportável. |
| Parceiro de responsabilidade (accountability partner) com notificação cruzada | ❌ Faltando | Vários apps recentes oferecem "convide alguém para ver sua sequência" com notificações de cutucão (nudge) — pressão social saudável. Não existe no Kortex. |

---

## 3. Roadmap sugerido (por esforço x impacto)

### P0 — Ligar o que já está construído + corrigir bugs confirmados
1. **Corrigir o bug do link público de progresso** (`share.get.ts` não seleciona `habits.id`) e **construir a UI que falta** para ativar `shareEnabled` (hoje só existe no componente morto `SettingsPanel.vue`) — fecha de uma vez a lacuna de "social/accountability" de menor esforço, já que back-end e schema estão prontos.
2. **Corrigir a inconsistência de "devido" entre `today.get.ts` e `cron-skip.post.ts`** para hábitos semanais, e **consolidar `isDueOnDay()`** num único lugar compartilhado — bug de correção de dados, não de produto, mas com efeito direto na precisão de streaks (que é a métrica mais visível de todo app do gênero).
3. **Corrigir a paginação da aba "Todos"** — hoje pode esconder ou duplicar visualmente hábitos empilhados.
4. **UX otimista ao marcar um hábito como feito** — hoje espera resposta do servidor a cada toque; é o tipo de fricção que a pesquisa de mercado aponta repetidamente como motivo de abandono ("o melhor rastreador é o que leva menos tempo que o próprio hábito").

### P1 — Fecha o gap estrutural nº1 da categoria: retenção sem punição
5. **Streak freeze / recuperação sem culpa** — permitir marcar um dia como "perdoado" sem zerar a sequência (com limite mensal, como a maioria dos concorrentes faz), inspirado em HabitBrix/Streaks.
6. **Lembrete por hábito** (horário individual), não só o toggle módulo-inteiro que existe hoje — usar a mesma infraestrutura de notificação já usada pelo lembrete de revisão semanal.
7. **Progresso da meta considerando hábitos vinculados**, não só tarefas — fecha o gap já documentado internamente pela própria equipe (`1.HABITS.md`, seções 17 e 19) e aproxima o Kortex do modelo unificado do Strides.
8. **Aplicar cardinalidade "um hábito → uma meta"** (ou decidir conscientemente permitir várias e refletir isso na UI) — hoje o comportamento real diverge da intenção de produto documentada no próprio TODO da equipe.

### P2 — Recursos de "app de hábito maduro"
9. **Versão "de emergência"/mínima do hábito** — inspirado no "Become", uma versão reduzida que ainda conta num dia difícil, evitando o abandono total.
10. **Correlação hábitos × humor**, cruzando com o Diário — nenhum concorrente pesquisado oferece isso nativamente; é a oportunidade de diferenciação mais barata da lista (os dois módulos e os dois conjuntos de dados já existem no Kortex).
11. **Templates de hábito/meta prontos** (ex.: biblioteca inicial por categoria de vida) — reduz a fricção do formulário em branco, no espírito dos 150+ templates do Strides.
12. **Histórico de mudanças visível na UI** — `habit_change_history` já é gravado (`fetchHistory()` já existe no composable), só falta um componente que o exiba.
13. **Compartilhar um hábito/desafio com outra pessoa** (accountability partner, notificação cruzada) — bom-ter de esforço médio, citado como tendência recente em vários concorrentes (Streakly).

### P3 — Apostas maiores / diferenciação
14. **Gamificação leve** (pontos/emblemas por consistência, não um RPG completo) — reaproveitar conceitualmente o schema morto de `habit_rewards`, mas com um design mais simples que o Habitica (cuja própria comunidade reclama de complexidade e bugs de gamificação atrapalhando o rastreamento básico — ver seção 6.2). Não recomendo replicar o RPG completo do Habitica (ver seção 4).
15. **IA como "coach" de hábito** — sugestão de próximo hábito a empilhar, ajuste de dificuldade com base no histórico de conclusão, redação assistida das 4 leis para um hábito novo. Conecta com os itens de IA já mapeados nos roadmaps de Notas (P3) e Diário (P3) — mesma pergunta de arquitetura (fonte de dados unificada para IA sobre o conteúdo do usuário).
16. **Integração com dados de saúde/wearables** — maior esforço da lista (integração externa), mas citado como recurso de retenção real (auto-completar um hábito de exercício a partir do Health/Google Fit).
17. **4 tipos de rastreador estilo Strides** (meta numérica/hábito/média/marcos) — a mudança mais estrutural da lista, unificando de fato Metas e Hábitos num único mecanismo em vez de dois módulos com vínculo fraco. Vale considerar como um redesenho de arquitetura, não uma feature isolada.

---

## 4. Fora de escopo (não recomendo perseguir agora)

- **RPG completo estilo Habitica** (personagem, equipamento, batalhas cooperativas) — a própria pesquisa de mercado mostra que esse é um investimento grande com retorno ambíguo: a mesma gamificação que atrai uma parte dos usuários é citada como fonte de bugs e "complexidade que atrapalha o rastreamento simples" por outra parte. O item 14 (gamificação leve) captura o essencial do valor sem esse risco.
- **Widget de tela inicial / app nativo mobile** — mesma decisão já registrada em `docs/journal/ANALISE_DIARIO_MERCADO.md`: exigiria um app nativo dedicado, projeto à parte.
- **Integração com wearables/Apple Health/Google Fit no curto prazo** — tecnicamente viável, mas é integração com plataforma externa de baixo controle do time; mantido no roadmap (P3, item 16) mas não priorizado.

---

## 5. Relação com os outros roadmaps do Kortex

- **Correlação hábitos × humor** (P2, item 10) é o ponto de maior sinergia entre módulos — depende dos dados que já existem tanto em Hábitos quanto no Diário (ver `docs/journal/ANALISE_DIARIO_MERCADO.md`, item 11 do roadmap de lá, "Correlação humor × métricas" — os dois itens deveriam ser desenhados juntos, já que ambos cruzam humor com outra série temporal do usuário).
- **IA como coach** (P3, item 15) — mesma pergunta arquitetural que aparece nos roadmaps de Notas e Diário: se o Kortex for atrás de IA sobre o conteúdo do usuário, vale decidir desde já se é uma fonte de dados unificada (notas + entradas de diário + histórico de hábitos) ou pipelines por módulo.
- **Progresso de meta unificado com hábitos** (P1, item 7 / P3, item 17) é uma decisão que também toca o módulo Metas diretamente — vale revisitar `1.HABITS.md` (seção 17) antes de desenhar, já que o gap já está documentado em detalhe ali.

---

## 6. O que a comunidade/mercado pede (pesquisa)

Levantamento em reviews e comparativos de 2026 dos principais apps de hábito (Habitica, Streaks, Atoms, Become, HabitKit) e do híbrido meta+hábito mais maduro da categoria (Strides), mais apps recentes de nicho (HabitBrix, Streakly) focados em streak freeze e accountability social. Fontes ao final da seção.

### 6.1 O concorrente mais próximo — e onde o Kortex já está à frente ou atrás

O app **"Become"** é, dos pesquisados, o único construído explicitamente sobre o mesmo framework que o Kortex usa (identidade + 4 leis + empilhamento) — "começa perguntando quem você quer se tornar, emoldura cada hábito concluído como um voto para essa identidade, e inclui versões de emergência para nunca quebrar a corrente completamente". Comparando diretamente:
- O Kortex **já iguala ou supera** o Become em profundidade de dado estruturado (4 leis como texto rico por hábito, identidade com progresso calculado, empilhamento em árvore com múltiplos filhos, e um sistema de **versionamento histórico** que o material pesquisado sobre o Become não menciona ter).
- O Kortex **fica atrás** em dois pontos específicos e replicáveis: (1) o enquadramento de "cada conclusão é um voto para quem você quer ser" — puramente uma questão de copy/UX, não de dado faltando; (2) "versões de emergência" do hábito — um recurso de produto real e ausente (item 9 do roadmap).

### 6.2 Gamificação — onde funciona e onde vira ruído

- Habitica prova que gamificação pesada tem público real e fiel ("o núcleo do jogo é grátis para sempre") — mas as mesmas fontes que o recomendam também documentam reclamações recorrentes: **bugs afetando sequências e notificações**, curva de aprendizado alta, interface carregada, e a citação direta mais reveladora: **"a gamificação às vezes atrapalha o rastreamento simples — as mesmas funcionalidades que encantam alguns usuários frustram outros"**. Isso é o argumento mais forte encontrado a favor de gamificação **leve** (item 14) em vez de replicar o modelo RPG completo.
- Em contraste direto, o app **Atoms** aposta no oposto — sem pressão de sequência, tratando um dia perdido como dado neutro em vez de fracasso, com prompts de reflexão sobre o que funcionou. A pesquisa não indica que uma abordagem "vence" a outra objetivamente — indica que são dois segmentos de usuário diferentes. Vale registrar isso como uma decisão de produto a se ter consciência, não como um roadmap único "certo": o Kortex hoje está, sem ter decidido isso deliberadamente, mais perto do polo "punitivo" (streak reseta, sem prompt de reflexão por hábito perdido) do que do polo "gentil" — os itens 5 (streak freeze) e 9 (versão de emergência) empurram na direção "gentil" sem exigir construir um sistema de pontos completo.

### 6.3 Minimalismo como categoria própria

- Streaks e HabitKit representam o extremo oposto de Habitica: **"o melhor rastreador é o que leva menos tempo de usar do que o próprio hábito"** (Streaks) e HabitKit funciona **sem exigir conta** — fricção mínima de entrada. Isso reforça a prioridade do item 4 do roadmap P0 (UX otimista ao marcar um hábito) — hoje o Kortex tem uma fricção de rede a cada toque que vai exatamente contra esse princípio validado pela categoria inteira.

### 6.4 Metas + hábitos como um só mecanismo — o modelo Strides

- Strides é citado como o app de referência para quem quer SMART goals nativamente integradas a hábitos de consistência, através de **4 tipos de rastreador num único mecanismo** (alvo numérico, hábito, média, marcos de projeto) em vez de dois sistemas separados. É a validação de mercado mais forte para reconsiderar a arquitetura atual do Kortex (dois módulos com um vínculo fraco `goal_habits`) — ver item 17 do roadmap (P3, mudança estrutural) e a nota de progresso unificado (item 7, P1, a versão de menor esforço do mesmo problema).

### 6.5 Streak freeze e accountability social — tendência recente

- Streak freeze aparece como recurso citado de forma consistente em apps mais novos (HabitBrix) como resposta direta ao problema de abandono por streak quebrada — confirma a priorização do item 5.
- Accountability social (compartilhar sequência com alguém, desafios com amigos/comunidade, notificações de "cutucão") aparece em múltiplos apps recentes (Streakly e outros) como mecanismo de retenção que não depende de gamificação — reforça que o item 1 (arrumar o compartilhamento público já construído) e o item 13 (accountability partner) têm validação de mercado real, não são só "recursos bons de se ter".

### Fontes consultadas

- [12 best habit tracking apps in 2026 — 2sync](https://2sync.com/blog/best-habit-tracker-apps)
- [Best Habit Tracker Apps in 2026: 10 Apps Honestly Compared — beyondtime.ai](https://beyondtime.ai/blog/best-habit-tracker-apps-2026-compared)
- [The 10 Best Habit Tracker Apps of 2026 (and Why Most People Quit) — Together with Kai](https://togetherwithkai.com/blog/best-habit-tracker-apps)
- [Best Habit Tracker Apps for iPhone 2026 — EasyHabits](https://www.easyhabits.io/blog/best-habit-tracker-apps)
- [Atomic Habits Habit Tracker: How to Implement James Clear's System With an App — Kabit](https://kabitapp.com/blog/atomic-habits-habit-tracker)
- [Become – Build Habits That Prove Who You Are](https://getbecomeapp.com/)
- [Atomic Habits Cheat Sheet: The 4 Laws (2026) — HabitBox Blog](https://habitbox.app/blog/atomic-habits-cheat-sheet)
- [Habitica: Gamify Your Tasks Review & Alternatives — ProdApps](https://productivity-apps.com/apps/habitica)
- [Strides: Goal & Habit Tracker + SMART Goal Setting App](https://www.stridesapp.com/)
- [Strides - Goal & Habit Tracker App for SMART Goal Setting and Routine Building — Siteefy](https://siteefy.com/tools/strides)
- [The Ultimate Guide to the Best Goal Tracker Apps for 2026 — Mindful Suite](https://www.mindfulsuite.com/reviews/best-goal-tracker-apps)
- [7 Best Streak Tracker Apps in 2026 (Tested) — Habi](https://habi.app/insights/best-streak-tracker-apps/)
- [Best Habit Tracker Reddit: Top 10 Apps for 2026 — Recurrr](https://recurrr.com/articles/best-habit-tracker-reddit)
- [HabitBrix: Habit Tracker — App Store](https://apps.apple.com/app/id6759487422)
- [Streaks & Goals - Streakly — App Store](https://apps.apple.com/app/id6756124546)
