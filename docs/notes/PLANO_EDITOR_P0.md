# Plano — 4 melhorias P0 do editor (Notas)

**Status: ✅ implementado.** Este documento detalha a implementação das 4 melhorias "P0 — vitórias rápidas, alto impacto visível" listadas em `docs/ANALISE_EDITOR_MERCADO.md`:

1. **Realce de sintaxe no bloco de código**
2. **Cor de texto + destaque (highlight)**
3. **Copiar link para o bloco**
4. **Duplicar nota inteira**

As 4 são independentes entre si (dá pra implementar em qualquer ordem ou em paralelo), com uma exceção: a Parte 3 (copiar link do bloco) depende de um pré-requisito que a análise original não previu — ver seção 3.0. O texto abaixo permanece como documento de especificação/histórico da implementação; o estado atual resultante está descrito em `docs/notes/1.NOTES.md` (seções 4.1, 4.3, 4.6) e `docs/notes/ANALISE_EDITOR_MERCADO.md`.

---

## 0. Ordem recomendada

**Sugestão: Parte 4 → Parte 2 → Parte 1 → Parte 3, da mais contida para a que tem uma dependência oculta.**

- **Parte 4 (duplicar nota)** é puro backend + composable + item de menu, reaproveitando código já existente e testado (`createNote` otimista) — zero dependências novas, risco mais baixo do lote.
- **Parte 2 (cor/destaque)** é aditiva (3 extensões novas do Tiptap, mesma mecânica de "mark" que negrito/itálico já usam) e contida na bubble menu.
- **Parte 1 (realce de sintaxe)** troca uma extensão e adiciona uma NodeView visual — não toca em dado nenhum existente, mas é a mais trabalhosa de UI das três primeiras.
- **Parte 3 (copiar link do bloco)**, ao investigar, descobri que depende de as notas terem uma URL própria — coisa que hoje não existe (`docs/1.NOTES.md`, seção 1: "não é possível compartilhar um link direto para uma nota"). Por isso ela é a última e a única com um sub-passo de pré-requisito (3.0) antes da feature em si (3.1).



---

## PARTE 1 — Realce de sintaxe no bloco de código

### 1.1 Dependências

```
pnpm add @tiptap/extension-code-block-lowlight lowlight
```

Usar a mesma faixa de versão do restante do Tiptap já instalado (`@tiptap/core` está em `^3.25`, outras extensões em `^3.25`/`^3.26` — ver `package.json`) para `@tiptap/extension-code-block-lowlight`. `lowlight` é um pacote à parte (não é `@tiptap/*`), sem essa amarração de versão.

### 1.2 Trocar a extensão

Em `app/composables/useNotionEditor.ts`, dentro de `createNotionEditorExtensions()` (linha ~689):

- Desabilitar o `codeBlock` do `StarterKit`: `StarterKit.configure({ heading: {...}, link: false, underline: false, codeBlock: false })` — mesmo padrão já usado ali para `link`/`underline`, que são desligados no StarterKit e reconfigurados à parte.
- Adicionar `CodeBlockLowlight.configure({ lowlight })`, com:
  ```ts
  import { createLowlight, common } from 'lowlight'
  const lowlight = createLowlight(common)
  ```
  Usar o conjunto `common` (~35 linguagens mais usadas), não o `all` — mantém o bundle menor.
- `BLOCK_ID_TYPES` (linha ~243) já inclui `'codeBlock'` — nada muda ali, o novo node continua se chamando `codeBlock`.

### 1.3 Seletor de linguagem no bloco

A extensão sozinha aplica o realce mas não desenha nenhuma UI para trocar a linguagem — isso precisa de uma NodeView customizada, seguindo o mesmo padrão já usado em `app/components/editor/nodes/EditorImageNodeView.vue` e `EditorColumnNodeView.vue`:

