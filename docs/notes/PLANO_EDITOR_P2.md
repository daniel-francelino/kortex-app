# Plano — 8 melhorias P2 do editor e da tela de Notas

Este documento detalha as 8 melhorias "P2 — Recursos de 'editor maduro'" listadas em `docs/ANALISE_EDITOR_MERCADO.md`:

9. **Embeds nativos** (YouTube, Figma, X)
10. **Capa da nota** (banner no topo)
11. **Editar tipo/tags depois de criada**
12. **Arrastar itens de lista e linhas de tabela individualmente**
13. **Busca local (Ctrl+F) dentro do documento**
14. **Notas de voz com transcrição automática**
15. **Gerenciamento em massa de tags/propriedades**
16. **Web clipper**

Nenhuma foi implementada ainda. Este lote é o mais heterogêneo dos três planos já escritos (`docs/PLANO_EDITOR_P0.md`, já implementado; `docs/PLANO_EDITOR_P1.md`, ainda não) — tem desde conexões triviais (item 11, parcialmente já resolvido) até uma decisão de produto que este documento não pode tomar sozinho (item 14, provedor de transcrição) e um projeto que **não vive neste repositório** (item 16, extensão de navegador). Cada parte deixa claro o nível de certeza da estimativa.

---

## 0. Ordem recomendada

**Sugestão: 11 → 10 → 13 → 9 → 15 → 12 → 14 → 16**, agrupando por dependência e por quanto a estimativa é sólida:

1. **Item 11** quase não é trabalho novo — metade já está pronta (tipo já é editável hoje; falta só montar o `NotePropertiesPanel.vue`, que **é exatamente parte do desenho revisado em `docs/notes/PLANO_TABELA_CONTEUDO.md`** — o botão "Propriedades" descrito lá). Resolver isso primeiro também destrava o item 15.
2. **Item 10** (capa) é pequeno e autocontido — uma coluna nova + reaproveita o upload de imagem já existente.
3. **Item 13** (busca local) é self-contained dentro do editor, sem schema novo, mas com uma peça de engenharia real (plugin de decorações do ProseMirror).
4. **Item 9** (embeds) é backend pequeno + um nó novo, mas depende de decisões de segurança (que domínios liberar em iframe) que valem revisão antes de ir pra produção.
5. **Item 15** (gestão em massa de tags) depende do item 11 estar pronto (o `TagManager.vue` citado no item 11 é a base sobre a qual isso é construído).
6. **Item 12** (arrastar item de lista/linha de tabela) tem duas metades independentes: a parte de **lista** é literalmente o trabalho já deixado "fora de escopo" na Parte 5.4 de `docs/PLANO_EDITOR_P1.md` (drag-and-drop de blocos aninhados) — **não pode começar antes daquilo**; a parte de **tabela** é um mecanismo à parte, pode andar em paralelo.
7. **Item 14** (notas de voz) é o item com menos certeza técnica de todos — depende de uma escolha de provedor de transcrição que tem implicações de custo recorrente, e por isso é o único que sugiro **validar com o usuário antes de estimar esforço final**.
8. **Item 16** (web clipper) é, na prática, um **projeto separado** (extensão de navegador, ciclo de review de loja própria) — fica por último porque não compete pelos mesmos arquivos/atenção dos outros sete, não porque seja necessariamente o mais difícil.

---

## PARTE 11 — Editar tipo/tags depois de criada

### Estado atual (parcialmente já resolvido)

- **Tipo**: já é editável a qualquer momento — `NoteEditor.vue` tem um seletor de tipo no cabeçalho (`editType`, `typeMenuItems`, função `setType()`) desde antes deste plano. Nada a fazer aqui.
- **Tags**: `app/components/notes/NotePropertiesPanel.vue` já existe, completo, com edição de tags (autocomplete + criação inline), tipo e visualização de backlinks — mas **não está montado em nenhuma tela**.

### O que falta é exatamente o botão "Propriedades" de `docs/notes/PLANO_TABELA_CONTEUDO.md`

Esse documento (que revisou e substituiu a antiga Parte 7 de `docs/PLANO_EDITOR_P1.md`) já projeta um botão dedicado "Propriedades" no cabeçalho da nota, abrindo o painel lateral com `<NotesNotePropertiesPanel>` — **é** a solução deste item 11. Não faz sentido duplicar a especificação aqui; a referência é a seção 3.2 daquele documento (`NotePropertiesPanel.vue` monta com os props `note`, `tags`, `note-type-options`, `update-note` que a página já tem disponíveis).

**Critérios de aceite:** ver `docs/notes/PLANO_TABELA_CONTEUDO.md`, seção 5.

**Riscos:** nenhum além do que já está descrito lá — este item não adiciona superfície nova.

---

## PARTE 10 — Capa da nota

### 10.1 Schema

