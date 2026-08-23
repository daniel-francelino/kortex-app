# Análise de mercado — Diário de Bordo

> **Nota (2026-08-23)**: este documento é uma análise histórica de mercado/roadmap. As menções a "tags" e "métricas do dia" abaixo descrevem um estado que **não existe mais** — ambas foram removidas da UI e da API do módulo em 2026-08-23, com o plano de reintroduzi-las como geração automática por IA (resumo por pessoa, não preenchimento manual). Ver `1.JOURNAL.md`, seção 7, para o estado atual.

Este documento compara o módulo Diário de Bordo do Kortex (`app/pages/app/journal/index.vue` + `useJournal.ts`, documentado em [`1.JOURNAL.md`](./1.JOURNAL.md)) com o que hoje é padrão em apps de diário/journaling — **Day One** (referência de mercado, o app mais maduro da categoria), **Daylio** (referência em humor + micro-journaling + correlações), **Journey** e **Diarium** (multiplataforma, guiados por templates), a nova onda de **diários com IA** (Rosebud, Reflectly, Stoic) e o padrão de **daily notes** do Obsidian (a alternativa "texto livre em Markdown" mais próxima da filosofia do Kortex).

> Segue o mesmo formato de [`docs/notes/ANALISE_EDITOR_MERCADO.md`](../notes/ANALISE_EDITOR_MERCADO.md): todo item "❌ Faltando"/"⚠️ Parcial" foi conferido no código antes de entrar aqui (via `1.JOURNAL.md`, que por sua vez foi levantado lendo `useJournal.ts`, as migrations e todos os componentes/endpoints do módulo) — não é suposição. A pesquisa de mercado (seção 6) usa fontes públicas de 2026, listadas ao final.

**Escopo**: este roadmap é priorizado pelas necessidades do módulo **Diário**, que tem arquitetura própria (schema, composable, padrão de salvamento) independente de Notas, apesar de reaproveitar o mesmo motor de edição de blocos — ver `1.JOURNAL.md`, seção 12, para o que é compartilhado e o que não é.

> **Status de implementação (atualizado)**: todo o **P0** (métricas, insights, exclusão/arquivamento de entrada, correção do bug de limpar tags) e os itens do **P1** que dependiam apenas de conectar peças já construídas (streak no próprio módulo, busca/listagem de entradas, gestão de tags) foram implementados — ver `1.JOURNAL.md` para o estado atual dessas telas. Ao conectar o painel de métricas foi descoberto e corrigido um bug estrutural que teria impedido a P0/1 de funcionar mesmo conectada: os endpoints devolviam as linhas do Supabase em `snake_case` (`is_active`, `entry_date`, etc.) mas o frontend espera `camelCase` — corrigido via `server/utils/journal-mappers.ts`. Do **P2**, dois itens também foram implementados: **prompts/templates de entrada** (item 10, versão fixa — quatro sugestões estáticas, sem geração dinâmica) e **correlação humor × métricas** (item 11, no painel de Insights). Também foi corrigido, à parte do roadmap, um bug real no auto-save (`TodayEditor.vue`) que podia perder texto digitado durante a janela de salvamento — ver `1.JOURNAL.md`, seção 2. Além disso, `useJournal.ts` foi reescrito para seguir a mesma arquitetura de store reativo local com ações otimistas e fila offline que `useNotes.ts` já usa (`useOptimisticAction`/`useMutationQueue`/`useConnectionStatus`), substituindo o padrão anterior de "`$fetch` seguido de `refresh()` completo" — ver `1.JOURNAL.md`, seção 12. Também foi fechada, fora do roadmap original, a lacuna de **exclusão de tag** (`DELETE /api/journal/tags/[id]`) — ver `1.JOURNAL.md`, seção 7.1. Exclusão de definição de métrica foi avaliada e descartada de propósito: apagar uma definição levaria junto todo o histórico de valores registrados (`ON DELETE CASCADE`), e a decisão foi manter só a desativação (`isActive: false`) já existente. O restante do P1 (lembrete/notificação — não tem pipeline de notificação agendada pronto no projeto para ligar) e o restante do P2/P3 (notas de voz, notas periódicas, PIN/biometria, E2E, exportação, geotag/clima, prompts guiados por IA) segue **não implementado**, como descrito no roadmap abaixo.

