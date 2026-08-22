# Plano — 4 melhorias P1 do editor e da tela de Notas

**Status: 3 de 4 implementadas** (5, 6 e 8 — ver checklist no final do documento). Este documento detalha a implementação das 4 melhorias "P1 — Fecha lacunas estruturais conhecidas" listadas em `docs/ANALISE_EDITOR_MERCADO.md`:

5. ✅ **Controles de bloco dentro de colunas/listas/toggle**
6. ✅ **Toggle list** (bloco recolhível)
7. ❌ **Tabela de conteúdo** — não implementada; a especificação foi **substituída** por `docs/notes/PLANO_TABELA_CONTEUDO.md` (o desenho original aqui embaixo tinha um problema de usabilidade — ver seção 7 abaixo)
8. ✅ **Lixeira (soft delete)**

Diferente do lote P0 (`docs/PLANO_EDITOR_P0.md`, esse sim já implementado), estas quatro são estruturalmente mais pesadas — cada uma toca um mecanismo central do editor ou do backend, não uma extensão isolada. O documento é mais longo por isso. O texto abaixo permanece como especificação/histórico; o estado atual resultante está descrito em `docs/notes/1.NOTES.md` (seções 2.1, 4.1, 4.3, 9, 10) e `docs/notes/ANALISE_EDITOR_MERCADO.md`.

> **Correção de referência**: a análise original (`docs/ANALISE_EDITOR_MERCADO.md`, linha 48/77) cita `docs/NOTES.md` como já tendo documentado o problema dos controles de bloco aninhados — esse arquivo não existe (nunca existiu no histórico do git). A limitação está de fato documentada em `docs/1.NOTES.md`, seção 11: *"Controles de bloco (+/alça) só funcionam em blocos de nível superior"*. Vale corrigir essa referência na análise em algum momento, não é o foco deste documento.

---

## 0. Ordem recomendada

**Sugestão: 7 (Tabela de conteúdo) → 6 (Toggle list) → 8 (Lixeira) → 5 (Controles em blocos aninhados), da mais contida para a mais arriscada.**

- **Item 7** continua sendo o mais barato dos quatro em termos de dado/backend (nenhum schema novo, nenhum endpoint novo — `outline` computado e `NotePropertiesPanel.vue` já existem prontos), mas a especificação de UI foi revisada depois de identificado um problema de usabilidade no desenho original (bundava "Sumário" e "Propriedades" numa aba só só porque uma variável morta já sugeria isso) — ver **[`docs/notes/PLANO_TABELA_CONTEUDO.md`](./PLANO_TABELA_CONTEUDO.md)** para o desenho atual.
- **Item 6** é um nó novo do Tiptap, seguindo o mesmo padrão de nó customizado já usado 4x no projeto (`CalloutNode`, `EditorImageNode`, colunas) — contido, sem tocar em nada existente.
- **Item 8** tem uma superfície grande (schema + ~15 endpoints existentes precisam de um filtro novo + fluxo de UI inteiro novo), mas é mecânica e previsível — o risco é esquecer um endpoint, não a complexidade conceitual.
- **Item 5** é o mais arriscado dos quatro: exige redesenhar como o editor identifica "qual é o bloco atual" (hoje só entende profundidade 1 do documento) e como move blocos dentro de um container que não é a raiz — não é um bug pontual, é uma peça de arquitetura que o editor não tem hoje. Fica por último de propósito.

---

## PARTE 7 — Tabela de conteúdo (especificação movida)

O desenho original desta parte (reaproveitar `rightTab`/`outline` já existentes em `index.vue`, montando um painel de abas "Propriedades"/"Sumário") tinha um problema de usabilidade identificado depois de escrito: bundava duas features sem relação de uso numa aba só, sem gatilho de abertura pensado, sem realce de qual seção o usuário está lendo, e sem considerar tela estreita/mobile.

A especificação completa e revisada vive agora em **[`docs/notes/PLANO_TABELA_CONTEUDO.md`](./PLANO_TABELA_CONTEUDO.md)** — inclui plano de testes manuais próprio. Use aquele documento quando for implementar esta parte; o que está aqui embaixo (a base técnica: `outline` computado com `blockId`, `NoteOutlinePanel.vue`, `NotePropertiesPanel.vue` já pronto) continua correto e é reaproveitado lá, só a forma como isso vira UI é que mudou.

