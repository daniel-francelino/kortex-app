# Plano — 6 apostas maiores do editor e da tela de Notas (P3)

Este documento detalha as 6 melhorias "P3 — Apostas maiores / diferenciação" listadas em `docs/ANALISE_EDITOR_MERCADO.md`:

17. **IA no editor** (continuar escrevendo, resumir, corrigir)
18. **IA que responde perguntas com base em todas as notas** (busca semântica pessoal)
19. **Histórico de versões** com restauração
20. **Fórmulas/equações** (KaTeX)
21. **OCR de texto em imagens**
22. **Blocos sincronizados**

Nenhuma foi implementada. Diferente dos lotes anteriores, três destes itens (17, 18, 21) precisam de um provedor de IA que **hoje não existe no projeto** — nenhuma integração com LLM, nenhuma chave de API, nada — e por isso compartilham uma peça de infraestrutura nova (Fase 0) antes de qualquer um dos três poder começar.

---

## 0. Ordem recomendada

**Sugestão: 20 → Fase 0 (infra de IA) → 21 → 17 → 19 → 18 → 22**

- **Item 20** (fórmulas) não depende de nada novo além de uma biblioteca — pode andar em paralelo com tudo, a qualquer momento.
- **Fase 0** é o pré-requisito real de 17, 18 e 21 — só precisa existir uma vez.
- **Item 21** (OCR) é, na prática, o uso mais simples da IA dos três — ver a simplificação abaixo.
- **Item 17** (IA no editor) é o próximo mais contido — ações pontuais, sem dado novo persistido.
- **Item 19** (histórico de versões) não depende de IA nenhuma — pode entrar em qualquer ponto da lista, mas fica aqui porque é um bom respiro de complexidade antes do item mais pesado.
- **Item 18** (perguntas sobre todas as notas) é o mais caro e o mais complexo dos seis — precisa de um provedor de *embeddings* separado (a API da Anthropic não gera embeddings), uma extensão de banco (`pgvector`) e um pipeline de indexação. Fica propositalmente perto do fim.
- **Item 22** (blocos sincronizados) — a própria análise já classifica como baixa prioridade. Deixei uma seção curta explicando por que a recomendação aqui é **não construir agora**, e não um plano detalhado como os outros cinco.

---

## PARTE 20 — Fórmulas/equações (KaTeX)

### 20.1 Dependências

```
pnpm add katex
pnpm add -D @types/katex
```

`katex/dist/katex.min.css` precisa ser importado globalmente — adicionar ao array `css` de `nuxt.config.ts` (mesmo mecanismo já usado para outros estilos globais do projeto).

### 20.2 Dois nós novos, seguindo o padrão de nó customizado já usado no projeto

Não existe uma extensão oficial de matemática do Tiptap — as opções da comunidade existem, mas dado que o projeto já tem 4 nós customizados (`CalloutNode`, `EditorImageNode`, colunas, e agora `toggle` se a Parte 6 do `PLANO_EDITOR_P1.md` estiver pronta), construir mais dois no mesmo padrão é mais previsível do que adotar uma dependência de terceiro pouco mantida:

```ts
export const InlineMathNode = TiptapNode.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() { return { latex: { default: '' } } },
  addNodeView: () => VueNodeViewRenderer(EditorInlineMathNodeView)
})

export const BlockMathNode = TiptapNode.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  addAttributes() { return { latex: { default: '' } } },
  addNodeView: () => VueNodeViewRenderer(EditorBlockMathNodeView)
})
```

Adicionar `'inlineMath'` e `'blockMath'` a `BLOCK_ID_TYPES` (só faz sentido para `blockMath`, já que `inlineMath` não é um bloco de nível endereçável).

### 20.3 NodeViews (renderização + edição)

- `EditorBlockMathNodeView.vue` / `EditorInlineMathNodeView.vue`: renderizam `katex.renderToString(node.attrs.latex, { throwOnError: false, displayMode: true/false })` num `<div v-html>` (KaTeX gera HTML/MathML estático, seguro para `v-html` já que não vem de input de usuário não-confiável em runtime — é o próprio KaTeX que gera).
- Clique na fórmula renderizada troca para modo de edição: mostra um `<textarea>`/`<input>` com o LaTeX cru + preview ao vivo (chama `katex.renderToString` a cada tecla, mostrando erro de sintaxe inline se `throwOnError` disparar — usar `throwOnError:false` e checar `error` no resultado em vez de exceção).
- Blur ou Enter confirma e volta ao modo renderizado, chamando `props.updateAttributes({ latex: novoValor })`.

