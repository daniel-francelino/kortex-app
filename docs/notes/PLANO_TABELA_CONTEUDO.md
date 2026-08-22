# Plano — Tabela de conteúdo (Sumário) do editor

Este documento substitui a especificação da **Parte 7** de `docs/PLANO_EDITOR_P1.md` — não porque a peça técnica estivesse errada (o `outline` computado, o `blockId` nos headings, o mecanismo de scroll, tudo isso continua valendo), mas porque o desenho original tinha um problema de raiz: foi montado em cima de **nomes de variáveis mortas que já existiam no código** (`rightTab: 'properties' | 'outline'`) em vez de partir de "quando isso ajuda alguém usando o app". O resultado seria tecnicamente funcional, mas sem muito sentido de uso — um painel lateral com abas que ninguém pediu combinadas, sem gatilho claro pra abrir, sem indicar em que parte do documento você está.

Este documento repensa a feature do zero, mantendo o que já é reaproveitável do plano original, e é a referência a seguir quando a Parte 7 for implementada (`docs/PLANO_EDITOR_P1.md` foi atualizado pra apontar pra cá).

> **Status**: implementado. `outline` (com `blockId`) agora vive em `app/pages/app/notes/index.vue`, os botões "Sumário"/"Propriedades" foram adicionados ao cabeçalho de `NoteEditor.vue`, o painel lateral (`NoteOutlinePanel.vue` novo + `NotePropertiesPanel.vue` já existente, unificados via `NoteRightPanelBody.vue`) abre em `index.vue` — como painel fixo à direita em telas largas e como `UDrawer` (bottom sheet) abaixo de `1023px`. Realce de seção via `IntersectionObserver` e destaque temporário no clique (`kortex-block-flash`, `app/assets/css/main.css`) também implementados. **Não testado visualmente ainda** (nenhum `pnpm dev` foi rodado) — use o "Plano de testes manuais" abaixo pra validar antes de considerar pronto.

---

## 1. Por que o desenho original não funciona bem

Reconstruindo o raciocínio do plano anterior: alguém, em algum momento, começou a construir "um painel lateral direito com abas Propriedades/Sumário" — sobrou `rightTab = ref<'properties' | 'outline'>(...)`, um `outline` computado e um `onPropertiesUpdated()`, mas o painel em si nunca foi montado. A Parte 7 original pegou essas sobras e propôs "terminar o que já tinha começado". Isso é razoável do ponto de vista de "não deixar código morto no projeto", mas carrega três problemas que só aparecem quando se pensa em uso real:

1. **Duas features sem relação são forçadas a compartilhar um painel.** "Propriedades" (editar tipo, tags, ver datas e backlinks) é uma tarefa de **edição de metadados**. "Sumário" (navegar entre seções de uma nota longa) é uma tarefa de **leitura/orientação**. Não há motivo de uso pra elas ficarem atrás da mesma aba — são acionadas em momentos diferentes, por motivos diferentes. A única razão pra estarem juntas hoje é que uma variável `rightTab` com dois valores já existia.
2. **Nenhum gatilho de abertura foi pensado.** O plano original nunca diz *como* o painel aparece — fica implícito que "existe e pronto", sempre visível, roubando espaço horizontal do editor mesmo quando a nota é curta e não tem nenhum título. Pra uma nota de 3 linhas sem heading nenhum, isso é um painel vazio ocupando espaço à toa.
3. **Sumário estático não comunica "onde eu estou".** O plano original só resolve clique → scroll. Isso é metade do valor de uma tabela de conteúdo — a outra metade (e a que mais aparece em Notion, Google Docs, VitePress, GitBook) é o sumário **acompanhar o scroll**, destacando em qual seção o cursor de leitura está agora. Sem isso, é só uma lista de links, não uma "tabela de conteúdo" de verdade.

---

## 2. Pra quem isso serve, e quando

O sumário só tem valor pra notas **longas o suficiente pra perder o fio** — os tipos de nota do próprio produto já sugerem isso: "Pesquisa" e "Nota de livro" tendem a ser mais compridas que "Ideia". Uma nota curta (a maioria, provavelmente) não ganha nada com isso.