---

## PARTE 6 — Toggle list (bloco recolhível)

### 6.1 Modelo do nó

Desenho mais simples que economiza complexidade real: **um único nó** `toggle`, `content: 'block+'`, onde por convenção **o primeiro filho é o resumo/título** (normalmente um parágrafo, mas nada impede um título) **e o restante é o corpo recolhível** — em vez de dois tipos de nó separados (resumo + conteúdo). A alternativa de dois nós (`toggleSummary` + `toggleContent`) é mais "correta" semanticamente, mas exigiria uma segunda NodeView aninhada só para aplicar o colapso visual ao conteúdo — a abordagem de nó único resolve o colapso com CSS puro (`:not(:first-child)`), sem essa complexidade extra.

```ts
export const ToggleNode = TiptapNode.create({
  name: 'toggle',
  group: 'block',
  content: 'block+',
  defining: true,
  isolating: true,

  addAttributes() {
    return { open: { default: true } }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="toggle"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-type': 'toggle',
      'data-open': node.attrs.open
    }), 0]
  },

  addNodeView(): NodeViewRenderer {
    return VueNodeViewRenderer(EditorToggleNodeView)
  }
})
```

Registrar em `createNotionEditorExtensions()` (`app/composables/useNotionEditor.ts`) e adicionar `'toggle'` a `BLOCK_ID_TYPES`.

### 6.2 NodeView (`app/components/editor/nodes/EditorToggleNodeView.vue`)

Mesmo padrão de `EditorImageNodeView.vue`/`EditorCodeBlockNodeView.vue` (este último, criado na Parte 1 do plano P0):

```vue
<script setup lang="ts">
import type { NodeViewProps } from '@tiptap/vue-3'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/vue-3'

const props = defineProps<NodeViewProps>()
const isOpen = computed(() => props.node.attrs.open !== false)

function toggleOpen() {
  props.updateAttributes({ open: !isOpen.value })
}
</script>

<template>
  <NodeViewWrapper class="kortex-toggle" :data-open="isOpen">
    <button type="button" class="kortex-toggle-chevron" contenteditable="false" @click="toggleOpen">
      <UIcon name="i-lucide-chevron-right" class="size-3.5" :class="{ 'rotate-90': isOpen }" />
    </button>
    <NodeViewContent class="kortex-toggle-body" />
  </NodeViewWrapper>
</template>
```

CSS (`NotionStyleEditor.vue`, junto das outras regras `.kortex-editor-content .tiptap ...`):

```css
.kortex-toggle-body > :not(:first-child) {
  display: none;
}
.kortex-toggle[data-open="true"] .kortex-toggle-body > :not(:first-child) {
  display: block; /* ou o display correto por tipo de bloco */
}
```

> Nota importante: esconder via CSS (`display:none`) em vez de remover do documento é proposital — o conteúdo recolhido continua existindo no ProseMirror doc (preservado ao salvar/recarregar). O efeito colateral conhecido dessa abordagem (compartilhado com o próprio Notion) é que navegação por teclado (setas) pode entrar em conteúdo visualmente escondido — não é um bloqueador, é uma rugosidade aceitável de UX nesta primeira versão.

### 6.3 Comando "/" e digitação

- Item novo no menu de comandos (`createNotionCommandItems`, grupo "Avançado"): "Alternador" / "Toggle", ícone `i-lucide-chevron-right`, insere um `toggle` com um parágrafo vazio dentro (o resumo).
- Atalho de saída: pressionar Enter num parágrafo vazio que é o **último filho** do toggle deve sair para fora dele (mesmo padrão de saída que blocos como `blockquote` já esperam do usuário) — implementar via `addKeyboardShortcuts()` no próprio `ToggleNode`, checando se o parágrafo atual está vazio e é o último filho antes de decidir entre "sair do toggle" ou "comportamento padrão".

### 6.4 Relação com a Parte 5