- Novo arquivo `app/components/editor/nodes/EditorCodeBlockNodeView.vue`: usa `NodeViewWrapper` (`@tiptap/vue-3`), mostra um dropdown pequeno no canto superior direito do bloco — visível no hover ou quando `props.editor.isEditable` (mesmo padrão de `props.editor.isEditable` já usado em `EditorImageNodeView.vue`).
  - Lista curada de ~15 linguagens (JavaScript, TypeScript, Python, JSON, Bash, SQL, HTML, CSS, Markdown, Go, Rust, Java, C, YAML, Plain text) em vez de expor as ~35 do `common` inteiro — mais rápido de navegar, cobre a grande maioria dos casos reais.
  - `props.node.attrs.language` é o atributo que a extensão já expõe nativamente; a NodeView só chama `props.updateAttributes({ language: novoValor })` ao trocar a seleção.
- Registrar a NodeView customizada em vez da extensão pura:
  ```ts
  CodeBlockLowlight
    .extend({ addNodeView: () => VueNodeViewRenderer(EditorCodeBlockNodeView) })
    .configure({ lowlight })
  ```

### 1.4 Estilos

- Precisa de cores por tipo de token (`hljs-keyword`, `hljs-string`, `hljs-comment`, etc. — é essa a convenção de classe que o `lowlight`/`highlight.js` gera). Mais simples definir essas classes direto no bloco `<style>` de `NotionStyleEditor.vue` (onde já vivem as regras `.kortex-editor-content .tiptap...`), usando as cores do tema escuro do produto, do que importar um tema CSS pronto do `highlight.js` que não bate com o design system.

**Critérios de aceite:** colar um trecho de código JS/Python/JSON num bloco de código mostra tokens coloridos; trocar a linguagem no seletor realça corretamente; salvar e recarregar a nota preserva a linguagem escolhida (é só um atributo do nó, dentro do `content` já existente — não precisa de migração de schema).

**Riscos:** baixo. É a troca de uma extensão mais uma NodeView visual — não toca em nenhum dado já salvo. Único ponto de atenção: tamanho de bundle (tokenizers do highlight.js) — usar o subset `common` em vez de `all` mantém isso sob controle.

---

## PARTE 2 — Cor de texto e destaque (highlight)

### 2.1 Dependências

```
pnpm add @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-text-style
```

### 2.2 Extensões

Em `createNotionEditorExtensions()` (`app/composables/useNotionEditor.ts`), adicionar à lista:

```ts
TextStyle,
Color,
Highlight.configure({ multicolor: true }),
```

`Color` depende de `TextStyle` estar registrada — é assim que o Tiptap aplica `style="color: ..."` num `<span>` de marca (padrão da própria extensão, não uma escolha deste projeto).

### 2.3 UI na bubble menu

Em `app/components/editor/EditorBubbleMenu.vue`:

- Adicionar um terceiro valor a `type BubbleView` (hoje `'toolbar' | 'link' | 'turninto'`) — algo como `'color'` — seguindo o mesmo padrão de troca de `view.value` já usado para `'link'`/`'turninto'` (botão de voltar, `@mousedown.prevent` no container pra não perder a seleção de texto).
- Dois botões novos na view `'toolbar'` (grupo dos marks, ao lado de negrito/itálico/sublinhado): um pra cor de texto (ícone tipo "A" com uma barra colorida embaixo) e um pra destaque (ícone de marcador `i-lucide-highlighter`), cada um abrindo a view `'color'` com uma paleta fixa de ~9 cores (padrão Notion: cinza, marrom, laranja, amarelo, verde, azul, roxo, rosa, vermelho — mais uma opção "Padrão" que limpa a cor).
  - Cor de texto: `editor.chain().focus().setColor(hex).run()` / `.unsetColor()` para "Padrão".
  - Destaque: `editor.chain().focus().toggleHighlight({ color: hex }).run()` / `.unsetHighlight()`.
- "Limpar formatação" (já existe, `clearFormatting()` → `unsetAllMarks()`) já cobre cor e destaque automaticamente, por serem marks — nenhuma mudança necessária ali.

**Critérios de aceite:** selecionar texto, aplicar cor e destaque (separadamente e em conjunto) — ambos persistem ao salvar/recarregar a nota; "Limpar formatação" remove os dois.