---

## 1. O que já existe (baseline)

Uma entrada de texto livre por dia (garantida única por `UNIQUE(user_id, entry_date)`), com o mesmo editor de blocos de Notas (sem wikilinks), humor de 5 níveis por entrada, calendário mensal com indicador visual de humor/entrada por dia, modal de detalhe para editar qualquer data passada, salvamento automático por polling (10s/60s) na entrada de hoje, guarda de navegação com confirmação de "salvar antes de sair". No backend já existem — mas sem UI conectada — um sistema completo de métricas pessoais quantificáveis (número/escala/booleano/seleção/texto), um endpoint de insights por período, e uma listagem paginada com busca/filtro por tag e por data.

Isso cobre o "core loop" de escrever uma entrada por dia. As lacunas abaixo são o que separa isso de um app de diário maduro — tanto por causa de recursos que faltam construir quanto por recursos que **já foram construídos e nunca ligados à tela**.

---

## 2. Lacunas por categoria

### 2.1 Consistência de escrita (o problema nº1 de qualquer diário)

| Recurso | Status | Nota |
| --- | --- | --- |
| **Lembrete/notificação para escrever** | ❌ Faltando | Confirmado — não há nenhum agendamento de notificação no módulo. Praticamente todo concorrente pesquisado usa isso como principal mecanismo de retenção (Day One, Journey, Journie). |
| **Indicador de sequência (streak)** dentro do próprio módulo | ❌ Faltando | Existe um cálculo de streak, mas ele mora no módulo Life OS (`GET /api/life/insights`) e só aparece no dashboard geral (`DashboardInsights.vue`) — a tela do Diário em si não mostra nenhuma sequência, nem parcial nem quebrada. Ver `1.JOURNAL.md`, seção 13. |
| **Widget / captura rápida fora do app** | ❌ Faltando | Fora de escopo de um app web (ver seção 5), mas vale registrar como diferencial forte de Day One/Journey (widget de home screen). |
| **Prompt diário** (uma pergunta/sugestão para destravar a escrita) | ❌ Faltando | Recurso central de Journey ("guided journaling") e de todo app de IA pesquisado (Reflectly, Stoic). O Kortex hoje entrega uma página em branco. |

### 2.2 Humor, métricas e correlações

| Recurso | Status | Nota |
| --- | --- | --- |
| Humor por entrada (5 níveis, emoji) | ✅ Já existe | `MoodSelector.vue`, persistido e exibido no calendário. |
| **Métricas quantificadas** (sono, energia, etc.) | ⚠️ Construído, sem UI | Schema (`metric_definitions`/`metric_values`), 5 endpoints e os componentes `MetricsPanel.vue`/`MetricCreateModal.vue` existem prontos — só não estão montados em nenhuma tela (`1.JOURNAL.md`, seção 8). É a lacuna mais fácil de fechar da lista inteira: não é "construir", é "ligar". |
| **Correlação entre atividades/métricas e humor** | ❌ Faltando | O recurso central do Daylio ("dias que você se exercita, seu humor é X% melhor") — o Kortex tem os dados brutos (humor + métricas por dia) mas nenhuma análise cruzada entre eles, nem no endpoint de insights nem em lugar nenhum. |
| **Painel de insights** (distribuição por dia da semana, médias de métrica no período) | ⚠️ Construído, sem UI | `GET /api/journal/insights` + `InsightsPanel.vue` prontos, nunca montados (`1.JOURNAL.md`, seção 9). |
| Gráficos de tendência de humor ao longo do tempo | ❌ Faltando | Nem o endpoint de insights nem o painel morto calculam uma série temporal de humor — só distribuição por dia da semana e estatística de métrica. |

### 2.3 Estrutura temporal