O conteúdo dentro do corpo do toggle (blocos depois do primeiro) só ganha controles individuais de "+"/arrastar depois que a Parte 5 (resolução de bloco aninhado) estiver pronta — sem ela, o toggle já funciona por completo (colapsa, expande, edita texto, persiste), só não tem o hover de controles nos blocos internos. Isso é consistente com o que já acontece hoje dentro de colunas — não é um bloqueio para lançar o toggle antes da Parte 5.

**Critérios de aceite:** inserir um toggle via "/", digitar no resumo e no corpo, colapsar/expandir preserva o conteúdo, salvar e recarregar a nota mantém o estado `open` e o conteúdo interno.

**Riscos:** baixo-médio. Contido a um nó novo; o ponto de atenção é o atalho de saída (Enter no fim), que costuma exigir alguns ajustes finos na prática apesar de simples na teoria.

---

## PARTE 8 — Lixeira (soft delete)

### 8.1 Schema

Nova migração `supabase/migrations/<timestamp>_notes_soft_delete.sql`:

```sql
ALTER TABLE notes ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;
ALTER TABLE note_folders ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_note_folders_deleted_at ON note_folders(user_id, deleted_at) WHERE deleted_at IS NOT NULL;
```

Mesma convenção que `habits.archived_at` já usa neste projeto (`deleted_at NULL` = ativo) — não é um padrão novo sendo inventado.

### 8.2 Backend: delete vira soft-delete, mais 4 endpoints novos

| Mudança | Arquivo |
| --- | --- |
| `DELETE /api/notes/[id]` passa a fazer `UPDATE notes SET deleted_at = now()` em vez de `DELETE` | `server/api/notes/[id].delete.ts` |
| `DELETE /api/notes/folders/[id]` passa a soft-deletar a pasta **e recursivamente** todas as subpastas/notas descendentes (mesma árvore que `getDescendantFolderIds`/`getAffectedNoteIds` já calculam no frontend para a confirmação — aqui precisa da mesma lógica, mas rodando no servidor, dentro de uma única operação atômica) | `server/api/notes/folders/[id].delete.ts` |
| Novo: lista tudo com `deleted_at IS NOT NULL` do usuário (notas e pastas juntas), ordenado por `deleted_at desc` | `server/api/notes/trash.get.ts` |
| Novo: limpa `deleted_at` da nota; se a pasta original também estiver deletada, restaura na raiz (`folder_id = null`) em vez de ficar "presa" numa pasta invisível | `server/api/notes/[id]/restore.post.ts` |
| Novo: limpa `deleted_at` da pasta **e de todos os descendentes** (restauração em cascata, espelhando a exclusão em cascata) | `server/api/notes/folders/[id]/restore.post.ts` |
| Novo: exclusão de verdade (hard delete), só chamável a partir da lixeira | `server/api/notes/[id]/permanent.delete.ts` e `server/api/notes/folders/[id]/permanent.delete.ts` |
| Novo: apaga permanentemente tudo com `deleted_at` mais antigo que N dias (sugestão: 30) | `server/api/notes/trash/purge.post.ts` |

O endpoint de purga segue o **mesmo padrão de segredo compartilhado** já usado em `server/api/habits/cron-skip.post.ts` (único outro endpoint do projeto pensado para ser chamado por um cron externo) — header `x-cron-secret` validado contra `runtimeConfig.cronSecret`, sem inventar um mecanismo novo. **O agendamento em si (Vercel Cron ou o que já dispara o `cron-skip` hoje) não está neste repositório** — não há como confirmar aqui onde/como isso é configurado; esse passo final precisa ser feito manualmente por quem tem acesso ao painel correspondente, do mesmo jeito que o cron de hábitos já precisou ser configurado por fora em algum momento.

### 8.3 Filtrar itens deletados em todos os endpoints de leitura existentes

Esta é a parte que exige mais atenção — **qualquer endpoint que lê `notes`/`note_folders` sem esse filtro vaza conteúdo "excluído" de volta para a UI**. Checklist completo (todo arquivo do projeto que toca essas duas tabelas):