### 20.4 Comando "/"

Dois itens no menu de comandos (grupo "Avançado"): "Fórmula" (bloco, `blockMath`) e "Fórmula inline" (dentro de um parágrafo, `inlineMath`). Detecção automática de `$...$`/`$$...$$` ao digitar fica fora do escopo desta primeira versão — os itens do menu "/" já resolvem o pedido original.

**Critérios de aceite:** inserir uma fórmula bloco/inline, digitar LaTeX válido renderiza corretamente; LaTeX inválido mostra um indicador de erro em vez de quebrar a nota; salvar/recarregar preserva a fórmula.

**Riscos:** baixo. Sem dado novo no backend (o LaTeX vive dentro do `content` da nota, como qualquer outro atributo de nó), sem custo recorrente, sem dependência de serviço externo.

---

## FASE 0 — Infraestrutura de IA (pré-requisito das Partes 21, 17 e 18)

### 0.1 Dependência e configuração

```
pnpm add @anthropic-ai/sdk
```

Em `nuxt.config.ts`, no mesmo bloco `runtimeConfig` onde já vivem `stripeSecretKey`/`supabaseServiceRoleKey`:

```ts
anthropicApiKey: process.env.ANTHROPIC_API_KEY,
```

Novo `server/utils/anthropic.ts`, espelhando exatamente o padrão já usado em `server/utils/supabase.ts` (singleton lazy, erro claro se a chave não estiver configurada):

```ts
import Anthropic from '@anthropic-ai/sdk'

let anthropicClient: Anthropic | undefined

export function getAnthropicClient() {
  if (anthropicClient) return anthropicClient

  const config = useRuntimeConfig()
  if (!config.anthropicApiKey) {
    throw createError({ statusCode: 500, statusMessage: 'Anthropic API não configurada' })
  }

  anthropicClient = new Anthropic({ apiKey: config.anthropicApiKey })
  return anthropicClient
}
```

### 0.2 Escolha de modelo — uma decisão por ação, não uma escolha única

Não existe um modelo certo único para as três partes que dependem desta infraestrutura — o trade-off entre custo/latência e qualidade de raciocínio muda por ação:

| Ação | Modelo sugerido | Por quê |
| --- | --- | --- |
| Continuar escrevendo (item 17) | `claude-sonnet-5` (ou `claude-haiku-4-5` se a latência importar mais que a qualidade) | Roda a cada poucas palavras digitadas, sensível a latência — não precisa do raciocínio mais profundo |
| Resumir / corrigir / melhorar (item 17) | `claude-sonnet-5` | Boa relação custo/qualidade para transformações de texto pontuais |
| OCR / transcrição de imagem (item 21) | `claude-sonnet-5` | Tarefa de percepção, não de raciocínio profundo |
| Responder perguntas sobre todas as notas (item 18) | `claude-opus-5` | É o recurso "carro-chefe" citado na própria análise de mercado como o que mais precisa de execução cuidadosa — vale a qualidade extra |

Isso é uma sugestão inicial, não uma imposição — dá pra trocar por modelo em cada endpoint sem afetar os outros, já que cada ação é uma chamada isolada.

### 0.3 Controle de custo

Diferente de tudo mais no projeto até aqui, chamadas de IA têm **custo direto por uso** — um bug (loop de retry, uso indevido) pode gerar uma conta inesperada. Vale um limite simples por usuário desde o início, não como otimização depois:

- Nova tabela `ai_usage_log` (`id, user_id, feature, created_at`) — uma linha por chamada.
- Cada endpoint de IA checa antes de chamar: `SELECT count(*) FROM ai_usage_log WHERE user_id = :userId AND created_at > now() - interval '1 day'` contra um teto configurável (ex. 200/dia) — retorna 429 amigável ("Limite diário de IA atingido") se excedido.

### 0.4 Streaming