| Recurso | Status | Nota |
| --- | --- | --- |
| Entrada diária | ✅ Já existe | Uma por dia, chave do modelo de dados. |
| **Notas semanais/mensais/anuais** (rollup periódico, estilo "Periodic Notes" do Obsidian) | ❌ Faltando | O Kortex não tem o conceito de nota semanal/mensal — só entradas diárias avulsas. O padrão Obsidian (Daily → Weekly → Monthly → Quarterly, cada nível linkando ou resumindo o anterior) não existe aqui. |
| Templates de entrada (gratidão, viagem, reflexão guiada) | ❌ Faltando | Recurso central de Journey ("coach programs" com templates para autocuidado, gratidão, crescimento pessoal). O editor do Kortex sempre abre vazio. |
| Ver entradas passadas em sequência (linha do tempo/lista) | ⚠️ Parcial | `EntryList.vue` existe pronto (com busca/filtro), mas não está montado — hoje só dá pra navegar pelo calendário, dia a dia (`1.JOURNAL.md`, seção 1/14). |

### 2.4 Mídia, contexto automático e privacidade

| Recurso | Status | Nota |
| --- | --- | --- |
| Anexar imagem/arquivo na entrada | ✅ Já existe | Via os blocos de imagem/arquivo do editor compartilhado com Notas. |
| **Nota de voz com transcrição** | ❌ Faltando | Mesmo gap já identificado para Notas (`docs/notes/ANALISE_EDITOR_MERCADO.md`, seção 6.1) — aqui é ainda mais relevante, já que gravar um áudio no fim do dia é um padrão de uso comum de diário (Diarium tem dictation nativo; Vox/NeuroVox são plugins populares no Obsidian por causa disso). |
| **Tag automática de localização/clima** | ❌ Faltando | Recurso padrão de Journey e Diarium (geotag + clima do dia automaticamente na entrada) — não existe equivalente no Kortex. |
| **Bloqueio da tela do diário com PIN/biometria** | ❌ Faltando | Diferente de Notas, um diário é conteúdo tipicamente mais sensível — Day One, Diarium e a maioria dos apps do gênero oferecem um cadeado adicional (PIN/Face ID) só para a seção de diário, além do login do app. O Kortex não tem nenhuma camada extra aqui — mesma autenticação da conta cobre tudo. |
| **Criptografia ponta-a-ponta** | ❌ Faltando | Day One, Diarium e Obsidian+Sync oferecem E2E; o Kortex, como a maioria dos apps baseados em nuvem (mesma categoria de Notion), não — dado armazenado legível pelo backend/Supabase. Ver seção 6.3. |
| Exportar entradas (PDF, Markdown, backup) | ❌ Faltando | Não existe nenhum endpoint de exportação no módulo — mesma lacuna existe hoje em Notas. |

### 2.5 Organização e busca

| Recurso | Status | Nota |
| --- | --- | --- |
| Tags por entrada | ⚠️ Parcial | Persistidas e exibidas (somente leitura) no modal de detalhe, mas sem nenhuma UI para criar/adicionar/remover tag, e o endpoint de salvar não consegue limpar todas as tags de uma entrada (`1.JOURNAL.md`, seções 7 e 14) — pior estado do que Notas, que ao menos tem um `TagManager.vue` pronto (mesmo que desconectado). |
| **Busca por texto dentro do diário** | ⚠️ Construído, sem UI | `GET /api/journal/entries` já aceita `q` (busca por `ilike` em título/conteúdo) — só não há caixa de busca em lugar nenhum da tela do Diário. |
| **Excluir ou arquivar uma entrada** | ❌ Faltando | Existe a coluna `archived_at` na tabela, mas nenhum endpoint a usa — não há `DELETE` nem "arquivar" para entrada, tag, definição de métrica ou valor de métrica em lugar nenhum da API (`1.JOURNAL.md`, seção 14). Uma vez escrita, uma entrada não pode ser removida pelo app. |

---

## 3. Roadmap sugerido (por esforço x impacto)