| Arquivo | Precisa do filtro? | Observação |
| --- | --- | --- |
| `server/api/notes/index.get.ts` | ✅ | listagem principal |
| `server/api/notes/[id].get.ts` | ✅ | detalhe — também usado por `getNoteAccessRole` (`server/utils/note-access.ts`), que faz sua própria consulta a `notes` e também precisa do filtro |
| `server/api/notes/[id].put.ts` | ✅ | não deveria dar pra editar algo na lixeira |
| `server/api/notes/[id].delete.ts` | — | é o próprio soft-delete (8.2) |
| `server/api/notes/[id]/link.post.ts` | ✅ | não deveria dar pra linkar uma nota deletada |
| `server/api/notes/[id]/share-link/regenerate.post.ts` | ✅ | |
| `server/api/notes/[id]/shares/index.get.ts` / `index.post.ts` | ✅ | |
| `server/api/notes/[id]/visibility.put.ts` | ✅ | |
| `server/api/notes/folders/index.get.ts` | ✅ | listagem de pastas |
| `server/api/notes/folders/[id].put.ts` | ✅ | |
| `server/api/notes/folders/[id].delete.ts` | — | é o próprio soft-delete (8.2) |
| `server/api/notes/graph.get.ts` | ✅ | grafo não deve mostrar nós/arestas de notas deletadas |
| `server/api/notes/search.get.ts` | ✅ | busca não deve encontrar notas deletadas |
| `server/api/share/[token].get.ts` | ✅ | um link público antigo não deve continuar funcionando para uma nota que foi pro lixo |
| `server/api/notes/shared-with-me.get.ts` | ✅ | aqui `notes` é lida via *embed* (`note:notes(*)`) dentro de uma query em `note_shares` — sintaxe de filtro diferente: `.eq('note.deleted_at', null)` (caminho com ponto), não `.is('deleted_at', null)` direto |
| `server/api/notes/index.post.ts`, `folders/index.post.ts`, `links/[linkId].delete.ts` | — | criação (linha nova sempre nasce com `deleted_at null`) ou não toca em `notes`/`note_folders` |

### 8.4 Composable (`useNotes.ts`)

- `deleteNote`/`deleteFolder` continuam chamando os mesmos endpoints (que agora soft-deletam) — não muda a assinatura, só o texto do toast ("Nota movida para a lixeira" em vez de "Nota excluída").
- Novas funções: `fetchTrash()`, `restoreNote(id)`, `restoreFolder(id)`, `permanentlyDeleteNote(id)`, `permanentlyDeleteFolder(id)` — seguem o mesmo padrão de `runOptimisticAction` já usado no resto do arquivo.

### 8.5 UI: nova view "Lixeira"

- Reaproveitar o padrão do alternador já existente (`activeView: 'editor' | 'graph'` em `index.vue`), estendendo para um terceiro valor `'trash'`, com um botão novo na toolbar da sidebar (ícone `i-lucide-trash-2`).
- Novo componente `app/components/notes/NotesTrashView.vue`: lista simples (sem árvore de pastas — itens deletados de qualquer lugar aparecem juntos), cada linha com título/nome, ícone (tipo da nota ou pasta), "excluído há X" (`date-fns`, já é dependência do projeto), botão "Restaurar" e botão "Excluir permanentemente".
- Exclusão permanente exige confirmação — reaproveitar o mesmo padrão de `UModal` já usado para excluir pasta (`deleteFolderTarget`, em `index.vue`), já que "permanente" aqui é literal (sem outra rede de segurança depois).

### 8.6 Relação com a exclusão em cascata de pastas já existente

A pasta já excluía notas em cascata ao ser apagada (`ON DELETE CASCADE`, migração `20260812010000_notes_folder_cascade_delete.sql`) — isso **continua valendo integralmente para a exclusão permanente** (a partir da lixeira, que é a única forma de exclusão de verdade agora). A exclusão "normal" (agora soft) passa a ser reversível, o que resolve de vez a limitação já documentada em `docs/MODULO_NOTAS.md`, seção 11: *"Sem lixeira — a exclusão de notas e pastas é permanente"*. A confirmação prévia ao excluir pasta continua fazendo sentido (evita entulhar a lixeira à toa), mas o risco real de perda de dado desaparece.