Para ações que geram texto mais longo (continuar escrevendo, respostas do item 18), usar `client.messages.stream(...)` no servidor e repassar os chunks para o cliente via uma resposta HTTP em streaming (Nitro suporta retornar um `ReadableStream`/ `sendStream` a partir de um handler) — sem isso, o usuário fica olhando para um "carregando" por vários segundos numa ação que deveria parecer instantânea, tipo digitar. Ações que **substituem** um trecho selecionado (corrigir, resumir) podem ficar não-streamadas na v1: transmitir tokens parciais e ir reescrevendo a seleção em tempo real é bem mais delicado (precisa recalcular constantemente contra o range selecionado) e não traz o mesmo ganho de percepção que "continuar escrevendo" (que só faz *append*, nunca reescreve algo já visível).

---

## PARTE 21 — OCR de texto em imagens

### 21.1 Simplificação importante: não precisa de um serviço de OCR dedicado

A análise original imaginava algo como Tesseract.js ou uma API de OCR na nuvem — mas os modelos Claude enxergam imagens nativamente (visão), então a forma mais simples de resolver isso é **mandar a imagem direto pro Claude com um prompt de transcrição**, em vez de integrar um serviço de OCR separado:

```ts
const response = await client.messages.create({
  model: 'claude-sonnet-5',
  max_tokens: 4096,
  messages: [{
    role: 'user',
    content: [
      { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64Data } },
      { type: 'text', text: 'Transcreva todo o texto legível nesta imagem, preservando a formatação aproximada (parágrafos, listas). Se não houver texto legível na imagem, responda apenas "SEM_TEXTO".' }
    ]
  }]
})
```

Isso também lida bem com o pedido original ("fotografar uma anotação manuscrita ou quadro branco") — a visão do Claude lida razoavelmente com letra manuscrita legível, ao contrário de motores de OCR clássicos que são otimizados só pra texto impresso.

### 21.2 Endpoint

Novo `server/api/editor/ocr.post.ts`: recebe `{ path, bucket }` (o arquivo já foi enviado via `POST /api/editor/uploads`, reaproveita a mesma infraestrutura), busca os bytes do storage, converte pra base64, chama o Claude conforme acima, retorna `{ text: string | null }` (`null` se vier "SEM_TEXTO").

### 21.3 UI

- No `EditorImageNodeView.vue`, um botão novo na barra de ferramentas da imagem (junto de "Substituir"): "Extrair texto".
- Ao clicar: chama o endpoint, mostra um spinner no botão; se retornar texto, insere um parágrafo novo logo abaixo do bloco de imagem com o texto transcrito; se retornar `null`, mostra um toast ("Não foi possível identificar texto legível nesta imagem").

### 21.4 Sinergia de brinde: já fica pesquisável

Como o texto extraído é inserido como conteúdo normal da nota (um parágrafo), ele automaticamente passa a fazer parte do `content` que a busca já pesquisa (`ilike` em `server/api/notes/search.get.ts`) — não precisa de nenhuma infraestrutura de busca nova para isso funcionar.

**Critérios de aceite:** fotografar uma anotação manuscrita legível e extrair o texto produz uma transcrição razoável; uma imagem sem texto (uma foto qualquer) não insere nada e avisa o usuário.

**Riscos:** médio. A qualidade da transcrição varia com a legibilidade da caligrafia/foto — isso é uma limitação do problema em si, não da implementação. Custo por chamada de IA (ver Fase 0.3).

---

## PARTE 17 — IA no editor (continuar escrevendo, resumir, corrigir)

### 17.1 Endpoints

- `server/api/editor/ai/complete.post.ts` — corpo `{ contextText: string }` (o texto antes do cursor, até um limite razoável tipo os últimos ~2000 caracteres), retorna um **stream** de texto continuando o parágrafo/pensamento atual.
- `server/api/editor/ai/transform.post.ts` — corpo `{ text: string, action: 'summarize' | 'fix' | 'improve' }`, um prompt por ação, retorna o texto transformado (não-streamado, ver Fase 0.4).

### 17.2 UI — bubble menu (seleção de texto)

Em `EditorBubbleMenu.vue`, mesmo padrão da view `'color'` já adicionada no `docs/PLANO_EDITOR_P0.md`: um botão "IA" (ícone `i-lucide-sparkles`) na toolbar abre uma view `'ai'` com 3 opções — "Resumir seleção", "Corrigir gramática/ortografia", "Melhorar redação". Cada uma chama `transform.post.ts` com a `action` correspondente e o texto selecionado, mostra um estado de carregamento no lugar do texto (ou um popover com o resultado + botões "Aceitar"/"Descartar" — mais seguro que substituir direto, já que a IA pode errar e o usuário deve poder recusar antes de aplicar).