### P0 — Ligar o que já está construído + fechar riscos óbvios
1. **Conectar o painel de métricas** (`MetricsPanel.vue`/`MetricCreateModal.vue` + as 3 ações do composable já prontas) à tela de hoje e ao modal de detalhe — é a lacuna de maior impacto percebido pelo menor esforço de todo o documento, já que zero código novo de backend é necessário.
2. **Conectar o painel de insights** (`InsightsPanel.vue` + `GET /api/journal/insights`, já prontos) — expor período (7d/30d/90d), distribuição por dia da semana e médias de métrica dentro do próprio módulo.
3. **Excluir/arquivar entrada** — usar a coluna `archived_at` já existente; hoje é uma lacuna de segurança de dados (usuário não consegue apagar nada que escreveu por engano).
4. **Corrigir a lacuna de limpar tags** no `POST /api/journal/entries` (`tags: []` hoje não remove vínculos) e dar uma UI mínima para adicionar/remover tag na entrada — hoje é só leitura.

### P1 — Fecha o gap estrutural nº1 da categoria: consistência de escrita
5. **Streak dentro do próprio módulo** — reaproveitar o cálculo que já existe em `GET /api/life/insights` (ou replicar a lógica) e mostrar na tela do Diário, não só no dashboard geral.
6. **Lembrete para escrever** (notificação) — o mecanismo de retenção nº1 de todo concorrente pesquisado (Day One, Journey, Journie); mesmo uma versão simples (notificação de navegador num horário configurável) já fecha a lacuna mais citada na pesquisa de mercado (seção 6).
7. **Busca dentro do diário** — expor o `q` que o endpoint já aceita numa caixa de busca real, junto com o filtro por tag/data que o backend também já suporta.
8. **Listagem/linha do tempo de entradas** — montar `EntryList.vue` (já existe) como uma visão alternativa ao calendário, para folhear entradas passadas em sequência.

### P2 — Recursos de "diário maduro"
9. **Notas de voz com transcrição** — mesma tecnologia planejada para Notas (ver `docs/notes/PLANO_EDITOR_P2.md`), aplicada à entrada do dia.
10. ✅ **Templates/prompts de entrada** (gratidão, reflexão do dia, revisão semanal) — inspirado nos "coach programs" do Journey; reduz a fricção da página em branco. Implementado em 2026-08-23: banco de 10 prompts com rotação diária determinística (4 visíveis por vez) + botão manual "Outras ideias" (`1.JOURNAL.md`, seção 2). Ainda **não** é geração dinâmica por IA baseada no que a pessoa escreve — isso segue como lacuna, na mesma frente da futura geração de métricas/tags (`1.JOURNAL.md`, seção 7).
11. **Correlação humor × métricas** — cruzar os dados que já existem (humor por dia + métricas por dia) para mostrar padrões, no estilo Daylio ("nos dias em que você dorme bem, seu humor tende a ser melhor"). Depende dos itens 1 e 2 já estarem entregando dado suficiente.
12. ✅ **Bloqueio adicional (PIN/biometria) para a seção de diário** — camada de privacidade extra, específica desse módulo por lidar com conteúdo mais sensível que uma nota comum. Implementado em 2026-08-23, só PIN (sem biometria): dois modos configuráveis em Configurações → Segurança — "Diário inteiro" (trava toda a tela) ou "Entradas específicas" (cadeado por entrada). Ver `1.JOURNAL.md`, seção 13.
13. **Notas semanais/mensais (rollup periódico)** — estilo Periodic Notes do Obsidian: uma nota de resumo da semana/mês que referencia ou resume as entradas diárias do período.

### P3 — Apostas maiores / diferenciação
14. **Prompts guiados por IA + reflexão** (perguntas personalizadas com base no que a pessoa já escreveu, resumo semanal automático) — o que hoje diferencia Rosebud/Reflectly/Stoic de um diário comum; conecta com o item 18 do roadmap de Notas (IA que responde com base em todas as notas) se o RAG pessoal for compartilhado entre os dois módulos.
15. **Exportação (Markdown/PDF/backup)** — tabela-stakes em qualquer app de diário sério, hoje ausente tanto aqui quanto em Notas.
16. **Criptografia ponta-a-ponta** — maior esforço da lista (muda o modelo de armazenamento inteiro), mas é exatamente o que a pesquisa de mercado aponta como diferencial de confiança nos apps mais respeitados da categoria (seção 6.3).
17. **Geotag/clima automático na entrada** — bom-ter, baixo diferencial percebido comparado aos itens acima; only fazer se sobrar prioridade.