**Critérios de aceite:** excluir uma nota/pasta não some para sempre — aparece na Lixeira; restaurar devolve ao lugar original (ou à raiz, se a pasta original também tiver sido excluída); excluir permanentemente não pode ser desfeito; nenhum item deletado aparece em nenhuma lista, busca, grafo, link público ou compartilhamento normal.

**Riscos:** alto. Não pela dificuldade de cada peça isolada, mas pela superfície — ~15 arquivos existentes precisam do mesmo cuidado repetido, e esquecer um único filtro vaza conteúdo "excluído" de volta pra UI. A tabela da seção 8.3 deve ser tratada como checklist obrigatório de PR, não como referência solta.

---

## PARTE 5 — Controles de bloco dentro de colunas/listas/toggle

### 5.0 Por que isso não é um ajuste pequeno

Hoje, `getTopLevelBlocks()` (`app/components/editor/NotionStyleEditor.vue`) usa `instance.state.doc.forEach(...)` — isso só enxerga os filhos **diretos da raiz** do documento. Quando o cursor está dentro de um parágrafo dentro de uma coluna (`doc → columns → column → paragraph`), `getActiveBlock()` encontra o bloco `columns` inteiro como "o bloco atual" (porque é o único filho de nível 1 que contém a posição do cursor) — os controles de "+"/arrastar aparecem ao lado da estrutura de colunas inteira, não do parágrafo específico. O mesmo vale para um parágrafo dentro de um item de lista, ou (depois da Parte 6) dentro do corpo de um toggle.

Corrigir isso de verdade exige trocar o modelo de "os filhos diretos da raiz são os blocos" por um resolvedor que entende profundidade arbitrária — e cada tipo de container precisa de uma regra diferente sobre até onde "descer":

| Categoria | Tipos | Regra |
| --- | --- | --- |
| **Atômicos** — nunca descem, o bloco relevante é sempre o próprio container | `blockquote`, `callout`, `table` | Já é assim hoje no nível raiz; continua valendo em qualquer profundidade |
| **Item-container** — o próprio nó é "o bloco", mas pode ter listas aninhadas dentro | `listItem`, `taskItem` | Resolvido como bloco quando o cursor está no seu conteúdo direto; uma sublista dentro dele tem prioridade (é encontrada primeiro, por estar mais profunda) |
| **Transparentes** — nunca são "o bloco", sempre resolve pro filho que contém o cursor | `column`, corpo do `toggle` (depois da Parte 6) | O parágrafo/título/o-que-for dentro é que conta |
| **Wrapper de lista** — nunca são candidatos, sempre atravessados | `bulletList`, `orderedList`, `taskList` | Existem só para conectar `listItem`s consecutivos |
| **Folhas** — sempre o bloco, nunca têm filhos-bloco | `paragraph`, `heading`, `codeBlock`, `horizontalRule`, `editorImage`, `editorFile`, `linkPreview` | Resolução direta |

### 5.1 Algoritmo de resolução

Substituir `getActiveBlock`/`getTopLevelBlocks` por um resolvedor baseado na posição do cursor, não em `doc.forEach`:

```ts
const ATOMIC_TYPES = new Set(['blockquote', 'callout', 'table'])
const ITEM_CONTAINER_TYPES = new Set(['listItem', 'taskItem'])
const TRANSPARENT_TYPES = new Set(['column', 'toggle'])
const LIST_WRAPPER_TYPES = new Set(['bulletList', 'orderedList', 'taskList'])

function resolveActiveBlock(instance: Editor): ActiveBlockInfo | null {
  const { $from } = instance.state.selection
  let candidate: ActiveBlockInfo | null = null

  for (let depth = 1; depth <= $from.depth; depth++) {
    const node = $from.node(depth)
    const type = node.type.name

    if (LIST_WRAPPER_TYPES.has(type)) continue // nunca é candidato, sempre atravessa

    if (ATOMIC_TYPES.has(type) || ITEM_CONTAINER_TYPES.has(type)) {
      candidate = buildInfo(node, depth, $from)
      // Só continua descendo se o próximo nível for um wrapper de lista
      // (sublista dentro do item) — caso contrário, para aqui.
      const next = $from.node(depth + 1)
      if (!next || !LIST_WRAPPER_TYPES.has(next.type.name)) break
      continue
    }

    if (TRANSPARENT_TYPES.has(type)) continue // nunca é candidato, sempre atravessa

    // Tipo "folha" (paragraph, heading, codeBlock, ...) — candidato, mas
    // continua o loop (não deveria haver nada relevante mais fundo).
    candidate = buildInfo(node, depth, $from)
  }

  return candidate
}

function buildInfo(node: ProseMirrorNode, depth: number, $from: ResolvedPos): ActiveBlockInfo {
  return {
    node,
    from: $from.before(depth),
    to: $from.after(depth),
    depth,
    parent: $from.node(depth - 1),
    parentFrom: depth > 1 ? $from.before(depth - 1) + 1 : 0,
    indexInParent: $from.index(depth - 1)
  }
}
```

`TopLevelBlock` (a interface hoje usada por `activeBlock`, `duplicateActiveBlock`, `deleteActiveBlock`, `copyActiveBlockText`, `copyActiveBlockLink`, `turnActiveBlockInto`) ganha os campos novos (`depth`, `parent`, `parentFrom`, `indexInParent`) — o nome pode continuar sendo reaproveitado ou renomeado para `ActiveBlockInfo`, já que "top level" deixa de ser preciso.

### 5.2 O que já funciona sozinho depois da Parte 5.1 (sem mudar mais nada)

`duplicateActiveBlock`, `deleteActiveBlock`, `copyActiveBlockText`, `copyActiveBlockLink` e `turnActiveBlockInto` (todos em `NotionStyleEditor.vue`) já operam via `instance.chain().focus()...run()` ou via `tr.insert(block.to, ...)`/`tr.delete(block.from, block.to)` — mecanismos que funcionam em **qualquer profundidade**, não só na raiz. Uma vez que `activeBlock` resolve corretamente para o bloco aninhado certo, essas ações passam a funcionar ali automaticamente, sem precisar reescrever cada uma. `getBlockControlCoords` (posicionamento visual do "+"/alça) também já funciona só com `from`/`to`/`instance.view`, sem suposição de profundidade — não precisa mudar.

### 5.3 O que precisa de trabalho extra: mover bloco pra cima/baixo

`moveActiveBlock`/`reorderBlock` hoje fazem `instance.state.tr.replaceWith(0, doc.content.size, novosNos)` — substituem o **documento inteiro**, assumindo que todo bloco é filho direto da raiz. Para mover um bloco dentro de uma coluna/item de lista/toggle, a operação precisa acontecer dentro do **range do pai**, não do documento inteiro:

```ts
function moveActiveBlockWithinParent(direction: -1 | 1) {
  const instance = editor.value
  const block = activeBlock.value // agora com parent/parentFrom/indexInParent
  if (!instance || !block) return

  const siblings: ProseMirrorNode[] = []
  block.parent.forEach(child => siblings.push(child))

  const targetIndex = block.indexInParent + direction
  if (targetIndex < 0 || targetIndex >= siblings.length) return

  const moved = siblings.splice(block.indexInParent, 1)[0]!
  siblings.splice(targetIndex, 0, moved)

  const parentInnerFrom = block.parentFrom
  const parentInnerTo = parentInnerFrom + block.parent.content.size
  const transaction = instance.state.tr.replaceWith(parentInnerFrom, parentInnerTo, siblings)
  instance.view.dispatch(transaction)
}
```

Isso cobre o botão "Mover para cima/baixo" do menu de contexto (`EditorBlockMenu.vue`) para blocos aninhados. **O arraste pelo mouse (drag-and-drop) continua sendo um problema à parte** — ver 5.4.

### 5.4 Fora de escopo desta fase