```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS cover_image_url text NULL;
ALTER TABLE notes ADD COLUMN IF NOT EXISTS cover_position integer NOT NULL DEFAULT 50;
```

`cover_position` guarda o deslocamento vertical da imagem dentro do banner (0–100, tipo `background-position-y` em `%`) — permite reposicionar sem reenviar o arquivo, mesma ideia do Notion. Se quiser simplificar a v1, dá pra cortar esse campo e sempre centralizar (`object-position: center`), adicionando o reposicionamento depois.

### 10.2 Backend

- `server/api/notes/[id].put.ts`: aceitar `coverImageUrl?: string | null` e `coverPosition?: number` no `bodySchema`, gravar em `updateData`.
- `app/types/notes.ts`: `Note.coverImageUrl: string | null`, `Note.coverPosition: number`, `UpdateNotePayload.coverImageUrl?: string | null`, `UpdateNotePayload.coverPosition?: number`.
- Upload do arquivo: **reaproveitar `POST /api/editor/uploads`** (`kind: 'image'`) que já existe e já valida tipo/tamanho — a capa não precisa de um endpoint de upload próprio, só de outro lugar na UI que chama o mesmo endpoint e grava a URL retornada em `coverImageUrl` via `updateNote`, em vez de inserir um bloco de imagem no conteúdo.
- Limpeza de arquivo órfão ao trocar/remover a capa: mesma lógica de "arquivo removido do documento é apagado do storage depois de 30s" já documentada para imagens no corpo da nota (`docs/MODULO_NOTAS.md`, seção 4.10) — ao trocar `coverImageUrl`, chamar `POST /api/editor/uploads/delete` para a URL antiga.

### 10.3 UI

- `NoteEditor.vue`: banner no topo do editor, acima do cabeçalho de ícone/título — visível só quando `coverImageUrl` existe. Altura fixa (ex. 200px), `background-size: cover`, `background-position-y: ${coverPosition}%`.
- Botão "Adicionar capa" (aparece só quando não há capa, próximo aos botões existentes de ícone/tipo) e, quando já existe, um botão discreto sobre a própria imagem (aparece no hover) com opções "Reposicionar" (arrasta verticalmente, atualiza `coverPosition` em tempo real) / "Trocar" / "Remover".
- Reposicionar: arrastar o mouse verticalmente sobre a imagem ajusta `coverPosition` (`mousedown` + `mousemove` + `mouseup`, salva via `updateNote` só no `mouseup`, não a cada pixel).

**Critérios de aceite:** adicionar, trocar, reposicionar e remover uma capa persistem corretamente; arquivo antigo é limpo do storage ao trocar/remover.

**Riscos:** baixo. Isolado, reaproveita infraestrutura de upload já validada.

---

## PARTE 9 — Embeds nativos (YouTube, Figma, X)

### 9.1 Abordagem: detectar o provedor pela URL, não oEmbed genérico

Em vez de implementar o protocolo oEmbed completo (que exige uma chamada de rede extra por provedor e trata cada resposta de forma diferente), a abordagem mais previsível é **reconhecer o provedor pelo padrão da URL** e montar a URL de embed diretamente:

| Provedor | Padrão de URL reconhecido | URL de embed |
| --- | --- | --- |
| YouTube | `youtube.com/watch?v=`, `youtu.be/` | `https://www.youtube.com/embed/<id>` |
| Figma | `figma.com/file/`, `figma.com/design/` | `https://www.figma.com/embed?embed_host=kortex&url=<url original>` |
| X / Twitter | `x.com/*/status/`, `twitter.com/*/status/` | `https://platform.twitter.com/embed/Tweet.html?id=<id>` |

> ⚠️ **Nota de confiança**: YouTube e Figma têm endpoints de iframe **oficialmente documentados e estáveis**. O endpoint de embed do X (`platform.twitter.com/embed/Tweet.html`) é o que o próprio botão "Embed" do X gera por trás dos panos, mas não é tão formalmente documentado quanto os outros dois — vale validar na prática antes de confiar 100% nele; se não funcionar bem, a alternativa é cair para o preview de link genérico (`LinkPreviewNode`) só para X, mantendo YouTube/Figma como embed de verdade.

### 9.2 Novo nó `embed`

```ts
export const EmbedNode = TiptapNode.create({
  name: 'embed',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      url: { default: '' },
      provider: { default: '' }, // 'youtube' | 'figma' | 'x'
      embedUrl: { default: '' }
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="embed"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'embed',
      'data-provider': node.attrs.provider
    }), [
      'iframe',
      {
        src: node.attrs.embedUrl,
        frameborder: '0',
        allowfullscreen: 'true',
        loading: 'lazy'
      }
    ]]
  }
})
```

Adicionar `'embed'` a `BLOCK_ID_TYPES`, registrar em `createNotionEditorExtensions()`.

### 9.3 Detecção automática + inserção