---

## 4. Fora de escopo (não recomendo perseguir agora)

- **Widget de tela inicial / app nativo mobile** — o Kortex é um app web; um widget de captura rápida (o grande diferencial de Day One/Journey) exigiria um app nativo dedicado, projeto à parte que foge do escopo deste módulo.
- **Sincronização automática com wearables/fitness trackers** (Diarium puxa dados de saúde/localização/redes sociais automaticamente) — complexidade de integração alta para um ganho que o sistema de métricas manuais (já construído, só desconectado — item P0/1) resolve de forma mais simples e sob controle do usuário.
- **Rede social / compartilhar entradas publicamente** — diário é, por natureza, o conteúdo mais pessoal do app; nenhum concorrente pesquisado tem isso como recurso central, e vai contra a expectativa de privacidade da categoria.

---

## 5. Relação com o roadmap de Notas

Vale registrar onde os dois roadmaps se cruzam, para não duplicar trabalho:

- **Notas de voz com transcrição** (P2 aqui, item 14 do roadmap de Notas) — mesma peça de infraestrutura (transcrição de áudio), dois pontos de entrada diferentes (bloco de editor em Notas, gravação de entrada no Diário).
- **IA que responde com base em todo o conteúdo pessoal** (P3 aqui, item 18 do roadmap de Notas) — se o RAG for construído sobre "todo o conteúdo do usuário" (notas + entradas de diário), vale desenhar os dois já pensando numa fonte de dados unificada, em vez de dois pipelines de embeddings separados.
- **Exportação** — hoje ausente nos dois módulos; se for construída, vale um mecanismo compartilhado (Markdown/PDF genérico) em vez de dois exportadores.
- **Editor de blocos em si** — qualquer melhoria feita no motor compartilhado (`NotionStyleEditor.vue`/`useNotionEditor.ts`, ver `docs/notes/ANALISE_EDITOR_MERCADO.md`) beneficia o Diário de graça, exceto wikilinks (deliberadamente desligado aqui) e os itens específicos de "nota como um todo" (capa, lixeira de nota, tipo/tags), que não se aplicam a uma entrada de diário.

---

## 6. O que a comunidade/mercado pede (pesquisa)

Levantamento em reviews e comparativos de 2026 dos principais apps de diário (Day One, Journey, Diarium, Daylio) e da nova geração de diários com IA (Rosebud, Reflectly, Stoic, Mindsera), além do padrão de daily notes do Obsidian. Fontes ao final da seção.

### 6.1 O que já é padrão de categoria e o Kortex ainda não tem

- **Streaks e lembretes de escrita são o mecanismo de retenção nº1** em praticamente todo app pesquisado — "The Journal" notifica antes da sequência expirar, Day One mostra streak e frequência de escrita, Journie tem "smart notifications" para manter a rotina. Isso reforça a priorização dos itens 5 e 6 no roadmap (P1): sem isso, o Kortex está competindo sem a peça que a categoria inteira já provou ser essencial para consistência.
- **Templates/prompts guiados reduzem a fricção da página em branco** — Journey é destacado especificamente por sua biblioteca de templates (gratidão, viagem, autocuidado) e "coach programs"; os apps de IA (Reflectly, Stoic, Rosebud) resolvem o mesmo problema de outra forma (pergunta gerada dinamicamente). O Kortex hoje não tem nenhuma das duas abordagens.
- **Correlação entre atividades/métricas e humor é o diferencial central do Daylio** — o app inteiro gira em torno de "seu humor muda X% nos dias em que Y acontece", construído sobre um registro de 2 toques (humor + atividades). O Kortex já tem os dois ingredientes brutos (humor + métricas por dia) prontos no schema — falta exatamente essa camada de análise cruzada, que hoje não existe nem no endpoint de insights.
- **Estrutura periódica (daily → weekly → monthly) é o padrão de quem usa Obsidian para diário** — via o plugin oficial Periodic Notes, o fluxo comum é a entrada diária "borbulhar" para um resumo semanal, depois mensal, depois trimestral. O Kortex trata cada dia como uma ilha isolada, sem nenhum nível de agregação temporal.