Consequência direta de desenho: **o sumário não deveria aparecer/ocupar espaço por padrão em toda nota** — ele deveria estar disponível sob demanda, e o próprio botão de abrir já deveria sinalizar se vale a pena abrir (nota sem heading = sumário não tem o que mostrar).

---

## 3. Decisões de UX (e o porquê de cada uma)

### 3.1 Gatilho: botão dedicado no cabeçalho, não uma aba escondida num painel

Novo botão **"Sumário"** (ícone `i-lucide-list`) na mesma barra do cabeçalho onde já vivem os botões de ícone/tipo da nota (`NoteEditor.vue`) — ao lado do botão de compartilhar. Clicar abre/fecha um painel à direita.

- **Se a nota tem 0 ou 1 heading**, o botão fica **desabilitado** (`disabled`, com tooltip "Adicione títulos (H1/H2/H3) para gerar um sumário") em vez de abrir um painel vazio. Um sumário de um item só não ajuda ninguém a se orientar.
- Isso resolve de fábrica o problema do "estado vazio" do plano original: se não há nada útil pra mostrar, o usuário nem chega a abrir o painel.

### 3.2 Painel separado de "Propriedades" — dois botões, duas responsabilidades

Em vez de abas dentro de um painel único chamado genericamente "painel lateral direito", **dois botões independentes no cabeçalho**, cada um abrindo seu próprio conteúdo na mesma faixa lateral (podem compartilhar o mecanismo de layout — largura, animação de abrir/fechar — sem compartilhar a decisão de "qual aba está ativa"):

- **"Sumário"** (`i-lucide-list`) → `NoteOutlinePanel.vue`.
- **"Propriedades"** (`i-lucide-sliders-horizontal` ou similar) → `NotePropertiesPanel.vue` (já existe, pronto — isso resolve de brinde o item 11 de `docs/PLANO_EDITOR_P2.md` e a limitação "edição de tags não conectada à UI" de `docs/1.NOTES.md`).

Clicar num dos dois botões abre o painel já naquele conteúdo — nunca "abre o painel e o usuário precisa descobrir que tem abas". Se os dois botões forem clicados em sequência, o painel troca de conteúdo sem fechar (não são dois painéis empilhados, é a mesma faixa lateral trocando o que mostra) — tecnicamente ainda existe um `rightPanelView: 'outline' | 'properties' | null` internamente, a diferença é que **a entrada é por dois botões com propósito claro**, não por abas genéricas dentro de um painel já aberto.

### 3.3 Realce da seção atual, sincronizado com o scroll

Conforme o usuário rola o conteúdo da nota, o item do sumário correspondente à seção visível no momento fica destacado (cor primária + peso de fonte maior), os demais em tom neutro — mesmo padrão que sumários de documentação (VitePress, GitBook) e editores de texto longo (Google Docs) já consagraram. Sem isso, um sumário é só uma lista de âncoras; com isso, vira uma "localização atual no documento".

Implementação: um `IntersectionObserver` no `NoteOutlinePanel`/`NoteEditor`, observando os elementos `#block-<id>` de cada heading dentro da área de scroll do editor, atualizando um `activeHeadingId` conforme o heading mais próximo do topo visível muda.

### 3.4 Confirmação visual ao clicar (não só o scroll)

Clicar num item do sumário rola suavemente **e** aplica um destaque temporário (~1.2s, ex. um leve fundo `bg-primary/10` que decai) no heading de destino — mesma ideia de feedback já usada em outras partes do produto para "algo aconteceu aqui". Sem isso, numa nota grande, o scroll pode terminar num ponto ambíguo (título parecido, seção repetida) e o usuário fica sem certeza se clicou no lugar certo.

### 3.5 Persistência: lembrar se estava aberto, não forçar uma aba

Se o usuário abriu o painel de Sumário e navega para outra nota, o painel **continua aberto** (mostrando o sumário da nota nova, ou o estado desabilitado se ela não tiver headings) — não fecha sozinho a cada troca de nota. Usa o mesmo padrão já usado pra `sidebarWidth` (`useStorage`), com uma chave nova (`notes-right-panel-open` + `notes-right-panel-view`), mas sem preservar entre dispositivos (é preferência de sessão, não dado da nota).