- **Colar uma URL reconhecida** numa linha vazia (mesmo padrão de "colar link crua vira preview" que provavelmente já é natural de implementar junto do `LinkPreviewNode` — se esse comportamento de auto-detecção ao colar ainda não existe para links genéricos, este é o momento de decidir se os dois nascem juntos ou se o embed só é acessível via o menu "/").
- Item novo no menu "/" (grupo "Mídia", ao lado de "Preview de link"): "Incorporar" — abre um campo de URL, detecta o provedor client-side (função pura `detectEmbedProvider(url): { provider, embedUrl } | null`, sem chamada de rede — é só regex sobre a URL), insere o nó `embed` já com `embedUrl` resolvido. Se a URL não bater com nenhum provedor reconhecido, cai para o comportamento de "Preview de link" (`LinkPreviewNode`) em vez de mostrar um erro.

### 9.4 Segurança do iframe

- `sandbox` no `<iframe>` (`allow-scripts allow-same-origin allow-popups`) — restringe o que o conteúdo embutido pode fazer, mesmo confiando nos 3 domínios (YouTube, Figma, X são third-party mesmo sendo confiáveis, mais restrição nunca é desperdício aqui).
- Content-Security-Policy do app: se o projeto já define uma CSP (`nuxt.config.ts` ou middleware) que restringe `frame-src`, vai ser necessário adicionar `youtube.com`, `figma.com` e `platform.twitter.com`/`twitter.com` à allowlist — vale conferir isso antes de considerar a feature pronta, porque sem isso os iframes simplesmente não carregam (silenciosamente, o que é confuso de debugar).

**Critérios de aceite:** colar/inserir uma URL do YouTube, Figma ou X renderiza o conteúdo embutido (vídeo tocável, arquivo Figma navegável, tweet renderizado); uma URL não reconhecida cai para o preview de link genérico em vez de dar erro.

**Riscos:** médio. A parte de código é pequena; o risco real é de terceiros (mudança de política de embed de alguma das 3 plataformas, ou CSP bloqueando silenciosamente) — não é um risco de implementação, é um risco de manutenção contínua.

---

## PARTE 13 — Busca local (Ctrl+F) dentro do documento

### 13.1 Extensão de busca (ProseMirror plugin)

O Tiptap não vem com busca embutida — a abordagem padrão da comunidade é uma extensão com um `ProseMirror Plugin` que mantém o estado da busca e desenha `Decoration`s (marcações inline) sobre os trechos encontrados, sem alterar o documento:

```ts
interface SearchPluginState {
  query: string
  results: { from: number, to: number }[]
  activeIndex: number
}

export const SearchExtension = Extension.create({
  name: 'search',

  addStorage() {
    return { query: '', results: [] as { from: number, to: number }[], activeIndex: -1 }
  },

  addCommands() {
    return {
      setSearchQuery: (query: string) => ({ editor }) => {
        // percorre editor.state.doc.descendants(), coleta os offsets de
        // texto que dão match (case-insensitive), grava em storage,
        // dispara uma transação vazia (tr.setMeta) só pra re-renderizar decorations
      },
      nextSearchResult: () => ({ editor }) => { /* avança activeIndex, scrollIntoView */ },
      previousSearchResult: () => ({ editor }) => { /* idem, sentido contrário */ },
      clearSearch: () => ({ editor }) => { /* reseta storage, remove decorations */ }
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('search'),
        props: {
          decorations: (state) => {
            const { results, activeIndex } = this.storage
            return DecorationSet.create(state.doc, results.map((r, i) =>
              Decoration.inline(r.from, r.to, {
                class: i === activeIndex ? 'kortex-search-match kortex-search-match--active' : 'kortex-search-match'
              })
            ))
          }
        }
      })
    ]
  }
})
```

Registrar em `createNotionEditorExtensions()`.

### 13.2 Barra de busca flutuante

- Novo componente `app/components/editor/EditorSearchBar.vue`: input de texto + contador "3 de 12" + botões anterior/próximo/fechar, posicionado fixo no canto superior direito da área do editor (`Teleport to="body"`, mesmo padrão de posicionamento já usado em `EditorBubbleMenu.vue`/`EditorBlockMenu.vue`).
- `NotionStyleEditor.vue`: `Ctrl+F`/`Cmd+F` capturado via `handleKeyDown` do `editorProps` (já existe um handler ali, `handleWikiKeyDown`) **só quando o editor está focado** — se o editor não estiver focado, não interceptar (deixar o Ctrl+F padrão do navegador agir normalmente em outras partes da tela). `preventDefault()` e abre a barra.
- Digitar no input chama `editor.commands.setSearchQuery(valor)` com debounce leve (~150ms); Enter avança para o próximo resultado; Shift+Enter volta; Esc fecha a barra e limpa a busca.
- CSS: `.kortex-search-match { background: <amarelo translúcido> }`, `.kortex-search-match--active { background: <laranja mais forte> }`.