### 6.2 IA em diários — onde a categoria está indo, e o que evitar

- **Rosebud** se destaca por embutir frameworks terapêuticos (CBT/ACT) nos prompts — mais "clínico" e estruturado.
- **Reflectly** é o mais acessível/rápido de usar, mas as fontes apontam que as perguntas não vão fundo o suficiente para temas emocionalmente complexos (luto, ansiedade, conflitos) — um alerta de design a considerar se o Kortex for atrás do item 14 (prompts por IA): superficial demais frustra, profundo demais intimida; vale calibrar.
- **Stoic** tem o posicionamento mais focado (reflexão matinal/noturna estilo estoico) — exemplo de que "fazer uma coisa bem" pode superar apps mais genéricos.

### 6.3 Privacidade — o ponto mais recorrente da pesquisa inteira

- Criptografia ponta-a-ponta aparece como critério decisivo em praticamente toda fonte comparativa consultada — Day One venceu um comparativo geral "por causa da criptografia ponta-a-ponta"; Diarium e Obsidian+Sync são citados pelo mesmo motivo; usuários "querem apps de diário com criptografia ponta-a-ponta" e se preocupam explicitamente se o app vende dados. Diário é, por natureza, o conteúdo mais sensível do Kortex — mais do que uma nota de trabalho — o que eleva a prioridade real do item 16 (E2E) mesmo sendo o de maior esforço da lista.
- Nessa mesma linha, **bloqueio adicional por PIN/biometria** (item 12) aparece como padrão em quase todo app da categoria — uma camada de proteção que o Kortex não tem hoje em lugar nenhum, nem para Notas nem para o Diário.

### Fontes consultadas

- [Best Diary App of 2026: Top Journal Apps Compared (Privacy, Features, Price)](https://blog.journey.cloud/best-diary-app-2026/)
- [Day One vs Journey: An Honest Comparison (2026)](https://bestjournalingapps.com/blog/day-one-vs-journey/)
- [Day One vs Diarium — Reflection.app](https://www.reflection.app/best-journaling-apps-compared/day-one-vs-diarium)
- [Journey vs Diarium — Reflection.app](https://www.reflection.app/best-journaling-apps-compared/journey-vs-diarium)
- [Best Diary Apps 2026: Honest Comparison & Reviews — Hello Diary](https://www.hellodeardiary.com/guides/best-diary-app-2026.html)
- [Daylio App Review 2026 — Choosing Therapy](https://www.choosingtherapy.com/daylio-app-review/)
- [Daylio Review 2026 — Calmevo](https://calmevo.com/daylio-review/)
- [Daylio Journal — App Store](https://apps.apple.com/us/app/daylio-journal-daily-diary/id1194023242)
- [9 Best AI Journaling Apps in 2026 — My Life Note](https://blog.mylifenote.ai/the-8-best-ai-journaling-apps-in-2026/)
- [The 7 Best AI Journaling Apps in 2026, Tested — Mindsera](https://mindsera.com/articles/the-7-best-ai-journaling-apps-in-2026-tested)
- [AI Journaling Apps Compared: Reflection vs Rosebud vs Mindsera 2026](https://www.reflection.app/blog/ai-journaling-apps-compared)
- [The 6 Best AI Journaling Apps for Mental Wellness (2026) — Rosebud](https://www.rosebud.app/blog/top-6-ai-journaling-app-for-mental-wellness)
- [Obsidian Daily Notes: Setup, Settings, Templates & Workflow — Obsibrain](https://www.obsibrain.com/blog/obsidian-daily-notes-documentation)
- [Obsidian Periodic Notes — GitHub (liamcain/obsidian-periodic-notes)](https://github.com/liamcain/obsidian-periodic-notes)
- [How I use Obsidian to journal — JDHeyburn](https://jdheyburn.co.uk/blog/how-i-use-obsidian-to-journal/)