### 3.6 Responsivo: painel lateral fixo não faz sentido em mobile

O projeto empacota pra Android/iOS via Capacitor (`cap:add:android`/`cap:add:ios` no `package.json`) — um painel de largura fixa ao lado do editor é inviável numa tela de celular. Abaixo de um breakpoint, os botões "Sumário"/"Propriedades" abrem um **bottom sheet** (`UDrawer`, já disponível no `@nuxt/ui` instalado — confirmado, primeiro uso no projeto) em vez do painel lateral fixo.

**Implementado com**: `useMediaQuery('(max-width: 1023px)')` — o projeto não tem um breakpoint "oficial" único (cada tela declara sua própria media query em px; `app.vue` usa `1023px`, componentes de Hábitos usam `767px`), então foi escolhido `1023px` por ser o mesmo usado pelo layout `app.vue` pra alternar entre shell desktop/mobile — é a decisão de responsividade mais "global" já estabelecida no projeto, mais próxima em espírito de uma troca de layout de página do que de um componente isolado.

### 3.7 Texto longo trunca com tooltip

Headings muito compridos truncam (`truncate`) na lista do sumário, com o texto completo disponível via `UTooltip` no hover — mesmo padrão já usado nos títulos de nota em `NotesList.vue`.

---

## 4. O que muda na especificação técnica original (Parte 7 de `PLANO_EDITOR_P1.md`)

O que **continua igual** (a parte técnica já estava certa):

- `outline` computado extraindo `{ level, text, blockId }` dos headings via `BLOCK_ID_TYPES` (`app/composables/useNotionEditor.ts`) — sem mudança.
- `NoteOutlinePanel.vue` como componente novo, lista indentada por `level`.
- Clique num item reaproveita o mesmo mecanismo de scroll da Parte 3 de `docs/PLANO_EDITOR_P0.md` (copiar link do bloco).
- `NotePropertiesPanel.vue` montado como está, sem mudança nele mesmo.

O que **muda**:

| Original (Parte 7) | Revisado (este documento) |
| --- | --- |
| `rightTab` decide qual aba mostrar dentro de um painel sempre presente | Dois botões no cabeçalho (`NoteEditor.vue`), cada um abre o painel no conteúdo correspondente |
| Painel visível/tentando renderizar mesmo sem headings | Botão "Sumário" desabilitado quando a nota tem <2 headings — painel vazio nunca aparece |
| Sumário estático (só clique → scroll) | Sumário com realce de seção atual via `IntersectionObserver`, sincronizado ao scroll |
| Clique só rola | Clique rola **e** destaca brevemente o heading de destino |
| Painel lateral fixo em qualquer tela | Vira bottom sheet abaixo do breakpoint mobile |
| Estado de abertura não especificado | Persistido via `useStorage` (`notes-right-panel-open`), sobrevive à troca de nota |

### Novos itens de implementação (que o plano original não previa)

- **Botões no cabeçalho** (`NoteEditor.vue`): "Sumário" (`i-lucide-list`, `disabled` quando `outline.length < 2`, com `UTooltip` explicando o motivo quando desabilitado) e "Propriedades" (`i-lucide-sliders-horizontal`), ambos ao lado do botão de compartilhar já existente.
- **`activeHeadingId`**: novo estado (em `index.vue` ou dentro do próprio `NoteOutlinePanel.vue`, a decidir na implementação conforme onde o `IntersectionObserver` for anexado — provavelmente precisa viver perto de onde o conteúdo do editor é renderizado, então em `NotionStyleEditor.vue` ou exposto de lá via evento) atualizado pelo `IntersectionObserver`.
- **Highlight temporário no heading de destino**: uma classe CSS (`kortex-block-flash` ou similar) aplicada via JS ao elemento `#block-<id>` no clique, removida depois de ~1.2s (`setTimeout` + `classList.remove`, ou uma transição CSS com `animation` de decaimento).
- **Breakpoint mobile**: detectar via `useMediaQuery` (já disponível pelo VueUse, que o projeto já usa em outros lugares) ou o mesmo mecanismo que o resto do app já usa pra responsividade — confirmar qual convenção o projeto já segue antes de introduzir uma nova.