**Riscos:** baixo — é aditivo, mesma mecânica de marks que negrito/itálico/tachado já usam nesse mesmo componente.

---

## PARTE 3 — Copiar link para o bloco

### 3.0 Pré-requisito descoberto: notas não têm URL própria hoje

A análise original (`docs/ANALISE_EDITOR_MERCADO.md`) descreve esta feature como "a infraestrutura (`blockId`) já existe, só falta a ação de UI + copiar `${url}#block-${id}`" — ao investigar o código antes de escrever este plano, encontrei uma lacuna que essa frase não considerou: `app/pages/app/notes/index.vue` mantém a nota selecionada só em estado local (`selectedNoteId`), e a URL da página é sempre `/app/notes`, sem refletir qual nota está aberta (documentado como limitação conhecida em `docs/1.NOTES.md`, seção 1). Um link `${url}#block-${blockId}` copiado hoje aponta só para a página de notas em geral — colado numa aba nova, não abre a nota certa nem rola até o bloco.

Por isso, para a feature ser realmente funcional (não só "copiar algo pra clipboard"), ela precisa de um passo a mais que a estimativa original de esforço não incluiu: sincronizar a nota selecionada com a URL via query param (`?note=<id>`), sem trocar de rota nem exigir SSR.

**O que muda em `app/pages/app/notes/index.vue`:**

- No boot da página: se `route.query.note` existir e apontar para uma nota válida, usar isso para inicializar `selectedNoteId` em vez de começar sem seleção.
- No `watch(selectedNoteId, ...)` que já existe (dispara `loadCurrentNoteDetail`), também chamar `router.replace({ query: { ...route.query, note: id ?? undefined } })` — `replace`, não `push`, pra não empilhar uma entrada de histórico do navegador por nota selecionada (o histórico de navegação entre notas já é resolvido à parte pelo `noteHistory`/`historyIndex` internos da página, descritos em `docs/1.NOTES.md`).
- Se a URL também tiver um hash (`#block-<blockId>`) no boot: depois do conteúdo da nota carregar, rolar até `document.getElementById('block-' + blockId)` — o `id="block-<blockId>"` já é renderizado automaticamente pelo `BlockIdExtension` (`app/composables/useNotionEditor.ts`), só falta o passo de rolagem.

**Critérios de aceite do pré-requisito:** abrir `/app/notes?note=<id>` **recarregando a página do zero** (não só navegando dentro da SPA) carrega direto naquela nota; trocar de nota pela UI atualiza a URL sem recarregar a página nem duplicar entradas no histórico do navegador a cada clique.

**Riscos do pré-requisito:** médio — mexe no comportamento de navegação de uma página que já tem sua própria pilha de histórico (`goBack`/`goForward`, `canGoBack`/`canGoForward`); vale um teste manual de regressão nesse fluxo antes de considerar pronto, garantindo que a sincronização de query param não conflita com os botões de avançar/voltar já existentes.

### 3.1 Ação "Copiar link do bloco"

