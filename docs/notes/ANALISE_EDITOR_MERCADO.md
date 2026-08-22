# Análise de mercado — Editor de blocos (NotionStyleEditor)

Este documento compara o editor de notas do Kortex (`NotionStyleEditor.vue` + `useNotionEditor.ts`) com o que hoje é padrão em editores de blocos de mercado — principalmente **Notion** (referência direta, já que o editor se propõe "estilo Notion") e **Obsidian** (a outra metade da proposta do módulo, per `docs/MODULO_NOTAS.md`), com menções pontuais a Craft, Coda e Anytype onde têm um recurso que vale a pena copiar.

> Todo item "❌ Faltando" abaixo foi conferido no código antes de entrar aqui (não é suposição) — via leitura de `NotionStyleEditor.vue`, `useNotionEditor.ts` e `package.json`. A lista de blocos/recursos "✅ Já existe" é a mesma documentada em `docs/MODULO_NOTAS.md` (seção 4).

**Escopo**: este roadmap é priorizado pelas necessidades do módulo **Notas**, que é o consumidor principal do editor. Vale registrar que `NotionStyleEditor.vue` é um componente compartilhado — o Diário (`JournalTodayEditor.vue`/`JournalEntryDetailModal.vue`, via o wrapper `NotionEditor.vue`) também o usa. Isso não muda a priorização abaixo (ela continua guiada por Notas), mas significa que melhorias no editor em si (seção 2.1–2.3) tendem a beneficiar o Diário de quebra; já os itens da seção 2.4 (nota como um todo — capa, duplicar, lixeira, tipo/tags) são específicos do app de Notas e não se aplicam a entradas de diário.

---

## 1. O que já existe (baseline)

Blocos: parágrafo, H1–H3, lista com marcadores, lista numerada, lista de tarefas (aninhável), citação, código, divisor, callout, imagem, arquivo, preview de link, colunas (2/3, redimensionáveis), tabela, wikilink `[[...]]`, menção `@`, emoji inline.

Interação: menu "/" agrupado, controles à esquerda (+ / alça) que resolvem o bloco certo em qualquer profundidade (raiz, coluna, item de lista, toggle), drag-and-drop com o mouse e criação de colunas ao soltar na borda (esse gesto continua raiz-only), bubble menu (negrito/itálico/sublinhado/tachado/código/link/cor/destaque/alinhamento/"converter em"), barra de tabela, upload com progresso e limpeza de órfãos, autosave (60s após a última edição), sincronização automática de backlinks a partir de wikilinks/menções.

Isso já é um editor de blocos sólido e cobre o "core loop" de tomar notas. As lacunas abaixo são o que separa isso de um editor no nível do Notion/Obsidian atual.

---

## 2. Lacunas por categoria

### 2.1 Blocos de conteúdo

| Recurso | Status | Nota |
| --- | --- | --- |
| Bloco de código com **realce de sintaxe** | ✅ Implementado (P0) | `@tiptap/extension-code-block-lowlight` + `lowlight` (subset `common`), com NodeView própria (`EditorCodeBlockNodeView.vue`) para o seletor de linguagem. Ver `docs/PLANO_EDITOR_P0.md` (Parte 1). |
| **Toggle list** (bloco recolhível, "▶ clique para expandir") | ✅ Implementado (P1) | `ToggleNode` em `useNotionEditor.ts` + `EditorToggleNodeView.vue` — colapso via CSS (`display:none`), conteúdo preservado no documento; atalho de saída ao apertar Enter num parágrafo vazio no fim do corpo. Ver `docs/PLANO_EDITOR_P1.md` (Parte 6). |
| **Tabela de conteúdo** (auto-gerada a partir dos headings) | ⚠️ Parcial | `index.vue` já calcula um `outline` a partir dos headings do documento — mas é código morto, não renderizado em lugar nenhum (nem como painel lateral, nem como bloco). Dá pra reaproveitar. |
| Fórmulas / equações (inline e bloco, tipo KaTeX) | ❌ Faltando | Comum em editores de conhecimento (Notion, Obsidian, Craft). |
| Embeds nativos (YouTube, Figma, X/Twitter, etc. renderizados inline) | ❌ Faltando | Hoje só existe o "Preview de link" (card com OG image/título/descrição) — não há player de vídeo embutido nem embeds interativos. |
| Bloco sincronizado (editar em um lugar, refletir em vários) | ❌ Faltando | Recurso avançado do Notion; baixa prioridade para um app pessoal. |