---

## 5. Critérios de aceite

- Uma nota **sem** headings (ou só 1) mostra o botão "Sumário" desabilitado, com tooltip explicando o motivo — nunca abre um painel vazio.
- Uma nota com 2+ headings: clicar em "Sumário" abre o painel com a lista indentada por nível.
- Rolar o conteúdo da nota destaca, em tempo real, o item do sumário correspondente à seção visível.
- Clicar num item do sumário rola suavemente até o heading **e** aplica um destaque temporário visível nele.
- Clicar em "Propriedades" abre o mesmo painel lateral, agora mostrando `NotePropertiesPanel.vue`, sem depender de o Sumário já ter sido aberto antes.
- Editar tipo/tags na aba Propriedades persiste (via `updateNote` já existente) — mesmo critério do plano original.
- Trocar de nota com o painel de Sumário aberto mantém o painel aberto, atualizando o conteúdo pra nota nova (ou desabilitando o botão, se a nota nova não tiver headings suficientes).
- Em largura de tela mobile, os botões abrem um bottom sheet em vez de espremer o editor com um painel lateral fixo.

## 6. Riscos

**Baixo-médio.** A base técnica (outline computado, `blockId`, `NotePropertiesPanel.vue` pronto) continua de baixo risco, herdada do plano original. O que este documento adiciona — `IntersectionObserver` pra realce de seção e o comportamento responsivo (bottom sheet) — é código novo que ninguém mais no projeto escreveu ainda (o resto do app não tem esse padrão de "sumário que acompanha scroll"), então vale um teste manual específico em notas bem longas (10+ headings) pra confirmar que o observer não causa jank de scroll, e em tela estreita/mobile pra confirmar que o bottom sheet não conflita com o teclado virtual ao editar tags na aba Propriedades.

---

# Plano de testes manuais

O código está implementado — nenhum passo abaixo foi validado visualmente ainda (nenhum `pnpm dev` foi rodado durante a implementação). Rode este roteiro antes de considerar a feature pronta (substitui o "Teste 7" mencionado como pendente em `docs/PLANO_EDITOR_P1.md`).

1. Abra uma nota nova, sem nenhum título (H1/H2/H3) no conteúdo. **Esperado:** botão "Sumário" no cabeçalho aparece desabilitado; passar o mouse mostra um tooltip explicando o motivo.
2. Adicione só 1 título. **Esperado:** botão continua desabilitado (limiar é 2+ para valer a pena).
3. Adicione um 2º título. **Esperado:** botão "Sumário" fica habilitado.
4. Clique em "Sumário". **Esperado:** abre o painel lateral com os 2 títulos listados, indentados conforme o nível (H1/H2/H3).
5. Adicione mais títulos intercalados com bastante texto entre eles (o suficiente pra rolar a tela), volte pro topo da nota.
6. Role o conteúdo lentamente. **Esperado:** o item do sumário correspondente à seção visível na tela muda de destaque conforme você rola, sem esperar você parar de rolar.
7. Clique num item do meio do sumário. **Esperado:** rola suavemente até o título certo **e** o título pisca/destaca brevemente por cerca de 1 segundo.
8. Clique no botão "Propriedades" (separado do "Sumário"). **Esperado:** o mesmo painel lateral troca para mostrar tipo/tags/datas/backlinks, sem precisar fechar e reabrir nada.
9. Troque o tipo da nota e adicione uma tag por ali. **Esperado:** persiste normalmente (mesmo comportamento de hoje).
10. Com o painel de Sumário aberto, troque para outra nota pela barra lateral esquerda. **Esperado:** painel continua aberto, agora mostrando o sumário da nota nova (ou o botão desabilitado, se ela não tiver títulos suficientes).
11. Redimensione a janela (ou abra no celular/emulador) pra uma largura estreita. **Esperado:** os botões abrem um bottom sheet em vez de espremer o editor com um painel lateral fixo.
12. Numa nota com 15+ títulos, role rapidamente do topo ao fim. **Esperado:** sem travamentos perceptíveis, o realce da seção atual acompanha sem atraso visível.

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, e qualquer erro no console do navegador.