### 13.3 Fora de escopo

- **Substituir (replace)** — o pedido original é só "busca", não "buscar e substituir"; adicionar replace depois é uma extensão natural do mesmo plugin (mais um comando `replaceActiveResult`), não uma reescrita.
- Busca com regex/case-sensitive — busca simples (contém, case-insensitive) cobre a grande maioria dos casos de uso reais de uma nota.

**Critérios de aceite:** Ctrl+F com o editor focado abre a barra; digitar destaca todas as ocorrências e navega entre elas; Esc fecha e remove os destaques; Ctrl+F fora do editor (ex. com o cursor na busca global da sidebar) não é interceptado.

**Riscos:** médio. A parte de decorações é um padrão bem estabelecido no ecossistema Tiptap/ProseMirror, mas é código novo que ninguém mais no projeto escreveu ainda — vale testar em notas grandes (performance de recalcular decorations a cada tecla).

---

## PARTE 15 — Gerenciamento em massa de tags/propriedades

Duas frentes distintas, ambas fazendo parte do pedido: **gerenciar as tags em si** (mesclar, renomear, excluir várias) e **aplicar/remover tags de várias notas de uma vez**.

### 15.1 Mesclar tags duplicadas

Cenário comum: o usuário criou `#react` e `#reactjs` sem perceber que já existiam as duas. Mesclar significa: reatribuir todos os `note_tag_links` da tag de origem para a de destino, depois excluir a de origem.

- Novo endpoint `POST /api/notes/tags/[id]/merge` — corpo `{ targetTagId: string }`:
  ```sql
  -- Reatribui vínculos que não colidem com um vínculo já existente na tag de destino
  UPDATE note_tag_links SET tag_id = :targetTagId
  WHERE tag_id = :sourceTagId
    AND note_id NOT IN (SELECT note_id FROM note_tag_links WHERE tag_id = :targetTagId);
  -- Descarta os que colidiriam (a nota já tem a tag de destino)
  DELETE FROM note_tag_links WHERE tag_id = :sourceTagId;
  DELETE FROM note_tags WHERE id = :sourceTagId AND user_id = :userId;
  ```
  (as duas primeiras consultas evitam violar a chave primária composta `(note_id, tag_id)` de `note_tag_links` quando uma nota já tem as duas tags.)
- UI em `TagManager.vue`: ação "Mesclar com..." no menu de cada tag, abrindo um seletor da tag de destino.

### 15.2 Seleção múltipla + exclusão em lote (no `TagManager.vue`)

- Checkbox por linha + "Excluir selecionadas" (com confirmação mostrando quantas notas serão afetadas, no mesmo espírito da confirmação de excluir pasta).

### 15.3 Aplicar/remover tag em várias notas de uma vez

Isso vive na **lista de notas**, não no gerenciador de tags — precisa de seleção múltipla que `NotesList.vue` não tem hoje:

- `NotesList.vue`: modo de seleção múltipla (checkbox por nota, ativado por um botão "Selecionar" na toolbar ou por Ctrl/Cmd+clique nas linhas — o segundo é mais natural, mas também mais trabalho de lidar com range-select via Shift+clique; a v1 pode ficar só com Ctrl/Cmd+clique togglando e deixar range-select como refinamento futuro).
- Barra de ações contextuais quando há seleção ativa: "Adicionar tag", "Remover tag", "Mover para pasta" (esse já existe individualmente via drag-and-drop — em lote é novo), "Excluir" (em lote, indo para a lixeira se `docs/PLANO_EDITOR_P1.md` Parte 8 já estiver implementada).
- Backend: não precisa de endpoint novo por si só — um loop client-side chamando `updateNote(id, { tagIds: [...] })`/`deleteNote(id)` para cada nota selecionada é suficiente na v1 (o padrão otimista já faz cada chamada parecer instantânea); um endpoint de bulk-update dedicado (`PATCH /api/notes/bulk`) só vale a pena se a seleção em massa ficar lenta na prática com muitas notas de uma vez — não vale construir isso preventivamente.

**Critérios de aceite:** mesclar duas tags combina os vínculos sem duplicar nem perder notas; excluir várias tags de uma vez funciona com confirmação; selecionar várias notas na lista e aplicar uma tag reflete em todas.

**Riscos:** médio. A mesclagem de tags é a parte mais delicada (a lógica de "não duplicar vínculo" precisa estar certa); a seleção múltipla em `NotesList.vue` é a peça de UI mais trabalhosa, por mexer num componente já denso (drag-and-drop, edição inline, menus de contexto já convivendo ali).

---

## PARTE 12 — Arrastar itens de lista e linhas de tabela individualmente

### 12.1 Itens de lista — depende da Parte 5 de `docs/PLANO_EDITOR_P1.md`