- **Arrastar (drag-and-drop) um bloco aninhado pelo mouse** — reordenar dentro do mesmo pai já cobre o botão de mover, mas o gesto de arrastar com o mouse (`onBlockDragStart`/indicadores de drop já existentes) foi construído assumindo blocos de nível raiz. Generalizar o arraste para qualquer profundidade — e principalmente para **arrastar entre containers diferentes** (tirar um parágrafo de dentro de uma coluna e soltar no nível raiz, ou trocar de coluna) — é um projeto à parte: precisa validar se o tipo de bloco é aceito pelo modelo de conteúdo do destino, recalcular o indicador visual de drop em qualquer profundidade, etc. Fica para uma fase futura.
- **Criar colunas arrastando um bloco já aninhado sobre outro** (hoje só funciona arrastando blocos de nível raiz um sobre o outro).

**Critérios de aceite:** passar o mouse sobre um parágrafo dentro de uma coluna, um item de lista ou o corpo de um toggle mostra o "+"/alça de arraste na posição certa (não mais o bloco pai inteiro); duplicar/excluir/copiar texto/copiar link/converter tipo funcionam nesses blocos aninhados; mover para cima/baixo reordena dentro do mesmo container sem vazar pra fora dele.

**Riscos:** alto. É a única das quatro partes que muda um mecanismo central (como o editor entende "o que é um bloco"), usado por várias funcionalidades já existentes — merece um teste manual extenso em todas as combinações (parágrafo em coluna, item de lista simples, item de lista com sublista, corpo de toggle, blockquote com múltiplos parágrafos) antes de considerar pronto.

---

# Checklist geral de rollout

- [ ] Parte 7 — Tabela de conteúdo — **não implementada, especificação em `docs/notes/PLANO_TABELA_CONTEUDO.md`**
- [x] Parte 6 — Toggle list
- [x] Parte 8.1–8.2 — Schema + endpoints de soft delete/restore/purge
- [x] Parte 8.3 — Filtro `deleted_at` em todos os endpoints de leitura (checklist obrigatório)
- [x] Parte 8.4–8.6 — Composable + UI da Lixeira
- [x] Parte 5.1 — Resolução de bloco ativo por profundidade arbitrária
- [x] Parte 5.2 — Duplicar/excluir/copiar/converter em blocos aninhados (validado — não exigiu código novo nessas ações, só na resolução do bloco)
- [x] Parte 5.3 — Mover bloco aninhado para cima/baixo

---

# Plano de testes manuais

Partes 5, 6 e 8 estão implementadas — teste em `/app/notes`. A Parte 7 não foi implementada, então não há o que testar dela ainda (fica só um lembrete no final).

## Teste 6 — Toggle list (faça este antes do Teste 5, ele cria o toggle usado lá)

1. Numa nota, digite `/` → selecione **"Alternador"**.
2. Digite um texto no resumo (ex.: "Clique para expandir").
3. Pressione **Enter** — **esperado:** abre uma nova linha dentro do próprio toggle (o cursor continua "dentro" dele, recuado).
4. Digite mais 2 parágrafos de texto no corpo.
5. Clique no chevron (▶) à esquerda — **esperado:** o corpo esconde, só o resumo fica visível, e o chevron gira.
6. Clique de novo — **esperado:** expande e os 2 parágrafos digitados no passo 4 ainda estão lá, intactos.
7. Recarregue a nota (F5) — **esperado:** o toggle mantém o estado (aberto/fechado) e todo o conteúdo do corpo.
8. Com o toggle **fechado**, coloque o cursor no último parágrafo do corpo (mesmo escondido — use as setas do teclado a partir do resumo) e pressione Enter num parágrafo vazio no fim do corpo.
9. **Esperado:** o cursor sai do toggle — o novo parágrafo aparece **depois** dele, não mais dentro.

## Teste 5 — Controles de bloco em profundidade arbitrária