### 2.2 Formatação de texto

| Recurso | Status | Nota |
| --- | --- | --- |
| **Cor de texto** | ✅ Implementado (P0) | `@tiptap/extension-color` + `@tiptap/extension-text-style`, aplicada pela bubble menu (paleta de 9 cores). Ver `docs/PLANO_EDITOR_P0.md` (Parte 2). |
| **Cor de destaque (highlight)** | ✅ Implementado (P0) | `@tiptap/extension-highlight` (`multicolor: true`), mesma view/paleta da cor de texto na bubble menu. |
| Cor de fundo do bloco inteiro | ❌ Faltando | O `callout` tem um atributo `tone` no schema, mas não há UI para trocá-lo — nenhum outro bloco aceita cor de fundo. |
| Negrito/itálico/sublinhado/tachado/código/link/alinhar | ✅ Já existe | Cobertos na bubble menu. |
| Atalhos de markdown ao digitar | ⚠️ Parcial | Só os defaults do `StarterKit` (`#`, `-`, `1.`, `>`, `` ``` ``, `---`). Sem atalhos extras (ex.: `**texto**` inline já funciona via StarterKit, mas coisas como `[]`/`[x]` para task list digitado direto não foram configuradas explicitamente). |

### 2.3 Manipulação de blocos

| Recurso | Status | Nota |
| --- | --- | --- |
| Controles (+ / alça) em blocos **aninhados** (dentro de coluna, lista, toggle) | ✅ Implementado (P1) | `resolveActiveBlock`/`resolveActiveBlockAt` em `NotionStyleEditor.vue` resolvem o bloco por profundidade arbitrária (atômicos nunca descem, transparentes sempre descem, item de lista cede prioridade a uma sublista mais funda) — duplicar/excluir/copiar/converter/mover para cima-baixo funcionam em qualquer profundidade. Ver `docs/PLANO_EDITOR_P1.md` (Parte 5). |
| Arrastar bloco **aninhado** pelo mouse (e criar colunas arrastando um bloco aninhado) | ❌ Faltando | Generalizar o gesto de arrastar continua de fora — só o "+"/alça e suas ações (acima) foram generalizados; `reorderBlock`/`getTopLevelBlocks` continuam raiz-only de propósito (ver Parte 5.4 do plano P1). |
| Arrastar **itens de lista individualmente** | ❌ Faltando | Como o reordenamento por mouse ainda opera sobre blocos de nível superior do documento, uma lista inteira é "um bloco" para o drag — não dá para arrastar um item específico de dentro dela (o botão "mover para cima/baixo" já funciona por item, só o gesto de mouse não). |
| Arrastar linhas de **tabela** para reordenar | ❌ Faltando | A `TiptapTableBar` só insere/remove linhas e colunas; não há drag para reordenar. |
| **Copiar link para o bloco** (deep link ancorado) | ✅ Implementado (P0) | Item "Copiar link do bloco" no menu da alça de arraste, copiando `?note=<id>#block-<blockId>`. Exigiu um pré-requisito não previsto originalmente: sincronizar a nota selecionada com a URL (`?note=<id>`) — sem isso o link não abria a nota certa. Ver `docs/PLANO_EDITOR_P0.md` (Parte 3). |
| Duplicar / mover / excluir bloco | ✅ Já existe | No menu da alça de arraste. |

### 2.4 Notas como um todo (fora do editor, mas parte da mesma experiência)

| Recurso | Status | Nota |
| --- | --- | --- |
| **Duplicar nota inteira** ("Fazer uma cópia") | ✅ Implementado (P0) | `duplicateNote()` em `useNotes.ts` (reaproveita `createNote` otimista) + item "Duplicar" no menu de ações de `NotesList.vue`. Ver `docs/PLANO_EDITOR_P0.md` (Parte 4). |
| **Capa da nota** (banner/imagem no topo, como o "cover" do Notion) | ❌ Faltando | `Note` só tem `icon`, sem campo de capa. |
| **Lixeira / exclusão reversível** | ✅ Implementado (P1) | Soft delete (`deleted_at`) em `notes`/`note_folders`, endpoints de restaurar/excluir permanentemente/purgar, view `NotesTrashView.vue`. Ver `docs/PLANO_EDITOR_P1.md` (Parte 8). |
| Editar tipo/tags de uma nota já criada | ❌ Faltando | Documentado em `docs/MODULO_NOTAS.md` — `NotePropertiesPanel.vue`/`TagManager.vue` existem mas não estão conectados a nenhuma tela. |
| Buscar **dentro** do conteúdo aberto (Ctrl+F local, não busca global) | ❌ Faltando | `SearchDialog.vue` busca entre notas, mas não há find/replace dentro do documento atualmente aberto. |
| Histórico de versões / desfazer para uma versão anterior | ❌ Faltando | Só existe undo/redo de sessão (Ctrl+Z via ProseMirror); não há histórico persistido para restaurar uma versão de ontem, por exemplo. |
| IA no editor (continuar escrevendo, resumir, corrigir, traduzir) | ❌ Faltando | Virou tabela-stakes em editores de nota em 2026 (Notion AI, Craft, Coda AI). Maior esforço da lista, mas também o de maior diferencial percebido. |

---

## 3. Roadmap sugerido (por esforço x impacto)

### P0 — Vitórias rápidas, alto impacto visível — ✅ concluído
As 4 melhorias abaixo foram implementadas (especificação e checklist em `docs/PLANO_EDITOR_P0.md`):
1. ✅ **Realce de sintaxe no bloco de código** (`@tiptap/extension-code-block-lowlight` + `lowlight`, com seletor de linguagem no bloco).
2. ✅ **Cor de texto + destaque (highlight)** na bubble menu (`@tiptap/extension-color` + `@tiptap/extension-highlight` + `@tiptap/extension-text-style`).
3. ✅ **"Copiar link para o bloco"** no menu da alça de arraste — incluiu, como pré-requisito não previsto na primeira versão deste documento, sincronizar a nota selecionada com a URL (`?note=<id>`).
4. ✅ **Duplicar nota inteira** — reaproveita o `createNote` otimista já existente.

### P1 — Fecha lacunas estruturais conhecidas
Três das quatro melhorias abaixo foram implementadas (especificação e checklist em `docs/PLANO_EDITOR_P1.md`); falta só o item 7:
5. ✅ **Controles de bloco dentro de colunas/listas/toggle** — "+"/alça e suas ações (duplicar, excluir, copiar, converter, mover) agora resolvem o bloco certo em qualquer profundidade. O gesto de *arrastar* pelo mouse continua raiz-only, de propósito (ver seção 2.3).
6. ✅ **Toggle list** (bloco recolhível).
7. ❌ **Tabela de conteúdo** — reaproveitar o `outline` que já é calculado (hoje é código morto) como um bloco/painel real. Ainda pendente — é o único item do P1 não implementado.
8. ✅ **Lixeira (soft delete)** — sobretudo depois da exclusão em cascata de pastas; sem isso, um erro de clique podia custar muito conteúdo.

### P2 — Recursos de "editor maduro"
9. **Embeds nativos** (YouTube, Figma, X) além do preview de link genérico.
10. **Capa da nota** (banner no topo, complementando o ícone que já existe).
11. **Editar tipo/tags depois de criada** — conectar o `NotePropertiesPanel.vue`/`TagManager.vue` que já existem prontos.
12. **Arrastar itens de lista e linhas de tabela individualmente.**
13. **Busca local (Ctrl+F) dentro do documento aberto.**
14. **Notas de voz com transcrição automática** — grava um áudio, transcreve e insere como texto na nota. Ver seção 6.1.
15. **Gerenciamento em massa de tags/propriedades** (renomear, mesclar, padronizar em lote) — ao conectar o `TagManager.vue` (item 11), já entregar com operações em lote, não só CRUD de uma tag por vez. Ver seção 6.1.
16. **Web clipper** (extensão de navegador para salvar uma página como nota) — ver seção 6.1.

### P3 — Apostas maiores / diferenciação
17. **IA no editor** (continuar escrevendo, resumir, corrigir) — maior esforço, mas o que mais aproxima de Notion AI/Craft em percepção de produto.
18. **IA que responde perguntas com base em todas as suas notas** (busca semântica pessoal, estilo "Ask AI" do Notion) — mais ambicioso que o item 17; ver seção 6.1 sobre por que vale ficar de olho na execução (não só na feature).
19. **Histórico de versões** com restauração.
20. **Fórmulas/equações** (KaTeX).
21. **OCR de texto em imagens** (fotografar uma anotação manuscrita ou quadro branco e virar texto pesquisável) — ver seção 6.1.
22. **Blocos sincronizados** — baixa prioridade, recurso avançado com pouco uso real fora de times grandes.

---

## 4. Compartilhamento e modo offline — promovidos para plano detalhado

As duas primeiras versões deste documento marcavam **compartilhamento público** e **edição offline com sincronização** como "fora de escopo"/observação de rodapé. Isso mudou — ambos foram priorizados e têm especificação completa (modelo de dados, endpoints, decisões de segurança, resolução de conflito) em **[`docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md`](./PLANO_COMPARTILHAMENTO_E_OFFLINE.md)**. Consulte esse documento antes de implementar qualquer um dos dois.

## 5. Fora de escopo (não recomendo perseguir agora)

- **Colaboração em tempo real multiplayer** (cursores de outros usuários, edição simultânea) — o compartilhamento planejado (ver seção 4) cobre acesso multi-usuário, mas não edição simultânea ao vivo com cursores; isso continua fora de escopo por ser um projeto de infraestrutura à parte (WebSockets/CRDT). Ver seção 6.2 — é o recurso nº1 mais pedido da comunidade do Obsidian há anos, então essa decisão vale revisitar se o Kortex ganhar um público que precise colaborar.
- **Banco de dados inline com múltiplas visualizações** (o "database" do Notion, com views de tabela/board/calendário dentro da própria nota) — é essencialmente reconstruir o Notion inteiro; o Kortex já resolve organização via pastas + tags + grafo, que é uma proposta diferente e mais simples.

---

## 6. O que a comunidade pede de Notion e Obsidian (pesquisa)

Levantamento em fóruns oficiais (Obsidian Forum), Reddit (r/Notion, r/ObsidianMD) e reviews recentes, especificamente atrás do que **usuários desses dois produtos pedem e ainda não têm resolvido nativamente** — não é sobre o que Notion/Obsidian já fazem bem (isso já está nas seções 1–2), é sobre onde os dois deixam a desejar segundo quem usa todo dia. Fontes ao final da seção.

### 6.1 Oportunidade real de diferenciação (pedido recorrente, ninguém resolve bem nativamente)

- **Notas de voz com transcrição automática.** Nem Notion nem Obsidian têm isso nativo — no Obsidian só existe via plugins de terceiros (Vox, NeuroVox, Voxtral Transcribe), todos populares o suficiente para sugerir demanda real. A ideia: gravar um áudio dentro da nota e ele virar texto (com opção de manter o áudio original anexado). Já incluído no roadmap (P2, item 14).
- **Gerenciamento em massa de tags/propriedades.** Mesmo padrão — Obsidian só resolve via plugin de terceiros ("Bulk Tag Manager": renomear, mesclar, padronizar maiúsculas/separadores em lote). O Kortex já tem a base de dados de tags pronta (só falta conectar a UI, item já no roadmap P2/11) — vale entregar com operações em lote desde o início, já que é exatamente o que falta nos concorrentes.
- **Busca confiável em bases grandes.** Reclamação recorrente do Notion — buscas ficam visivelmente lentas acima de ~10 mil registros, e a IA "trava" em páginas grandes. O Kortex hoje usa `ilike` simples (limitação já documentada em `docs/MODULO_NOTAS.md`) — não é urgente pelo volume de uso pessoal esperado, mas é um lembrete pra não adiar demais a migração pra full-text search do Postgres (`tsvector`/`pg_trgm`, que o projeto já usa em outro lugar) antes que vire um problema real.
- **IA que busca e responde com base em todas as suas notas** (não só ajuda a escrever). O "Ask AI"/Enterprise Search do Notion existe, mas usuários reclamam que trava/demora em bases grandes. Se o Kortex for atrás disso (item 18 do roadmap), vale aprender com a reclamação alheia: a expectativa é resposta rápida mesmo com centenas de notas — arquitetura de indexação/embeddings importa tanto quanto a feature em si.
- **OCR de texto em imagem / anotação manuscrita.** Nenhum dos dois tem nativo (usuários recorrem a apps externos). Photografar uma página escrita à mão ou um quadro branco e o Kortex extrair o texto pesquisável seria um diferencial genuíno, não só "alcançar" a concorrência.
- **Web clipper.** Aqui a informação mudou o que eu esperava encontrar: o Obsidian **lançou um clipper oficial** (Chrome/Firefox/Safari/Edge) em 2024–2026, com extração de conteúdo de páginas e até exportação de conversas de ChatGPT/Claude direto pra nota — ou seja, isso deixou de ser uma lacuna do Obsidian. Ainda assim, é um recurso que o Kortex não tem, e que combina bem com a proposta do produto ("salvar isso como nota" a partir de qualquer lugar da web).

### 6.2 Pedido antigo, sem solução nativa nos concorrentes — reconhecer, mas não perseguir agora

- **Colaboração em tempo real (multiplayer, cursores ao vivo).** Confirmado como o recurso nº1 mais pedido do fórum do Obsidian por *anos consecutivos*, e apontado como "a razão nº1 pela qual empresas escolhem Notion em vez de Obsidian". Isso é um dado forte, mas não muda a decisão da seção 5 — o Kortex ainda não tem o conceito de "time"/workspace compartilhado que justificaria isso; o compartilhamento planejado (seção 4) já cobre "dar acesso a outra pessoa", só não em tempo real.
- **Suporte a idiomas RTL (direita-pra-esquerda).** Pedido há mais de 2 anos no fórum do Obsidian, nunca entrou no core. Só relevante se surgir demanda real de usuários do Kortex que escrevem em árabe/hebraico — não há sinal disso hoje.

### 6.3 Reclamações que são mais princípio de design do que feature

- **"Notion é complexo demais/curva de aprendizado alta"** — crítica recorrente tanto a Notion quanto a Obsidian (a exigência de entender Markdown, blocos aninhados, etc. assusta gente nova). Reforça a decisão já tomada na seção 5 de **não** perseguir "banco de dados com múltiplas views" — é exatamente esse tipo de poder-mas-complexidade que gera essa reclamação nos concorrentes.
- **"Modo offline do Notion é a maior fraqueza dele"** — uma das fontes chama isso literalmente de o maior ponto fraco do produto. Não é um item novo aqui: é a confirmação mais forte que apareceu na pesquisa de que o plano de offline em `docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md` (seção 2) está mirando no lugar certo.

### Fontes consultadas

- [Notion vs Obsidian: 1 Clear Winner in 7 Tests (2026)](https://tech-insider.org/notion-vs-obsidian-2026/)
- [Obsidian Forum — Feature requests](https://forum.obsidian.md/c/feature-requests/8)
- [Obsidian Sync: Live team collaborative editing (feature request thread)](https://forum.obsidian.md/t/obsidian-sync-live-team-collaborative-editing/6058)
- [Relay — Multiplayer plugin for Obsidian](https://relay.md/)
- [Obsidian Web Clipper — official releases](https://github.com/obsidianmd/obsidian-clipper/releases)
- [Meet Obsidian's Brand New Official Web Clipper — Obsidian Observer](https://medium.com/obsidian-observer/meet-obsidians-brand-new-official-web-clipper-cad02e8d4fb9)
- [Bulk Tag Manager — Obsidian Plugin](https://community.obsidian.md/plugins/bulk-tag-manager)
- [Vox — Obsidian Plugin (transcrição de áudio)](https://github.com/vincentbavitz/obsidian-vox)
- [NeuroVox — Obsidian Plugin](https://www.obsidianstats.com/plugins/neurovox)
- [Why is Notion so slow? — Falconer Guides](https://falconer.com/guides/why-is-notion-slow/)
- [Notion AI review 2026 — eesel AI](https://www.eesel.ai/blog/notion-ai-review)
- [Notion Handwriting/OCR limitations — HandwritingOCR blog](https://www.handwritingocr.com/blog/notion-handwriting-integration)
- [Notion recurring tasks/reminders — Notion Help Center](https://www.notion.com/help/reminders)