Isto **é** o trabalho que a Parte 5.4 daquele plano já identificou e deixou explicitamente fora de escopo: *"Arrastar (drag-and-drop) um bloco aninhado pelo mouse... generalizar o arraste para qualquer profundidade é um projeto à parte."* Não faz sentido replanejar aqui — a pré-condição é a Parte 5.1 (resolução de bloco por profundidade arbitrária) estar pronta; a partir dali, o trabalho específico deste item é:

- Generalizar `onBlockDragStart`/os indicadores de drop (`dropIndicatorY`, `dropColumnIndicator`, etc., em `NotionStyleEditor.vue`) para operarem sobre `activeBlock.parent`/`indexInParent` (já existentes depois da Parte 5.1) em vez de assumirem a raiz do documento.
- Validar que o tipo de bloco arrastado é aceito pelo `content` model do container de destino antes de permitir o drop (ex.: não faz sentido soltar uma tabela dentro de um `taskItem` sem querer, mesmo que tecnicamente o schema permita) — checagem simples via `parentNodeType.contentMatch.matchType(draggedNodeType)`.

### 12.2 Linhas de tabela — mecanismo à parte

Tabelas no Tiptap (`@tiptap/extension-table`) não têm reordenação de linha por arraste nativa na versão open-source (isso existe na oferta paga, Tiptap Pro — vale considerar comprar em vez de construir, se o orçamento permitir, já que é exatamente esse o tipo de feature que a Tiptap Pro vende pronta). Construindo na mão:

- Uma "alça" pequena (ícone de grip) à esquerda de cada linha, exibida no hover — via decoração de widget do ProseMirror (`Decoration.widget`) posicionada no início de cada `tableRow`, não uma NodeView (mais simples de manter para algo que só precisa aparecer/desaparecer no hover).
- Arraste solta a linha entre duas outras: operação é um `tr.delete` da linha de origem + `tr.insert` na posição de destino, dentro do range da própria tabela (mesma lógica de "mover dentro do pai" da Parte 5.3 do plano P1, mas aplicada especificamente ao `content` do `table`, que é uma lista de `tableRow`).
- Não deixar arrastar a linha de cabeçalho (se `Table.configure` tiver header habilitado) para uma posição que não seja a primeira.

**Critérios de aceite:** arrastar um item de lista (incluindo dentro de uma sublista) reordena corretamente sem sair do container; arrastar uma linha de tabela reordena as linhas sem corromper a estrutura da tabela.

**Riscos:** alto para a parte de lista (herda o risco da Parte 5 do plano P1, que já é "alto" por si só); médio para tabela (mecanismo isolado, mas é código de manipulação de ProseMirror escrito do zero, sem um exemplo já existente no projeto pra copiar o padrão).

---

## PARTE 14 — Notas de voz com transcrição automática

### 14.1 Decisão de produto que este documento não resolve sozinho

Transcrição de áudio precisa de um provedor — e isso é uma decisão de custo recorrente (cobrança por minuto de áudio), não só uma escolha técnica. Três caminhos, com trade-offs bem diferentes:

| Opção | Como funciona | Trade-off |
| --- | --- | --- |
| **API de nuvem** (ex. OpenAI Whisper API, Deepgram, AssemblyAI) | Upload do áudio, API transcreve, custo por minuto | Mais simples de integrar, mais preciso, mas custo recorrente por uso e dependência de um provedor externo novo (nenhum destes está integrado ao projeto hoje) |
| **Self-hosted** (ex. `whisper.cpp` rodando num worker/serviço à parte) | Servidor próprio roda o modelo | Sem custo por chamada, mas exige infraestrutura de execução (Nitro/Vercel serverless não é o lugar certo para rodar um modelo de transcrição — precisaria de um serviço separado) |
| **Transcrição no navegador** (Web Speech API) | `SpeechRecognition` nativo do navegador, sem servidor | Grátis e sem infra nova, mas qualidade/suporte de navegador inconsistente (funciona bem no Chrome, mal ou nada em outros) e não funciona offline |

**Recomendação para uma v1**: API de nuvem (Whisper API da OpenAI é a opção mais madura e barata do mercado no momento) — é a que menos trabalho de infraestrutura nova exige, com o trade-off sendo custo por uso, que dá pra monitorar. Mas **essa escolha deveria ser confirmada com o usuário antes de estimar o esforço final desta parte**, já que muda o desenho do endpoint (ex. self-hosted precisaria de um serviço novo fora do Nitro/Vercel).

### 14.2 Desenho assumindo API de nuvem (Whisper API)