**5a — dentro de colunas:**
1. Digite `/` → **"2 Colunas"**.
2. Escreva um parágrafo dentro da coluna da esquerda.
3. Passe o mouse sobre esse parágrafo — **esperado:** o "+"/alça aparece na altura do parágrafo específico, não da estrutura de colunas inteira (esse era o bug original: os controles apareciam para o bloco `columns` inteiro).
4. Pela alça: teste **Duplicar** (esperado: duplica só o parágrafo, dentro da mesma coluna), **Converter em H1** (esperado: vira título só ali), **Copiar link do bloco**, **Excluir bloco**.
5. Com 2+ parágrafos na mesma coluna, teste **"Mover para cima"/"Mover para baixo"** — **esperado:** reordena dentro da coluna, sem vazar para a outra coluna nem para fora do bloco de colunas.
6. Deixe só 1 parágrafo na coluna e tente **excluir** — **esperado:** em vez de sumir a coluna (o que quebraria o layout), o parágrafo fica vazio mas a coluna continua existindo.

**5b — dentro de item de lista:**
1. Crie uma lista com marcadores com 3 itens.
2. Passe o mouse sobre o 2º item — **esperado:** controles aparecem na altura desse item específico.
3. Teste mover para cima/baixo — **esperado:** troca de posição só entre os itens da lista, na ordem certa.
4. Dentro de um item, crie uma sublista (Tab para indentar um novo item) — passe o mouse sobre um item da sublista e confirme que os controles resolvem para o item da sublista, não para o item-pai.

**5c — dentro do corpo de um toggle:**
1. Usando o toggle do Teste 6, passe o mouse sobre um dos parágrafos do corpo — **esperado:** controles aparecem ali, não no toggle inteiro.
2. Duplique/exclua um desses parágrafos e confirme que só ele é afetado.

**5d — arrastar com o mouse continua raiz-only (comportamento esperado, não é bug):**
1. Tente segurar a alça de um bloco **dentro** de uma coluna e arrastar para reordenar.
2. **Esperado:** ou não acontece nada, ou o comportamento não é confiável — isso é conhecido e está fora de escopo desta fase (só o botão "mover para cima/baixo" foi generalizado, não o arrasto do mouse). Não travar a nota nem corromper o conteúdo é o que importa aqui.

## Teste 8 — Lixeira

1. Crie uma nota de teste ("Nota para excluir"), clique com o botão direito → **Excluir**.
2. **Esperado:** toast "Nota movida para a lixeira" (não mais "Nota excluída").
3. Clique no ícone de lixeira na barra de ferramentas da sidebar (ao lado do alternador Editor/Grafo).
4. **Esperado:** a nota aparece na lista da Lixeira, com "Excluído há poucos segundos".
5. Clique em **Restaurar**.
6. **Esperado:** some da lixeira e volta a aparecer na lista normal de notas, no mesmo lugar de antes.
7. Exclua a mesma nota de novo, volte pra Lixeira, clique em **Excluir permanentemente**.
8. **Esperado:** pede confirmação num modal; ao confirmar, a nota some de vez — não aparece mais nem na lixeira nem na lista normal.
9. Crie uma pasta "Pasta A", dentro dela uma subpasta "Pasta B", e dentro de "Pasta B" uma nota "Nota aninhada". Exclua a "Pasta A" (a de fora).
10. **Esperado:** "Pasta B" e "Nota aninhada" somem junto (cascata) e aparecem juntas na Lixeira.
11. Restaure "Pasta A" pela Lixeira.
12. **Esperado:** "Pasta B" e "Nota aninhada" voltam junto, na estrutura original.
13. Teste o caso "pasta original também sumiu": exclua uma nota que está dentro de uma pasta, depois exclua essa pasta também (a nota já deletada continua na lixeira). Restaure **só a nota** (não a pasta).
14. **Esperado:** a nota volta para a **raiz** (fora de qualquer pasta), já que a pasta original ainda está na lixeira — não deveria ficar "presa" em uma pasta invisível.
15. Exclua uma nota e confirme que ela não aparece mais em: busca (ícone de lupa), grafo de conhecimento, nem em "Compartilhadas comigo" (se você tiver alguma nota compartilhada de teste).

## Pendente — Parte 7 (Tabela de conteúdo)

Não implementada nesta rodada — não há nada pra testar ainda. O plano de testes manuais desta parte foi movido junto com a especificação revisada para **[`docs/notes/PLANO_TABELA_CONTEUDO.md`](./PLANO_TABELA_CONTEUDO.md)** (seção final do documento).

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, e a mensagem de erro/toast (se houver).