### 17.3 UI — continuar escrevendo

Não depende de seleção — vive no menu "/" (grupo "Avançado"): "Continuar escrevendo com IA", insere o texto gerado a partir da posição do cursor, token a token conforme o stream chega (`editor.commands.insertContentAt(pos, chunk)` a cada chunk recebido).

### 17.4 Desfazer é de graça

Como tanto a substituição (corrigir/resumir, após "Aceitar") quanto a inserção (continuar escrevendo) acontecem via transações normais do ProseMirror — não é uma manipulação de DOM por fora do editor — o Ctrl+Z padrão já desfaz a ação de IA como desfaria qualquer edição manual, sem precisar de nenhum código especial de histórico.

**Critérios de aceite:** selecionar texto e pedir "Resumir"/"Corrigir"/"Melhorar" mostra um resultado que pode ser aceito ou descartado; "Continuar escrevendo" insere texto a partir do cursor em tempo real (efeito de streaming visível); Ctrl+Z desfaz qualquer uma das ações.

**Riscos:** médio. A UX de "aceitar/descartar" precisa ficar clara (evitar que o usuário ache que o texto já foi substituído quando ainda é só uma prévia); custo por chamada de IA (ver Fase 0.3).

---

## PARTE 19 — Histórico de versões com restauração

### 19.1 Schema

```sql
CREATE TABLE note_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  content text,
  trigger text NOT NULL DEFAULT 'autosave' CHECK (trigger IN ('autosave', 'restore')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_versions_note_id ON note_versions(note_id, created_at DESC);
```

**Estratégia: snapshot completo por versão, não diff.** Para o volume de dados de um app pessoal, guardar o conteúdo inteiro por versão é bem mais simples do que um sistema de patches/diffs, ao custo de mais espaço em disco — uma troca razoável nesta escala.

### 19.2 Quando criar uma versão

Reaproveitar o autosave que já existe (`NoteEditor.vue`, já debated a cada ~60s quando há alteração pendente) — a cada salvamento bem-sucedido, gravar também uma linha em `note_versions`. Para não acumular uma versão por *tick* de autosave numa sessão de edição longa, manter um teto simples: depois de inserir, apagar as versões mais antigas além das últimas **50** por nota (`DELETE ... WHERE note_id = :id AND id NOT IN (SELECT id FROM note_versions WHERE note_id = :id ORDER BY created_at DESC LIMIT 50)`).

### 19.3 Endpoints

| Método e rota | Função |
| --- | --- |
| `GET /api/notes/[id]/versions` | Lista versões (só `id`, `title`, `trigger`, `created_at` — sem o `content`, pra ficar leve) |
| `GET /api/notes/[id]/versions/[versionId]` | Detalhe completo de uma versão (com `content`) |
| `POST /api/notes/[id]/versions/[versionId]/restore` | Restaura — **antes de sobrescrever**, salva o estado atual da nota como uma nova versão com `trigger:'restore'`, só depois aplica o conteúdo da versão escolhida. Isso torna a própria restauração reversível. |

### 19.4 UI

- Botão novo no cabeçalho do `NoteEditor.vue` (ícone `i-lucide-history`), ao lado do botão "Compartilhar" — abre um painel/modal "Histórico de versões".
- Lista das versões, mais recente primeiro, com data relativa ("há 2 horas") e o `trigger`.
- Clicar numa versão mostra uma prévia somente-leitura (reaproveita `EditorNotionStyleEditor` com `:editable="false"`, mesmo padrão já usado na página pública de compartilhamento) + botão "Restaurar esta versão" (com confirmação).

### 19.5 Fora de escopo

- **Visualização de diff** entre duas versões (o que mudou, palavra por palavra) — ficaria bom, mas exige uma biblioteca de diff e é um adicional, não o essencial do pedido original ("histórico com restauração").

**Critérios de aceite:** editar uma nota várias vezes ao longo do tempo acumula versões; abrir o histórico mostra a lista; restaurar uma versão antiga aplica o conteúdo dela E cria uma versão nova preservando o que existia antes de restaurar.

**Riscos:** baixo. Schema aditivo, sem dependência de serviço externo, sem custo recorrente.

---

## PARTE 18 — IA que responde perguntas com base em todas as notas (RAG)