- `app/components/editor/EditorBlockMenu.vue` já declara `'copy-link': []` no `defineEmits`, mas não existe nenhum item de menu que dispare esse evento — é infraestrutura morta hoje. Adicionar um item "Copiar link do bloco" (ícone `i-lucide-link`) no mesmo grupo de "Duplicar"/"Copiar texto" do menu de contexto da alça de arraste.
- `app/components/editor/NotionStyleEditor.vue`: ouvir `@copy-link="copyActiveBlockLink"` (mesmo padrão de `duplicateActiveBlock`/`copyActiveBlockText`, já existentes nesse arquivo), implementando algo como:
  ```ts
  function copyActiveBlockLink() {
    const block = activeBlock.value
    const blockId = block?.node.attrs.blockId
    if (!blockId) return
    const url = `${window.location.origin}${window.location.pathname}?note=${props.currentNoteId}#block-${blockId}`
    void copyToClipboard(url)
  }
  ```
  Reaproveita o `copyToClipboard` (`useClipboard`) já importado nesse componente para "Copiar texto".
- Toast de confirmação ("Link copiado") — mesmo padrão de feedback já usado em outros pontos do produto (ex. o botão de copiar link em `NoteShareDialog.vue`).

**Critérios de aceite:** clicar em "Copiar link do bloco" copia uma URL que, colada numa aba nova (mesmo usuário logado), abre a nota certa e rola até o bloco correto.

**Riscos:** baixo para a ação em si (pouco código, reaproveita padrões existentes) — o risco real desta parte já foi coberto no pré-requisito (3.0).

---

## PARTE 4 — Duplicar nota inteira

### 4.1 Backend: aceitar `icon` na criação

Hoje `POST /api/notes` (`server/api/notes/index.post.ts`) não aceita `icon` no corpo da criação — só é possível definir depois, via `PUT`. Para duplicar preservando o emoji da nota original numa única chamada:

- `server/api/notes/index.post.ts`: adicionar `icon: z.string().nullable().optional()` ao `bodySchema`, e `icon: payload.icon ?? null` no `.insert()`.
- `app/types/notes.ts`: adicionar `icon?: string | null` a `CreateNotePayload`.

> Alternativa mais simples, sem tocar no backend: criar a cópia sem ícone e disparar um `updateNote(id, { icon })` logo em seguida (dois requests em vez de um). A opção acima é preferível por ser uma única operação otimista, mas essa alternativa é válida se for preciso reduzir ainda mais o escopo desta parte.

### 4.2 Composable: `duplicateNote`

Nova função em `app/composables/useNotes.ts`:

```ts
async function duplicateNote(note: Note): Promise<Note | null> {
  // A listagem não traz `content` (só o detalhe traz) — busca antes se faltar.
  const detail = note.content != null ? note : await fetchNoteDetail(note.id)
  if (!detail) return null

  return createNote({
    title: `${detail.title} (cópia)`,
    content: detail.content ?? undefined,
    type: detail.type,
    icon: detail.icon,
    tagIds: 'tags' in detail ? detail.tags?.map(t => t.id) : undefined,
    folderId: detail.folderId
  })
}
```

Reaproveita o `createNote` otimista que já existe (cria com id temporário, aparece na lista instantaneamente, reconcilia com o id real do servidor ao final) — nenhuma mudança no padrão otimista é necessária, é só compor uma chamada já existente e testada.

> Nota de tipos: `Note` (o tipo usado nas listagens) não declara `content` como sempre presente — na prática, um objeto vindo da lista terá `content: undefined`. Vale considerar tipar o parâmetro de `duplicateNote` como `Note | NoteDetail` explicitamente em vez de checar `'tags' in detail` por duck-typing, se isso deixar o código mais claro na hora de implementar.

### 4.3 UI: item de menu "Duplicar"

- `app/components/notes/NotesList.vue`: em `noteActionItems(note)` (já tem Renomear/Fixar/Excluir), adicionar `{ label: 'Duplicar', icon: 'i-lucide-copy-plus', onSelect: () => emit('duplicate', note) }`, e declarar `'duplicate': [note: Note]` no `defineEmits` do componente.
- `app/pages/app/notes/index.vue`: `@duplicate="onDuplicateNote"` na `<NotesList>`, com um handler:
  ```ts
  async function onDuplicateNote(note: Note) {
    const created = await duplicateNote(note)
    if (created) void navigateTo(created.id)
  }
  ```
  (reaproveita o `navigateTo` local que a página já usa para abrir notas recém-criadas em outros fluxos).

**Critérios de aceite:** duplicar uma nota com tags, ícone e conteúdo cria uma segunda nota idêntica (exceto o título, que ganha o sufixo " (cópia)") na mesma pasta; a tela navega automaticamente para a cópia recém-criada.

**Riscos:** baixo — compõe funcionalidade já existente e testada (`createNote`, `fetchNoteDetail`), sem schema novo.

---

# Checklist geral de rollout

- [x] Parte 4 — Duplicar nota inteira
- [x] Parte 2 — Cor de texto e destaque
- [x] Parte 1 — Realce de sintaxe no bloco de código
- [x] Parte 3.0 — Pré-requisito: nota selecionada refletida na URL
- [x] Parte 3.1 — Copiar link do bloco

---

# Plano de testes manuais

As 4 partes já estão implementadas — os passos abaixo testam o app de verdade, em `/app/notes`. Rode um teste por vez, na ordem, marcando o que passou.

## Teste 1 — Realce de sintaxe (Parte 1)

1. Abra ou crie uma nota. Digite `/` → selecione **"Bloco de código"**.
2. Cole este trecho de JavaScript:
   ```
   function soma(a, b) {
     return a + b; // comentário
   }
   ```
3. **Esperado:** `function`/`return` em roxo, o comentário em cinza/itálico, sem tudo em uma cor só.
4. Passe o mouse sobre o bloco — **esperado:** aparece um seletor de linguagem no canto superior direito.
5. Troque para **Python**, apague o trecho e cole:
   ```
   def soma(a, b):
       return a + b  # comentário
   ```
   **Esperado:** realce recalcula para a sintaxe Python.
6. Aguarde o indicador de salvamento mudar para "Salvo" (ou espere ~60s) e recarregue a página (F5).
7. **Esperado:** o bloco ainda mostra Python selecionado no seletor e mantém o realce.

## Teste 2 — Cor de texto e destaque (Parte 2)

1. Selecione um trecho de texto num parágrafo qualquer.
2. Na bubble menu flutuante, clique no ícone **"A"** (cor do texto).
3. **Esperado:** abre uma paleta com 9 bolinhas coloridas + uma opção "Padrão" (X) — **cada bolinha precisa mostrar a cor de verdade**, não todas cinza/transparentes.
4. Clique em **Azul** — **esperado:** o texto selecionado fica azul.
5. Selecione outro trecho, clique no ícone de **marcador** (destaque), escolha **Amarelo**.
6. **Esperado:** o fundo do texto fica destacado em amarelo.
7. Selecione um trecho com cor E destaque juntos, clique em **"Limpar formatação"** (ícone de borracha).
8. **Esperado:** cor e destaque somem os dois.
9. Recarregue a página — **esperado:** cor e destaque aplicados no passo 4/6 continuam lá.

## Teste 3 — Copiar link do bloco (Parte 3)

1. Com uma nota aberta, passe o mouse sobre um bloco (parágrafo/título) — **esperado:** aparece a alça (⠿) à esquerda.
2. Clique na alça → **"Copiar link do bloco"**.
3. **Esperado:** toast "Link copiado".
4. Confira que a URL da página mudou para `.../app/notes?note=<algum-id>` (sem `#`, a URL da página em si).
5. Abra uma aba anônima (ou outro navegador) **logado na mesma conta**, cole o link copiado e dê Enter (carregamento do zero, não colar dentro do app).
6. **Esperado:** abre direto na nota certa **e** rola/destaca até o bloco copiado, sem toast de erro.
7. Na mesma aba nova, clique em outra nota na barra lateral, depois use o botão "Voltar" do navegador várias vezes.
8. **Esperado:** não deveria acumular uma entrada de histórico por troca de nota dentro do app (não é esse o mecanismo de avançar/voltar — isso é feito pelos botões próprios de avançar/voltar da página, não pelo do navegador).

## Teste 4 — Duplicar nota (Parte 4)

1. Crie uma nota com título, ícone (emoji, pelo cabeçalho), algum conteúdo e pelo menos uma tag (se a UI de tags estiver acessível) — se não houver como definir tag pela UI hoje, pule essa parte específica.
2. Clique com o botão direito na nota (na lista) → **"Duplicar"**.
3. **Esperado:** aparece uma segunda nota chamada "<título original> (cópia)", com o mesmo ícone, mesmo conteúdo, na mesma pasta.
4. **Esperado:** a tela navega automaticamente para a cópia recém-criada.

**Se algum teste falhar:** anote em qual passo exatamente e a mensagem de erro (se houver toast) — isso acelera muito o diagnóstico.