- **Gravação**: novo item no menu "/" (grupo "Mídia"): "Nota de voz" — usa `MediaRecorder` (API nativa do navegador) para gravar áudio (`audio/webm` na maioria dos navegadores), com um indicador visual de gravação (tempo decorrido, botão parar).
- **Upload**: reaproveitar `POST /api/editor/uploads`, adicionando `'audio'` como um `kind` novo (`ALLOWED_AUDIO_TYPES = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'])`, mesmo padrão de allowlist já usado para imagem).
- **Transcrição**: novo endpoint `server/api/editor/transcribe.post.ts` — recebe o caminho do arquivo já enviado (ou o arquivo direto, multipart), chama a API do provedor escolhido, retorna o texto.
- **Bloco de nota de voz**: novo nó `voiceNote` (`atom: true`, attrs `audioUrl`, `duration`, `transcript`, `transcribing: boolean`) — renderiza um player de áudio (`<audio controls>`) + o texto transcrito abaixo (editável como texto normal depois de inserido, ou como parte fixa do bloco — mais simples manter fixo, com um botão "Inserir como texto" que copia o transcript pra um parágrafo normal logo abaixo, deixando o bloco de voz só como o player + transcript de referência).
- Enquanto a transcrição está em andamento, o bloco mostra um estado de carregamento (`transcribing: true`) — a chamada à API de transcrição não deveria bloquear a UI; o upload do áudio e a inserção do bloco acontecem primeiro (otimista, mesmo padrão do resto do app), a transcrição chega depois e atualiza o atributo `transcript` do nó via `updateAttributes` quando a resposta voltar.

### 14.3 Fora de escopo

- Transcrição em outros idiomas além de português/inglês (Whisper já suporta multilíngue nativamente, mas testar/documentar isso é um passo à parte).
- Edição de áudio (cortar, remover silêncio) — grava, transcreve, ponto.

**Critérios de aceite:** gravar uma nota de voz, ver o player inserido imediatamente (antes mesmo da transcrição terminar), ver o texto transcrito aparecer quando pronto, reproduzir o áudio depois de salvar/recarregar a nota.

**Riscos:** alto, e majoritariamente **fora do controle da implementação em si** — depende de uma chave de API de terceiro configurada, de custo recorrente sendo aceitável, e de gravação de áudio funcionar de forma consistente entre navegadores/dispositivos (mobile é historicamente mais capenga com `MediaRecorder`).

---

## PARTE 16 — Web clipper

### 16.1 Isto não é uma feature do Nuxt app — é um segundo projeto

Um web clipper é uma **extensão de navegador** (Chrome/Firefox, via Manifest V3), com seu próprio ciclo de build, empacotamento e (se for publicada nas lojas) revisão por terceiros — não é um componente Vue nem uma rota Nuxt. Este documento cobre o desenho de alto nível e o que precisa existir **deste lado** (API); o projeto da extensão em si mereceria seu próprio repositório/plano quando for a hora de construir de verdade.

### 16.2 O que precisa existir no backend deste projeto

- Novo endpoint `POST /api/notes/clip` — autenticado (a extensão guardaria um token de sessão ou, mais realisticamente, um **API token de longa duração** específico para a extensão, já que cookies de sessão do navegador normal não são acessíveis a uma extensão de outro contexto de forma direta — isso implica um mecanismo de autenticação novo, tipo "gerar um token de acesso pessoal" nas configurações da conta, que **não existe hoje** no projeto).
- Corpo: `{ url, title, contentHtml, selectionText? }` — a extensão captura a página (ou a seleção do usuário) e manda o HTML bruto; o backend converte esse HTML pra o formato de documento Tiptap (parsing HTML→ProseMirium já é algo que o próprio Tiptap sabe fazer no lado do cliente via `generateJSON`, mas rodar isso no **servidor** exigiria uma dependência de DOM parsing tipo `jsdom`, já que o Nitro roda em Node sem DOM nativo — outra peça de infraestrutura nova).
- Cria a nota já com `type: 'research'` (ou um tipo dedicado a "clipado da web", se fizer sentido adicionar um `NoteType` novo) e o conteúdo convertido.

### 16.3 Autenticação por API token — pré-requisito real

Nenhum mecanismo de API token de longa duração existe hoje no projeto (a autenticação é toda por cookie de sessão, ver `server/utils/require-auth.ts`) — isso precisaria ser construído **antes** do endpoint de clipping fazer sentido de verdade:

- Nova tabela `personal_access_tokens` (`id, user_id, token_hash, name, created_at, last_used_at, expires_at`).
- Tela em Configurações: "Gerar token de acesso" (mostra o token **uma única vez** na criação, como GitHub/Vercel fazem).
- `requireAuthUser` (ou uma variante) passa a aceitar `Authorization: Bearer <token>` além do cookie de sessão.

### 16.4 Fora de escopo

- Publicar a extensão nas lojas (Chrome Web Store, Firefox Add-ons) — processo de revisão externo, tempo fora do controle do time.
- Suporte a Safari (WebExtensions no Safari tem particularidades próprias de empacotamento via Xcode).

**Critérios de aceite (só da parte que vive neste repositório):** um token de acesso pessoal pode ser gerado e usado para autenticar; `POST /api/notes/clip` cria uma nota a partir de HTML bruto com formatação razoável preservada (títulos, parágrafos, links, imagens).