Esta é a mais cara e mais complexa das seis — a própria análise de mercado já sinaliza isso ("mais ambicioso que o item 17... vale ficar de olho na execução, não só na feature").

### 18.1 Decisão de produto pendente: provedor de embeddings

A API da Anthropic **não tem endpoint de embeddings** — só mensagens/chat. Para busca semântica é preciso um provedor separado que gera vetores a partir de texto. A opção mais natural de combinar com o Claude é a **Voyage AI** (parceira recomendada pela própria Anthropic para embeddings), mas é uma dependência de fornecedor nova, com seu próprio custo recorrente — **essa escolha deveria ser confirmada antes de estimar o esforço final desta parte**, pelo mesmo motivo que a escolha de provedor de transcrição no item 14 (`docs/PLANO_EDITOR_P2.md`) ficou em aberto: muda o desenho do pipeline de indexação e é uma decisão de custo, não só técnica.

### 18.2 Desenho assumindo Voyage AI

**Schema** — habilitar a extensão `vector` (pgvector, já suportada nativamente pelo Supabase) e uma tabela de chunks:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE note_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  chunk_text text NOT NULL,
  embedding vector(1024), -- dimensão depende do modelo de embedding escolhido
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_note_embeddings_note_id ON note_embeddings(note_id);
CREATE INDEX idx_note_embeddings_vector ON note_embeddings USING ivfflat (embedding vector_cosine_ops);
```

**Divisão em pedaços (chunking)**: uma nota inteira costuma ser grande/heterogênea demais pra virar um único vetor útil de busca — divide-se o conteúdo em pedaços de ~500 tokens, respeitando limites de parágrafo quando possível, um `note_embeddings` por pedaço.

**Pipeline de indexação**: ao salvar uma nota (reaproveitando o mesmo ponto de autosave da Parte 19, mas com um debounce próprio maior — reindexar a cada tecla seria caro demais): apagar os chunks antigos daquela nota e gerar/inserir os novos. Correção-primeiro em vez de diff incremental — mais simples de manter correto, aceitável na escala de dados de um app pessoal.

**Fluxo de pergunta**:
1. Gerar o embedding da pergunta do usuário (mesma API de embeddings).
2. Busca por similaridade de cosseno em `note_embeddings`, filtrando por `user_id`, pegando os ~8 pedaços mais próximos.
3. Montar um prompt pro Claude com os pedaços recuperados como contexto + a pergunta.
4. Chamar `claude-opus-5` (ver Fase 0.2 — é a única das ações de IA deste lote onde a qualidade de raciocínio pesa mais que custo/latência), com streaming da resposta.
5. Resposta inclui **citações clicáveis** às notas de origem — reaproveitar o mesmo padrão visual de wikilink já existente no editor, já que semanticamente é a mesma coisa ("isso vem desta outra nota").

### 18.3 UI

Reaproveitar `SearchDialog.vue` em vez de criar uma superfície nova do zero: adicionar uma aba/modo "Perguntar" ao lado da busca normal (o componente já tem o padrão de modal "Cmd+K" e os filtros — uma aba de chat é uma extensão natural, não uma tela nova).

**Critérios de aceite:** perguntar algo cuja resposta depende de múltiplas notas retorna uma resposta coerente citando as notas certas; clicar numa citação navega até a nota de origem; uma nota editada é refletida na próxima pergunta em até alguns minutos (não precisa ser instantâneo).

**Riscos:** alto. É o item com mais peças móveis novas (provedor de embeddings, extensão de banco, pipeline de indexação, custo por nota E por pergunta) — e, como a própria análise de mercado já observa, a qualidade da *execução* (chunking, recuperação, prompt) importa tanto quanto a feature em si para o resultado não parecer "genérico".

---

## PARTE 22 — Blocos sincronizados

### 22.1 Por que este documento não detalha isso como as outras cinco partes

A análise de mercado já classifica este item como **baixa prioridade** ("recurso avançado com pouco uso real fora de times grandes") — a recomendação aqui é a mesma: **não construir agora**, e este documento respeita isso não escrevendo um plano de implementação completo para algo já sinalizado como não-prioritário.

### 22.2 Por que, tecnicamente, é mais caro do que parece

Um "bloco sincronizado" (o mesmo conteúdo aparecendo em vários lugares, onde editar uma cópia atualiza todas) tem uma parte fácil e uma parte difícil:

- **Fácil**: o modelo de dados — um nó `syncedBlockRef` com um `sourceId` apontando pra um conteúdo canônico guardado à parte, renderizado onde quer que a referência apareça.
- **Difícil**: manter todas as instâncias abertas **sincronizadas em tempo real** sem um backend de colaboração de verdade (tipo Yjs/CRDT). Sem isso, editar um bloco sincronizado numa aba não atualiza outra aba já aberta com a mesma referência até recarregar — e o projeto **não tem nenhuma infraestrutura de colaboração em tempo real** hoje (a fila de sincronização offline construída em `docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md` resolve outro problema — sincronizar entre sessões, não entre abas simultâneas). Construir isso direito é, na prática, o mesmo tamanho de investimento que colaboração em tempo real multiusuário — um projeto à parte, não uma feature de bloco.

### 22.3 Recomendação

Reavaliar só se o produto expandir para uso colaborativo/em equipe — o cenário onde essa feature realmente compensa o investimento, segundo a própria análise de mercado.

---

# Checklist geral de rollout

- [ ] Parte 20 — Fórmulas/equações (KaTeX)
- [ ] Fase 0 — Infraestrutura de IA (pré-requisito de 21, 17, 18)
- [ ] Parte 21 — OCR de texto em imagens (via visão do Claude)
- [ ] Parte 17 — IA no editor (continuar escrevendo, resumir, corrigir)
- [ ] Parte 19 — Histórico de versões
- [ ] Parte 18 — Perguntas sobre todas as notas (decisão de provedor de embeddings pendente — validar com o usuário antes de estimar)
- [ ] Parte 22 — Blocos sincronizados (recomendação: não construir agora)

---

# Plano de testes manuais

**Nada deste lote foi implementado ainda.** Como em `PLANO_EDITOR_P2.md`, esta seção é o roteiro pronto pra usar assim que cada parte for construída — não há nada pra rodar hoje. A Parte 22 não tem teste porque a recomendação do próprio documento é não construí-la.

## Teste 20 — Fórmulas/equações (KaTeX)

1. Digite `/` → **"Fórmula inline"**, dentro de um parágrafo, digite um LaTeX válido, ex. `E = mc^2`.
2. **Esperado:** renderiza a fórmula formatada dentro do texto (não o LaTeX cru).
3. Clique na fórmula renderizada — **esperado:** volta ao modo de edição (LaTeX cru + preview ao vivo).
4. Digite `/` → **"Fórmula"** (bloco), digite algo mais complexo, ex. `\int_0^\infty e^{-x^2} dx = \frac{\sqrt{\pi}}{2}`.
5. **Esperado:** renderiza como bloco centralizado, formatado corretamente.
6. Digite um LaTeX propositalmente inválido (ex. `\frac{1`, sem fechar) — **esperado:** mostra um indicador de erro inline, sem quebrar a nota nem travar o editor.
7. Corrija o erro e confirme (blur/Enter) — **esperado:** volta a renderizar normalmente.
8. Salve e recarregue — confirme que fórmula inline e em bloco persistem exatamente como deixadas.

## Verificação — Fase 0 (infraestrutura de IA)

Não é uma feature visível por si só — valide indiretamente através dos testes 21/17/18 abaixo. Antes de testar qualquer um deles:
1. Confirme que `ANTHROPIC_API_KEY` está configurada no ambiente (sem isso, qualquer endpoint de IA deve retornar um erro claro "Anthropic API não configurada", não um 500 genérico).
2. Force o limite diário de uso (ou reduza o teto temporariamente em ambiente de teste) e confirme que, ao estourar, a resposta é um `429` com mensagem amigável ("Limite diário de IA atingido"), não um erro cru.

## Teste 21 — OCR de texto em imagens

1. Fotografe (ou use uma foto já existente) de uma página escrita à mão de forma legível, faça upload como imagem numa nota.
2. Na barra de ferramentas da imagem, clique em **"Extrair texto"**.
3. **Esperado:** spinner no botão enquanto processa; ao terminar, insere um parágrafo novo logo abaixo da imagem com a transcrição.
4. Confira a qualidade da transcrição contra o que está escrito na foto (não precisa ser perfeita, mas devia ser razoável).
5. Repita com uma foto **sem** texto nenhum (uma paisagem, por exemplo).
6. **Esperado:** não insere nada, mostra um toast "Não foi possível identificar texto legível nesta imagem".
7. Vá em `/api/notes/search` (busca da nota) e procure por uma palavra que só existe no texto extraído no passo 3.
8. **Esperado:** a nota aparece nos resultados — o texto extraído passou a ser pesquisável como qualquer outro parágrafo.

## Teste 17 — IA no editor (continuar escrevendo, resumir, corrigir)

1. Selecione um parágrafo com erros de português propositais, abra a bubble menu → ícone **"IA"** (`i-lucide-sparkles`) → **"Corrigir gramática/ortografia"**.
2. **Esperado:** mostra o resultado corrigido num preview, com botões "Aceitar"/"Descartar" — **não substitui o texto original automaticamente**.
3. Clique em "Descartar" — **esperado:** texto original continua intacto.
4. Repita e clique em "Aceitar" — **esperado:** texto selecionado é substituído pelo corrigido.
5. Pressione Ctrl+Z — **esperado:** desfaz a substituição da IA como desfaria qualquer edição manual, voltando ao texto original.
6. Selecione um parágrafo longo, use **"Resumir seleção"** — **esperado:** mesmo fluxo de preview + aceitar/descartar, resultado é um resumo coerente.
7. Repita com **"Melhorar redação"**.
8. Sem selecionar nada, digite `/` → **"Continuar escrevendo com IA"** a partir do fim de um parágrafo.
9. **Esperado:** texto aparece sendo inserido progressivamente (efeito de streaming visível, não tudo de uma vez), continuando o sentido do parágrafo.
10. Pressione Ctrl+Z depois do "continuar escrevendo" terminar — **esperado:** desfaz o texto inserido pela IA.

## Teste 19 — Histórico de versões

1. Edite uma nota, salve (aguarde o autosave, ~60s após parar de digitar), edite de novo, salve de novo — repita até ter pelo menos 3 versões diferentes de conteúdo.
2. Clique no botão de histórico (ícone `i-lucide-history`) no cabeçalho da nota.
3. **Esperado:** lista de versões, mais recente primeiro, com data relativa ("há 2 minutos") e a origem (`autosave`).
4. Clique numa versão do meio — **esperado:** abre uma prévia **somente leitura** do conteúdo daquele momento (não editável).
5. Clique em **"Restaurar esta versão"**, confirme.
6. **Esperado:** o conteúdo da nota volta ao daquela versão.
7. Abra o histórico de novo — **esperado:** aparece uma versão nova com origem `restore`, e o conteúdo que estava na nota **antes** da restauração continua disponível como uma versão anterior (a restauração em si é reversível).
8. Edite a mesma nota repetidamente (mais de 50 vezes, se for prático) — **esperado:** o histórico não cresce sem limite; as versões mais antigas além das 50 mais recentes são descartadas.

## Teste 18 — Perguntas sobre todas as notas (RAG)

1. Crie (ou use) pelo menos 3 notas com informações relacionadas mas não idênticas sobre um mesmo assunto (ex. três notas diferentes sobre um projeto).
2. Abra a busca (Cmd/Ctrl+K), mude para a aba/modo **"Perguntar"**.
3. Faça uma pergunta cuja resposta só faz sentido combinando informação de mais de uma dessas notas.
4. **Esperado:** resposta coerente, citando as notas de origem como links clicáveis.
5. Clique numa citação — **esperado:** navega até a nota de origem correta.
6. Edite uma das notas usadas como fonte, mudando um fato relevante, aguarde alguns minutos (o pipeline de indexação não é instantâneo) e repita a pergunta.
7. **Esperado:** a resposta eventualmente reflete a edição (não precisa ser imediato, mas precisa acontecer).
8. Pergunte algo sobre um assunto que não existe em nenhuma nota sua.
9. **Esperado:** a IA indica que não encontrou informação relevante, em vez de inventar uma resposta (checar isso com atenção — é o principal risco de qualidade desta parte).

## Parte 22 — Blocos sincronizados

Sem teste — a recomendação do próprio plano é **não construir agora**. Se essa decisão for revisitada no futuro (ex. o produto ganhar uso colaborativo em equipe), escrever o plano de teste nesse momento, junto com o plano de implementação.

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, mensagens de erro/toast, e — específico deste lote — qualquer erro relacionado a limite de uso ou chave de API ausente/inválida.