**Riscos:** alto, mas de um jeito diferente dos outros itens — não é risco de "o código vai ficar errado", é risco de **escopo**: a lista de pré-requisitos (autenticação por token, parsing de HTML no servidor, a extensão em si) é grande o suficiente para este item merecer ser tratado como iniciativa própria, não uma linha de um roadmap de editor.

---

# Checklist geral de rollout

- [ ] Parte 11 — Editar tipo/tags (= botão "Propriedades" de `docs/notes/PLANO_TABELA_CONTEUDO.md`)
- [ ] Parte 10 — Capa da nota
- [ ] Parte 13 — Busca local (Ctrl+F)
- [ ] Parte 9 — Embeds nativos (YouTube, Figma, X)
- [ ] Parte 15.1–15.2 — Mesclar/excluir tags em lote
- [ ] Parte 15.3 — Seleção múltipla de notas + aplicar tag em lote
- [ ] Parte 12.1 — Arrastar item de lista (depende da Parte 5 de `PLANO_EDITOR_P1.md`)
- [ ] Parte 12.2 — Arrastar linha de tabela
- [ ] Parte 14 — Notas de voz (decisão de provedor pendente — validar com o usuário antes de estimar)
- [ ] Parte 16 — Web clipper (projeto separado — token de acesso pessoal é pré-requisito)

---

# Plano de testes manuais

**Nada deste lote foi implementado ainda** — nenhum dos passos abaixo pode ser rodado hoje. Esta seção existe pra já deixar pronto o roteiro de validação de cada parte, no momento em que ela for construída (evita ter que parar a implementação pra pensar em como testar). Atualize o `[ ]`/`[x]` de cada teste conforme forem implementados e passando.

## Teste 11 — Editar tipo/tags

*(é a mesma feature do botão "Propriedades" de `docs/notes/PLANO_TABELA_CONTEUDO.md` — se aquele documento já tiver seu plano de testes rodado quando esta parte for implementada, use aquele em vez de duplicar aqui.)*

1. Abra uma nota, clique no botão "Propriedades" no cabeçalho para abrir o painel lateral.
2. Troque o tipo da nota (ex. de "Nota" para "Ideia") — **esperado:** ícone muda no breadcrumb e na lista, sem precisar salvar manualmente.
3. Adicione uma tag nova digitando o nome e confirmando a criação inline.
4. Adicione uma tag já existente via autocomplete.
5. Remova uma tag.
6. Recarregue a nota — **esperado:** tipo e tags persistem exatamente como deixados.
7. Confirme que a lista de backlinks aparece nesse mesmo painel (se estiver no escopo da implementação).

## Teste 10 — Capa da nota

1. Numa nota sem capa, clique em **"Adicionar capa"** — **esperado:** abre o seletor de imagem (mesmo fluxo de upload de imagem já usado no corpo da nota).
2. Envie uma imagem — **esperado:** banner aparece no topo da nota, acima do ícone/título.
3. Passe o mouse sobre a capa — **esperado:** aparecem opções "Reposicionar" / "Trocar" / "Remover".
4. Arraste verticalmente em "Reposicionar" — **esperado:** a imagem se desloca dentro do banner em tempo real; solte o mouse e confirme que a posição fica salva.
5. Clique em "Trocar", envie outra imagem — **esperado:** capa antiga é substituída.
6. Depois de trocar, confira no bucket de storage (ou aguarde ~30s e confira via admin) que o arquivo antigo foi removido (limpeza de órfão).
7. Clique em "Remover" — **esperado:** banner some, botão "Adicionar capa" volta a aparecer.
8. Recarregue a nota após cada uma dessas ações — confirme que o estado persiste.

## Teste 13 — Busca local (Ctrl+F)

1. Abra uma nota com bastante texto repetido (ex. a palavra "nota" várias vezes).
2. Clique dentro do editor (com foco nele) e pressione `Ctrl+F` (ou `Cmd+F` no Mac).
3. **Esperado:** abre uma barra de busca flutuante no canto superior direito da área do editor — **não** a busca nativa do navegador.
4. Digite um termo que aparece várias vezes — **esperado:** todas as ocorrências ficam destacadas, contador mostra algo como "1 de N".
5. Pressione Enter várias vezes / clique em "próximo" — **esperado:** navega entre as ocorrências, a atual com destaque diferente (mais forte) das demais.
6. Pressione Shift+Enter / "anterior" — **esperado:** volta na ordem.
7. Pressione Esc — **esperado:** barra fecha e os destaques somem.
8. Clique **fora** do editor (ex. no campo de busca da sidebar) e pressione Ctrl+F — **esperado:** abre a busca **nativa do navegador**, não a barra do editor (o atalho só deve ser interceptado com o editor focado).

## Teste 9 — Embeds nativos

1. Digite `/` → **"Incorporar"**, cole uma URL de vídeo do YouTube (`youtube.com/watch?v=...` ou `youtu.be/...`).
2. **Esperado:** insere um player de vídeo tocável, não um card de preview genérico.
3. Repita com uma URL de arquivo Figma (`figma.com/file/...` ou `figma.com/design/...`).
4. **Esperado:** insere um iframe navegável do arquivo Figma.
5. Repita com uma URL de post do X/Twitter (`x.com/*/status/...`).
6. **Esperado (com ressalva do próprio plano):** insere o tweet embutido; se esse provedor especificamente não funcionar bem, confirmar que cai pro preview de link genérico em vez de mostrar erro/quebrar.
7. Repita com uma URL qualquer não reconhecida (ex. um site de notícias).
8. **Esperado:** cai para o comportamento de "Preview de link" normal, sem erro.
9. Salve e recarregue a nota — confirme que os embeds continuam carregando (checar também se não há erro de CSP no console do navegador — F12).

## Teste 15 — Gestão em massa de tags/propriedades

**15.1/15.2 — no gerenciador de tags:**
1. Crie duas tags parecidas por engano (ex. `#react` e `#reactjs`), aplique cada uma em notas diferentes.
2. No gerenciador de tags, use "Mesclar com..." para mesclar `#reactjs` em `#react`.
3. **Esperado:** todas as notas que tinham `#reactjs` agora têm `#react`; nenhuma nota fica com a tag duplicada; `#reactjs` deixa de existir.
4. Selecione várias tags (checkbox) e use "Excluir selecionadas" — **esperado:** confirmação mostrando quantas notas serão afetadas; ao confirmar, as tags somem de todas as notas.

**15.3 — na lista de notas:**
1. Use Ctrl/Cmd+clique para selecionar 3+ notas na lista.
2. **Esperado:** aparece uma barra de ações contextuais (Adicionar tag / Remover tag / Mover para pasta / Excluir).
3. Use "Adicionar tag" com uma tag existente — **esperado:** todas as notas selecionadas ganham a tag.
4. Use "Excluir" em lote — **esperado:** todas vão para a Lixeira (assumindo que `PLANO_EDITOR_P1.md` Parte 8 já esteja no ar, o que já é o caso).

## Teste 12 — Arrastar item de lista / linha de tabela

**12.1 — item de lista:**
1. Crie uma lista com 4 itens, incluindo uma sublista dentro de um deles.
2. Arraste um item pelo meio da lista (não pelo botão "mover para cima/baixo", pelo gesto de arrastar mesmo) — **esperado:** reordena dentro da lista, sem sair dela nem corromper os outros itens.
3. Arraste um item da sublista — **esperado:** reordena só dentro da sublista.

**12.2 — linha de tabela:**
1. Crie uma tabela 4×3 com cabeçalho, preencha com texto diferente em cada linha.
2. Passe o mouse à esquerda de uma linha (não cabeçalho) — **esperado:** aparece uma alça de arrastar.
3. Arraste essa linha para outra posição — **esperado:** reordena mantendo o conteúdo de cada célula íntegro.
4. Tente arrastar a linha de cabeçalho para o meio da tabela — **esperado:** não permite (cabeçalho só pode ficar na primeira posição).

## Teste 14 — Notas de voz com transcrição

1. Digite `/` → **"Nota de voz"** — **esperado:** inicia gravação, mostra tempo decorrido e botão de parar.
2. Grave ~10 segundos falando algo claro, pare a gravação.
3. **Esperado:** o player de áudio aparece **imediatamente** no bloco, antes da transcrição terminar (estado "transcrevendo...").
4. Aguarde a transcrição — **esperado:** o texto transcrito aparece abaixo do player, condizente com o que foi falado.
5. Reproduza o áudio pelo player — confirme que toca corretamente.
6. Salve e recarregue a nota — confirme que o áudio ainda reproduz e a transcrição continua lá.
7. Teste em pelo menos dois navegadores/dispositivos diferentes (o plano já sinaliza `MediaRecorder` como inconsistente, principalmente em mobile).

## Teste 16 — Web clipper

1. Em Configurações, gere um "Token de acesso pessoal" — **esperado:** o token só é mostrado uma vez, na criação.
2. Usando esse token (via extensão publicada, ou simulando a chamada com `curl`/Postman contra `POST /api/notes/clip`), envie uma página web capturada (`url`, `title`, `contentHtml`).
3. **Esperado:** cria uma nota nova com título, tipo `research` (ou o tipo dedicado, se criado) e conteúdo convertido preservando títulos/parágrafos/links/imagens razoavelmente.
4. Teste com uma seleção parcial de texto (`selectionText`) em vez da página inteira — **esperado:** nota criada só com aquele trecho.
5. Revogue o token nas Configurações e repita a chamada — **esperado:** `401`, a nota não é criada.

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, e qualquer erro no console do navegador ou toast.
