# Plano — Bugs e melhorias do módulo de Notas

Este documento parte de uma lista crua de observações de uso (abaixo, preservada como registro original) e a transforma num plano de implementação, no mesmo formato usado nos demais `PLANO_*.md` do projeto: cada item foi verificado contra o código real (arquivo:linha, não suposição) antes de virar um item de plano, e tudo foi priorizado em P0/P1/P2.

**Lista original** (input deste plano):

> - PRECISO TER ATENÇÃO A VERSÃO MOBILE;
> - PRECISO TER ATENÇÃO E MELHORAR O EDITOR DE TEXTO QUE AINDA ESTÁ COM BUGS.
>     - Adicionar Flip nas opções porque quando está no final da tela, não consigo selecionar nada;
>     - Gap maior entre as cores quando vou selecionar uma cor de texto, só um pouco maior, atualmente ta colado;
>     - Quando estou no menu para escolher a Cor de Texto, não precisa dessa label, remover a label Cor de Texto;
>     - O mesmo para Destaque, quando vou escolher a cor, não precisa da label de Destaque;
>     - Não encontrei a opção limpar formatação;
> - Quando vou navegar para uma outra página e a que estou ainda não foi salva, tem um pequeno delay para outra página;
> - Adicionar logs no useNotes.ts porque estamos com algum erro de "Falha ao carregar as notas", mas não sei o motivo;
> - Na lixeira deve ter um Btn de limpar tudo, e a possibilidade de selecionar para excluir em bulk;
> - Estou na ordenação "Personalizado" maas o icon que exibe como ativo é "Mais recentes"
> - Agendamento/CRON no outros projeto para limpar a lixeira das notas mais velhas que 30 dias, e isso deve ficar claro para o usuário.
> - Possibilidade de Criar difentes tipos de notas, por exemplo, uma pode ser um Flow.
> - Para o usuário que cria conteúdo e compartilha, seria uma boa ter uma análise dos dados, pensar melhor a respeito. Como não é todo mundo que usaria, podia deixar por padrão desabilitado e só funcionaria se o usuário ativasse para aquele arquivo e a mágica acontecer.
> - Remover label do Btn de Compartilhar, e deixar o Tooltip com Compartilhar, economizar espaço;

- Erro 400 no endpoint "Uncaught (in promise) FetchError: [PUT] "/api/settings/notifications/subscription": 400 
    at async o (ofetch.CWycOUEr.mjs:333:12)"

---

## 1. Diagnóstico item a item

### 1.1 "Atenção à versão mobile"

Era vago por natureza — não havia nenhum bug mobile específico já registrado contra o que está implementado no módulo de Notas. Virou item de **auditoria manual** (testar editor, sidebar, lista, bubble menu e lixeira num viewport estreito), e a primeira rodada já achou um bug concreto e sério:

**✅ Corrigido — sidebar + editor sem colapso no mobile.** O layout de duas colunas (sidebar de pastas/notas com largura fixa/redimensionável via `sidebarWidth`, mais a área principal do editor) nunca teve tratamento responsivo — diferente do painel de Sumário/Propriedades, que já nasceu com `isRightPanelMobile` (`app/pages/app/notes/index.vue`, ver `docs/notes/PLANO_TABELA_CONTEUDO.md`). Resultado, confirmado por captura de tela em produção: numa tela de celular, as duas colunas tentavam coexistir, espremendo o editor a uma fatia ilegível de poucos pixels de largura, com o texto quebrando linha a cada 2-3 palavras.

Corrigido reaproveitando o mesmo padrão já usado pelo painel direito: renomeado `isRightPanelMobile` → `isNotesMobileLayout` (mesmo breakpoint, `max-width: 1023px`, agora reutilizado pelas duas decisões de layout da página) e adicionado `showMobileMainArea` (`activeView !== 'editor' || !!selectedNoteId`). Abaixo do breakpoint, sidebar e área principal passam a ocupar 100% da largura **alternadamente** (nunca as duas ao mesmo tempo) — sem nota selecionada (e fora de grafo/lixeira), mostra só a sidebar; ao selecionar uma nota (ou abrir grafo/lixeira), mostra só a área principal, com um botão "Notas" (seta pra voltar) no topo pra retornar à lista. A alça de redimensionamento da sidebar também some no mobile (não faz sentido numa coluna de largura fixa em 100%).

**✅ Corrigido — cabeçalho do `NoteEditor.vue` sem tratamento mobile.** Segunda rodada, também confirmada por captura de tela em produção: mesmo depois do fix acima, o cabeçalho do editor (navegação de histórico voltar/avançar, breadcrumb, indicador de status "Editado 13 de ago. de 2026, 16:11") continuava desenhado pra largura de desktop, disputando espaço numa barra estreita. `NoteEditor.vue` ganhou seu próprio `isMobile` (`useMediaQuery`, mesmo breakpoint `1023px`). Abaixo dele:
- Botões de voltar/avançar (histórico) somem — já ficaram redundantes com o botão "Notas" que volta pra lista (o mesmo do fix acima).
- O breadcrumb (pasta > nota) some do cabeçalho do editor — o `<nav>` continua existindo como espaçador vazio, só o conteúdo é escondido — e o título/ícone da nota atual passa a aparecer direto ao lado do botão "Notas", no topo (reaproveitando `currentNoteDetail`, já disponível em `index.vue`, sem precisar expor nada novo do `NoteEditor.vue`).
- O indicador de status de salvamento vira só ícone nos estados "salvo"/"não salvo"/"salvo offline" (sem o texto/data, que era o que mais ocupava espaço) — exceto o estado de erro, que continua com texto (encurtado pra "Erro") porque é acionável (clicar tenta salvar de novo), não é só decoração.

**✅ Corrigido — título da nota vazava da tela em telas estreitas.** Terceira rodada, de novo confirmada por captura de tela: o título é editado num `<input type="text">` — que, por natureza do elemento, **nunca quebra linha**, não importa o CSS aplicado; um título um pouco mais longo simplesmente vaza pra fora da viewport, cortado. Trocado por um `<textarea>` (`rows="1"`, `resize-none`, altura ajustada via JS a cada digitação/carregamento — `autoGrowTitle()`) que quebra linha e cresce com o conteúdo, mesmo padrão que Notion usa pro título. Enter não insere quebra de linha no título (não faz sentido pra esse campo) — em vez disso, move o foco pro corpo da nota (`onTitleEnter`), igual o Notion também faz. Também reduzido o padding lateral do título e do corpo do editor no mobile (`pl-16 pr-10` → `px-4`) e a fonte do título (`text-3xl` → `text-2xl`), que juntos comiam boa parte da largura disponível numa tela de celular.

**✅ Corrigido — skeleton de carregamento inicial não respeitava o layout mobile.** Quarta rodada: o bloco de skeleton mostrado só no primeiro carregamento da página (`notesListInitialLoading`) renderizava sidebar-skeleton (largura fixa) e área-principal-skeleton (`flex-1`) lado a lado **incondicionalmente** — não tinha nenhuma noção de `isNotesMobileLayout`, então reproduzia exatamente o bug original (as duas colunas espremidas) só que na tela de carregamento, mesmo depois do conteúdo real já estar corrigido. Corrigido usando a mesma condição (`!isNotesMobileLayout || !showMobileMainArea` pra sidebar, `!isNotesMobileLayout || showMobileMainArea` pra área principal) — no mobile, mostra só um skeleton por vez, coerente com o que vai aparecer depois de carregar (inclusive no caso de abrir a página direto numa URL com `?note=id`, onde já é a área principal que aparece primeiro, não a sidebar).

**✅ Corrigido — lista de pastas/notas com alvos de toque pequenos demais.** Quinta rodada, confirmada por captura de tela: `NotesList.vue` foi desenhada pra densidade de mouse — linhas de `py-1.5` (~28px de altura), texto `text-xs` (12px) e ícones `size-3`/`size-3.5` (12-14px), bem abaixo da recomendação usual de ~44px de alvo de toque. Pior: o botão "..." de cada linha (renomear, excluir, fixar) só aparecia com `opacity-0 group-hover:opacity-100` — **dependente de hover, que não existe em touch** — ou seja, no mobile esse botão era praticamente inacessível (só via o `UContextMenu`/long-press, se o dispositivo suportar).

Corrigido com o mesmo `isMobile` (`useMediaQuery`, `1023px`) adicionado a `NotesList.vue`: no mobile, linhas de pasta/nota ganham `py-2.5`, texto vira `text-sm`, ícones (chevron, pasta, tipo da nota, e o espaçador que alinha os dois) sobem pra `size-4`, e o botão de ações (`...`) fica sempre visível (`opacity-100`) em vez de esperar um hover que nunca vai acontecer.

**✅ Corrigido — bubble menu (e outros menus flutuantes) largos/pequenos demais pro toque.** Sexta rodada. O clamp de posição do item 7/P1 resolve o menu sair da tela, mas não resolve um problema diferente: a bubble menu de seleção de texto tem ~15 botões numa fileira só, com `white-space: nowrap` e sem `max-width` — em qualquer largura de celular (~360-400px), o conteúdo é **estruturalmente mais largo que a tela**, então parte dos botões ficava inalcançável, clamp nenhum resolve isso (clamp só reposiciona, não redimensiona). Os botões em si (`.kortex-menu-btn`, 28×28px) e os swatches de cor (22×22px) também estavam abaixo do alvo de toque recomendado.

Corrigido com `@media (max-width: 1023px)` em `EditorBubbleMenu.vue`: a bubble menu ganha `max-width: calc(100vw - 24px)` e `flex-wrap: wrap` (em vez de vazar da tela, quebra em mais de uma linha — funciona sem nenhuma mudança no JS de clamp, porque ele já mede o retângulo real depois de renderizado, então uma bubble mais alta por causa do wrap continua sendo posicionada corretamente); botões sobem de 28px pra 40px, swatches de cor de 22px pra 32px. Também dei um empurrão menor nos itens de lista do menu de menção (`EditorMentionMenu.vue`) e do menu de wikilink `[[` (`.kortex-wiki-item` em `NotionStyleEditor.vue`), que estavam abaixo de ~44px de altura — sem mudar largura (240-280px já cabem em qualquer celular comum). Menu "/" (slash) e o de emoji não precisaram de ajuste — já tinham altura de linha adequada.

**✅ Corrigido — linha de pasta sem `w-full`, e barra de ações do topo pequena demais.** Sétima rodada, dois achados na mesma captura de tela:
- A linha de **pasta** em `NotesList.vue` nunca tinha `w-full` na classe (só a linha de **nota**, ao lado, já tinha) — inconsistência real entre os dois tipos de linha, corrigida adicionando `w-full` à linha de pasta também, igualando o comportamento.
- A barra de ações do cabeçalho da sidebar (nova nota, nova pasta, ordenar, buscar, grafo, lixeira — em `index.vue`, não em `NotesList.vue`) continuava com `size="xs"` fixo, do mesmo jeito que os botões de `NotesList.vue` estavam antes da quinta rodada. Corrigido com o mesmo `isNotesMobileLayout` já usado no resto da página: os 6 botões passam pra `size="lg"` no mobile, a barra ganha mais altura (`h-9` → `h-14`) e mais espaçamento entre os ícones (`gap-1` → `gap-2`). O skeleton de carregamento inicial (quarta rodada) também foi atualizado pra bater com essas novas medidas no mobile, evitando um salto de layout quando o conteúdo real substitui o skeleton.
- **Follow-up da mesma barra**: o container externo tinha `flex items-center` mas nunca `justify-center` — o grupo de ícones ficava colado à esquerda (contra o `px-3`) em vez de centralizado no cabeçalho, em desktop e mobile. Adicionado `justify-center` no container externo, sem depender de `isNotesMobileLayout` (o pedido foi explícito: centralizado "em qualquer uma, sendo mobile ou desktop").
- **Follow-up das linhas de pasta/nota**: o botão "..." ficava colado na borda direita da tela — as linhas só tinham `pr-1` (4px), pouco pra um botão de 40px de alvo de toque (da quinta rodada) ficar confortável de tocar sem passar do dedo pra fora da área útil. No mobile, `pr-1` vira `pr-3` (12px) nas duas linhas (pasta e nota).

**🔧 Refatoração — trocado `useMediaQuery` (JS) por classes responsivas do Tailwind onde é só estilo.** Oitava rodada, a pedido: as rodadas 1-7 acima usaram `isMobile`/`isNotesMobileLayout` (`useMediaQuery('(max-width: 1023px)')` da VueUse) pra decidir classes CSS via `:class="cond ? 'a' : 'b'"`. Isso funciona, mas depende de JS reativo pra algo que é puramente apresentacional — desnecessário quando o Tailwind já resolve a mesma coisa em CSS puro, sem nenhuma dependência de timing de hidratação/mount.

Investigação sobre a suspeita de que `useMediaQuery` "trava" no F5: li o código-fonte da lib (`@vueuse/core@14.3.0`) — o mecanismo de `ssrWidth` que poderia causar um valor "chutado" por um tick não está configurado neste projeto (nem por `provideSSRWidth`, nem pelo plugin SSR do `@vueuse/nuxt`), então a leitura deveria ser síncrona no client, sem flash. **Não confirmei um bug real no `useMediaQuery` em si** — mas isso não muda a conclusão prática: pra decisão puramente de estilo, CSS puro (`lg:`) é estruturalmente mais robusto que JS reativo (zero dependência de timing, zero possibilidade de flash, sempre), então vale a troca de qualquer forma. Achado interessante e não relacionado no caminho: o mesmo plugin SSR do `@vueuse/nuxt` registra um handler customizado que faz o `useStorage` desta app usar **cookies do Nuxt** por baixo dos panos em vez de `localStorage` puro — relevante pro item 11 (ícone de ordenação), ainda não totalmente investigado.

O que foi convertido pra `lg:` (breakpoint 1024px do Tailwind bate exatamente com o `max-width: 1023px` usado nas rodadas anteriores) em `NotesList.vue`, `NoteEditor.vue` e `index.vue`: padding, `gap`, tamanho de fonte/ícone, altura de linha, visibilidade do botão "..." (`opacity-100 lg:opacity-0 lg:group-hover:opacity-100`), breadcrumb e nav de histórico (viram `hidden lg:flex`/`hidden lg:contents` em vez de `v-if`), a alça de redimensionar a sidebar (`hidden lg:block` — inerte quando escondida, não precisa de guarda em JS), e a largura da sidebar (`w-full lg:w-(--notes-sidebar-width)`, com a largura customizável do usuário passada via CSS custom property em vez de `:style` condicional).

**O que continua em JS (`isNotesMobileLayout`), por não ter equivalente em CSS puro**:
- A prop `size` do `UButton` (Nuxt UI) — é uma prop de componente que controla classes internas, não uma classe que dá pra sobrepor de fora com `lg:`.
- Qual painel/view é *montado* (sidebar vs. área principal, uma nota vs. grafo/lixeira) — isso decide o que existe no DOM, não só o que aparece; esconder com CSS em vez de `v-if` significaria manter o editor Tiptap e a lista de notas montados ao mesmo tempo, sempre, o que é um custo de performance real, não só estético.
- O painel direito (Sumário/Propriedades) via `AnimatePresence`/`motion.div` — a animação de entrada/saída do `motion-v` depende do elemento realmente montar/desmontar via `v-if`.
- O `UDrawer` do mobile — é um componente mais pesado (portal, gesto de arraste) com sua própria lógica de estado; não faz sentido montá-lo sempre só pra escondê-lo com CSS no desktop.

**Ainda não auditado**: os fixes desta seção só foram validados por leitura de código (sem `pnpm dev`), e a lixeira em viewport de celular ainda não foi olhada. Ver item 10 (seção 3, P2).

### 1.2 Editor de texto

**a. Menus flutuantes sem flip/clamp perto da borda da tela** — lacuna já documentada (`docs/notes/1.NOTES.md:377`) e confirmada em código: nenhum menu flutuante do editor calcula posição contra os limites da viewport. Afeta `EditorBubbleMenu.vue:118` (bubble de seleção), `NotionStyleEditor.vue:842-845` (`bubblePos`), `:1486`/`:274-282` (`slashPos`, menu "/"), `:729` (`mentionPos`, menção/wikilink), `EditorSlashMenu.vue` e `EditorMentionMenu.vue`. Todos usam `rect.left`/`rect.top`/`rect.bottom + 6` cru, sem checar `window.innerWidth`/`innerHeight`. É o item de maior impacto de uso da lista — "não consigo selecionar nada" quando o menu abre perto do fim da tela é um bloqueio real, não só estética.

**b. Gap entre as cores da paleta** — `EditorBubbleMenu.vue`, container `.kortex-bubble` (linha 361-366) define `gap: 1px` pra **todos** os botões da barra (bold, itálico, etc.), e os swatches de cor (view `color`, linhas 192-223, classe `.kortex-bubble-color-swatch`, linhas 443-461) herdam esse mesmo gap — nenhum espaçamento próprio pra círculos coloridos lado a lado, que fica visualmente colado.

**c. Remover Labels "Cor do texto"/"Destaque"** — `EditorBubbleMenu.vue:202-204`:
```vue
<p class="kortex-bubble-section-label">
  {{ colorMode === 'text' ? 'Cor do texto' : 'Destaque' }}
</p>
```
(o texto real é "Cor do texto", não "Cor de Texto" — mesma peça, diferença só de capitalização na descrição do usuário).

**d. "Limpar formatação" — existe, mas está escondida, não ausente.** `EditorBubbleMenu.vue:98-100` (`clearFormatting()`, chama `clearNodes().unsetAllMarks()`) e botão em `:310-317` — só ícone (`i-lucide-remove-formatting`), `title` HTML nativo em vez de `UTooltip` (sem popup estilizado consistente com o resto do editor), penúltimo botão da barra, e só aparece na bubble menu de **seleção de texto** (não existe no menu "/" nem no menu de bloco). Some das duas coisas: sem label + posição pouco óbvia + sujeita ao bug 1.2a se a bubble estiver cortada na borda = fácil de nunca notar que existe.

### 1.3 Delay ao navegar com nota não salva

`app/pages/app/notes/index.vue:96-100`:
```ts
onBeforeRouteLeave(async () => {
  if (noteEditorRef.value?.isUnsaved()) {
    await noteEditorRef.value.doSave()
  }
})
```
`doSave` → `NoteEditor.vue`'s `saveNote()` → `props.updateNote(..., { silent: true })` → `useNotes.ts`'s `updateNote` roda via `runOptimisticAction` (`useOptimisticAction.ts:74-98`): a UI já atualiza local e otimisticamente, mas a função só **resolve** depois do `await` da requisição `PUT /api/notes/:id` completar de verdade contra o servidor. `onBeforeRouteLeave` fica bloqueado nesse `await` — é exatamente esse round-trip de rede que trava a navegação, mesmo a UI já "parecendo" salva.

### 1.4 Falta de log técnico em falhas de carregamento

A string exata "Falha ao carregar as notas" não existe em lugar nenhum do código — só na lista original. As mensagens reais mais próximas em `useNotes.ts` são `'Falha ao carregar nota.'` (:462), `'Falha ao carregar lista de acesso.'` (:537), `'Falha ao carregar a lixeira.'` (:911). Mais grave: **a listagem principal de notas (`useFetch('/api/notes', ...)`, linhas 64-80) não tem nenhum tratamento de erro** — não há `watch` sobre `error`/`status`, então uma falha aí não gera nem toast nem log, falha 100% silenciosa. `fetchNoteDetail` (:445-467) tem um `catch { ... }` que descarta a variável do erro antes de mostrar o toast — de novo, zero log técnico. De 16 blocos `catch` no arquivo, só 3 logam de fato (`linkNotes` :584, `unlinkNotes` :595, fila offline :1128, todos com `console.error`). O padrão pedido no item já existe no arquivo — só não é seguido consistentemente.

### 1.5 Lixeira — sem seleção múltipla nem "limpar tudo"

`NotesTrashView.vue` (158 linhas, lido por completo): zero estado de seleção, zero checkbox, só ações por item (`restore`/`permanent-delete`, um de cada vez, com modal de confirmação individual). Backend: `server/api/notes/trash/purge.post.ts` é só o purge automático (30 dias, protegido por `x-cron-secret`, acionado de fora, não pelo usuário) — não existe endpoint de bulk delete disparável pela UI.

### 1.6 Ícone de ordenação "Personalizado" — reproduz de verdade, causa raiz não confirmada

Atualização: **o usuário re-testou e confirmou que reproduz**, especificamente ao dar F5 na tela de notas (não ao trocar de ordenação dentro da sessão). A hipótese anterior ("já parece corrigido pelo commit `2759f9b`") estava incompleta — o código É logicamente correto (`noteSortOptions` inclui `'custom'`, `activeSortOption` acha a opção certa), mas isso não impediu o bug de reproduzir.

Investigação adicional, desta vez no código-fonte da própria lib (`node_modules/@vueuse/core@14.3.0`, função `useStorage`): confirmado que a leitura do `localStorage` é **síncrona**, feita no próprio `setup()` (sem `initOnMounted`), e que o serializer usado pra um valor default `string` é passthrough puro (`read: (v) => v`, `write: (v) => String(v)`) — não há JSON por trás que pudesse introduzir aspas ou qualquer corrupção. Ou seja, a hipótese de "flash de hidratação" e a de "valor gravado com aspas de uma versão antiga" foram ambas **descartadas** por leitura do código real da lib, não é suposição.

Sem conseguir reproduzir localmente (sem `pnpm dev`) e sem acesso ao `localStorage` real do usuário, não dá pra confirmar a causa raiz só por leitura estática dessa vez. Em vez de arriscar um fix especulativo, adicionado um `console.warn` de diagnóstico (`app/pages/app/notes/index.vue`, logo antes de `activeSortOption`) que loga o valor bruto de `notes-sort-mode` sempre que ele não bater com nenhuma opção conhecida — na próxima vez que reproduzir, o console vai mostrar o valor real gravado, o que fecha a investigação em vez de continuar chutando.

### 1.7 Purge automática da lixeira — invisível para o usuário

Confirmado: o texto da lixeira hoje (`NotesTrashView.vue:44-51`) diz só "Notas e pastas excluídas ficam aqui até serem restauradas ou excluídas permanentemente" — nenhuma menção aos 30 dias nem ao purge automático em nenhum lugar da UI, apesar de o comportamento existir de fato no backend (`purge.post.ts:6-10`, comentário explícito no código sobre a purga de 30 dias). Item de escopo pequeno e cravado — só precisa de um texto novo, junto do trabalho da seção 1.5.

### 1.8 Tipos de nota customizados (ex.: "Flow")

Estrutura atual (`app/types/notes.ts:3-9,22-28`): `NoteType` é um enum fixo com 5 valores (Note, Idea, Concept, Research, BookNote), cada um com `label`/`icon`/`color` em `NOTE_TYPE_META` — usado em pelo menos `NotesTrashView.vue`, `NoteEditor.vue` (menu de troca de tipo) e `NotePropertiesPanel.vue` (ver `docs/notes/PLANO_TABELA_CONTEUDO.md`, já ganhou ícone recentemente). Adicionar um tipo novo *dentro desse modelo* (mais um valor de enum + entrada em `NOTE_TYPE_META`) é trivial. O que o pedido realmente sugere — "Flow" como algo estruturalmente diferente de uma nota comum (talvez um formato de conteúdo próprio, não só um rótulo/ícone diferente) — é outra categoria de trabalho, que exige decisão de produto antes de qualquer código (ver seção 3, P2).

### 1.9 Analytics para notas compartilhadas (opt-in por nota)

Feature nova do zero — confirmado que não existe nenhum rastreamento de visualização hoje: `server/api/share/[token].get.ts` (leitura pública de nota compartilhada) não grava nada; nenhuma migration de compartilhamento (`20260812050000_notes_share_grants.sql`, `20260812060000_notes_notes_sharing_rls.sql`, `20260812055000_get_user_id_by_email_function.sql`) tem coluna de contagem/analytics; `NoteShare`/`PublicNote` (`app/types/notes.ts:88-97,115-122`) não têm campo de analytics. Existe `usePostHog.ts` no projeto (analytics de produto em geral), mas sem nenhuma integração com notas compartilhadas. Sem base de código reaproveitável — é desenho + implementação do zero.

### 1.10 Botão "Compartilhar" com label

`NoteEditor.vue:601-610` — o `UButton` do botão de compartilhar tem `Compartilhar` como texto no slot padrão, sem `UTooltip` ao redor. Os dois botões vizinhos, "Sumário" e "Propriedades" (adicionados em `docs/notes/PLANO_TABELA_CONTEUDO.md`, `:576-591` e `:592-600`), **já seguem exatamente o padrão ícone-only + `UTooltip`** que este item pede — é literalmente alinhar o botão de Compartilhar ao padrão que os dois vizinhos dele já usam.

---

## 2. Pra quem isso serve, e quando

A lista mistura três naturezas de trabalho bem diferentes, e o plano separa por isso, não pela ordem em que foram anotadas:

- **Polimento rápido, zero ambiguidade** (1.2b, 1.2c, 1.10): a correção já está clara no próprio pedido, é só aplicar.
- **Bugs reais com causa raiz já mapeada** (1.2a, 1.2d, 1.3, 1.4, 1.5, 1.7): sabemos exatamente o que está errado e onde, falta só o trabalho de implementação (variando de trivial a moderado).
- **Pedido de verificação, não de correção** (1.1, 1.6): não há bug confirmado no código atual — o próximo passo é testar, não codar.
- **Features novas, exigem decisão de produto antes de código** (1.8 no sentido "Flow" estrutural, 1.9): não encaixam em "bug fix", precisam de escopo definido primeiro.

---

## 3. Roadmap sugerido (por prioridade)

Mesmo formato usado em `docs/notes/ANALISE_EDITOR_MERCADO.md` e `docs/notifications/PLANO_NOTIFICACOES.md`: cada item abaixo está ❌ **Faltando** — nada deste roadmap foi implementado ainda.

### P0 — Polimento rápido, sem ambiguidade, sem dependência de nada — ✅ concluído

1. ✅ OK **Remover label do botão "Compartilhar"** — `NoteEditor.vue` agora envolve o `UButton` num `UTooltip text="Compartilhar"`, ícone-only, mesmo padrão dos vizinhos "Sumário"/"Propriedades". (1.10)
2. ✅ OK **Gap entre swatches de cor** — swatches movidos pra um wrapper próprio (`.kortex-bubble-color-swatches`, `gap: 6px`) em `EditorBubbleMenu.vue`, em vez de herdar o `gap: 1px` de `.kortex-bubble`. (1.2b)
3. ✅ OK **Remover labels "Cor do texto"/"Destaque"** — o `<p class="kortex-bubble-section-label">` condicional foi removido da view `color`. (1.2c)
4. ✅ **Dar visibilidade ao "Limpar formatação"** — o botão agora usa `UTooltip text="Limpar formatação"` em vez do `title` HTML nativo, consistente com o resto do app (a função em si já funcionava, só a descoberta era ruim). (1.2d)
5. ✅ **Logs técnicos consistentes em `useNotes.ts`** — todos os `catch {}` mudos viraram `catch (err) { console.error(...) }` (fetchNoteDetail, regenerateShareLink, fetchNoteShares, addNoteShare, updateNoteShare, removeNoteShare, fetchTrash, restoreNote, restoreFolder, permanentlyDeleteNote, permanentlyDeleteFolder, busca). Mais importante: `useOptimisticAction.ts` — usado por `createNote`/`updateNote`/`createTag`/etc., a maior parte das mutações do arquivo — agora loga o erro real antes de mostrar o toast, não só no caminho `silent`. E a listagem principal (`useFetch('/api/notes', ...)`), que antes não tinha nenhum tratamento de erro, ganhou um `watch` sobre `error` que loga e mostra toast "Falha ao carregar as notas" — a mensagem exata do pedido original, agora real. (1.4)
6. ✅ OK **Mensagem sobre purge automática na lixeira** — `NotesTrashView.vue` agora informa: "itens com mais de 30 dias na lixeira são removidos automaticamente". (1.7)

### P1 — Bugs reais, causa raiz mapeada, trabalho de implementação maior — ✅ concluído

7. ✅ OK **Flip/clamp para menus flutuantes do editor** — novo utilitário compartilhado `app/utils/clamp-menu-position.ts` (`clampMenuPosition`), aplicado nos **7** pontos de posicionamento afetados (mais do que os ~5 estimados originalmente — a investigação achou dois menus a mais, emoji e link preview, que tinham exatamente o mesmo problema): bubble menu de seleção (`bubblePos`), menu "/" (`slashPos`, três sites — `onStart`/`onUpdate` da sugestão do Tiptap e o botão "+" via `openInsertMenu`), menu de menção (`mentionPos`), menu de wikilink `[[` (`wikiPos`), menu de emoji (`emojiPos`) e menu de preview de link (`linkPreviewPos`). Cada menu-componente (`EditorBubbleMenu`, `EditorSlashMenu`, `EditorMentionMenu`, `EditorEmojiMenu`) agora expõe seu elemento raiz (`defineExpose({ el: ... })`); a posição é corrigida num `nextTick()` logo após a posição "ingênua" ser aplicada, medindo o tamanho real já renderizado (que varia com o conteúdo) em vez de supor uma largura/altura fixa. Menus "top-left" (a maioria) são clampados nos dois eixos; a bubble menu ("bottom-center", centralizada e crescendo pra cima via `transform`) é clampada horizontalmente e, verticalmente, empurrada pra baixo o suficiente pra nunca renderizar cortada no topo — **clamp, não flip** (o próprio item já permitia essa alternativa mais simples). `EditorBlockMenu.vue` ficou de fora de propósito, como já registrado no diagnóstico original — é um caso diferente (âncora num bloco visível, não posição livre de cursor). (1.2a)
8. ✅ OK **Delay de navegação eliminado, com rede de segurança pra falha tardia** — `onBeforeRouteLeave` e `saveCurrentNoteIfNeeded` (usado por `navigateTo`/`goBack`/`goForward`) não esperam mais o `PUT /api/notes/:id` terminar antes de deixar o usuário seguir em frente (fire-and-forget). Pra cobrir o risco já identificado ("o que fazer se o save falhar depois que o usuário já saiu"): `NoteEditor.vue`'s `saveNote()` ganhou uma opção `notifyOnFailure` que mostra um toast com o título da nota se o save falhar em background — e, mais importante, um guard contra uma race condition nova que só passou a existir por causa desta mudança: se o usuário trocar de nota **antes** do save anterior resolver, o código agora captura o `id`/título/conteúdo no início da função e só aplica o resultado (`saveStatus`, `lastSavedTitle`, sincronização de backlinks) se ainda estiver olhando pra mesma nota — sem isso, o sucesso de salvar a nota A poderia "vazar" e marcar a nota B (já carregada na tela) como salva sem ter salvo nada dela. (1.3)
9. ✅ OK **Lixeira: seleção múltipla + "esvaziar tudo"** — `NotesTrashView.vue` ganhou checkboxes por item, "selecionar todos", uma barra de ações em lote (restaurar/excluir selecionados) e um botão "Esvaziar lixeira" separado — os três fluxos (item único, seleção, lixeira inteira) reusam o mesmo modal de confirmação, que adapta a mensagem à quantidade. **Sem endpoint novo no server** — optou-se pela opção mais simples já prevista no item original: `restoreNote`/`restoreFolder`/`permanentlyDeleteNote`/`permanentlyDeleteFolder` (`useNotes.ts`) ganharam `options?: { silent?: boolean, skipRefresh?: boolean }`, e o handler de bulk em `index.vue` dispara todas as chamadas em paralelo (`Promise.all`) com `silent`+`skipRefresh`, fazendo um único refresh e um único toast de resumo ("N restaurados, M falharam") no final, em vez de um toast/refetch por item. (1.5, complementa 1.7 na mesma tela)

### P2 — Verificação (não fix) e features novas (exigem decisão de produto)

10. 🔶 **Auditoria mobile do módulo de Notas — parcial.** ✅ Achado #1 corrigido: sidebar + editor sem colapso no mobile, espremendo o editor a uma fatia ilegível (ver seção 1.1 pro detalhe da correção). ❌ Ainda faltam: bubble menu/menus flutuantes em dispositivo real (não só leitura de código), `NotesList.vue`, e a lixeira em viewport de celular. (1.1)
11. 🔶 **Ícone de ordenação "Personalizado" — reproduz no F5, causa raiz ainda não confirmada.** Código logicamente correto e a lib (`useStorage`) descartada como causa por leitura do código-fonte — mesmo assim reproduz. Diagnóstico (`console.warn`) adicionado em `index.vue`; falta reproduzir de novo com o DevTools aberto e checar o valor bruto de `notes-sort-mode` no `localStorage` (Application → Local Storage) no momento do bug. (1.6)
12. **Tipos de nota customizados além de rótulo/ícone (ex. "Flow")** — adicionar mais um valor a `NoteType`/`NOTE_TYPE_META` é trivial, mas não é isso que o pedido parece querer de verdade; precisa de uma decisão de produto sobre o que torna um "Flow" estruturalmente diferente de uma nota comum antes de qualquer código. (1.8)
13. **Analytics de notas compartilhadas, opt-in por nota** — feature nova do zero (schema, endpoint de tracking, UI de toggle por nota, UI de visualização dos dados) — nenhuma base de código reaproveitável hoje. Precisa de escopo (o que exatamente é "análise dos dados"? visualizações? tempo de leitura? origem?) antes de virar plano técnico. (1.9)

---

## 4. Critérios de aceite

**P0:**
- Botão "Compartilhar" no cabeçalho do editor mostra só o ícone, com tooltip "Compartilhar" ao passar o mouse — mesmo padrão visual dos botões "Sumário"/"Propriedades" ao lado.
- Os círculos de cor da bubble menu (texto e destaque) têm espaçamento visivelmente maior que os ícones de formatação da mesma barra.
- Abrir a view de cor da bubble menu não mostra mais nenhum texto "Cor do texto"/"Destaque" acima dos swatches.
- O botão "Limpar formatação" tem um `UTooltip` visível ao passar o mouse.
- Forçar uma falha na listagem principal de notas (ex. desligando a rede) produz um `console.error` com informação útil, não um silêncio total.
- A tela da lixeira menciona explicitamente que itens excluídos há mais de 30 dias são removidos automaticamente.

**P1 (implementado):**
- ✅ Abrir o menu "/" (slash), a bubble menu de seleção, o menu de menção/wikilink, o de emoji ou o de preview de link perto da borda inferior/direita/superior da tela mantém todas as opções clicáveis (o menu se ajusta, não corta).
- ✅ Navegar para outra nota (sidebar, voltar/avançar, ou sair da página) logo após editar o título/conteúdo não espera a rede — a troca acontece na hora. Se o save em background falhar, um toast avisa que as alterações podem não ter sido salvas.
- ✅ Selecionar múltiplos itens na lixeira e escolher restaurar/excluir aplica a ação em todos os selecionados (um resumo só, não um toast por item); "Esvaziar lixeira" remove tudo de uma vez, com confirmação mostrando a quantidade.

---

## 5. Riscos

**Baixo, na maior parte.** Os itens de P0 são polimento visual/CSS e logging — não alteram fluxo de dados, risco mínimo. Em P1, dois itens merecem atenção:

- **Flip/clamp de menus (1.2a/item 7)**: risco baixo-médio — é lógica nova, mas isolada por menu, e testável visualmente sem afetar dado nenhum. Vale testar em telas realmente pequenas (não só reduzir a janela do desktop) antes de considerar pronto.
- **Delay de navegação (1.3/item 8)**: **risco médio, o único item deste plano que pode perder dado do usuário se malfeito.** Navegar antes do save completar significa que, se o `PUT` falhar depois que o usuário já trocou de nota, não há mais tela nenhuma mostrando "erro ao salvar, tente de novo" pra ele ver — o conteúdo editado pode simplesmente sumir sem aviso. Qualquer implementação desse item precisa definir, antes de escrever código, o que acontece nesse caso de falha tardia (toast global que sobrevive à troca de nota? fila de retry? bloquear só quando `isOnline` for false, já que aí o offline-queue já existe?) — não é um ajuste de UX, é uma decisão de produto sobre tolerância a perda de dado.

---

## 6. Plano de testes manuais

P0 e P1 estão implementados e prontos pra validar — nenhum passo abaixo foi rodado ainda (nenhum `pnpm dev` durante a implementação). P2 continua sem código, então os itens que dependem dele (nenhum abaixo) não se aplicam ainda.

1. Abra o editor de uma nota, selecione um trecho de texto, clique no botão de cor. **Esperado:** os círculos de cor têm espaçamento visivelmente maior que os ícones de bold/itálico da mesma barra, e nenhum texto "Cor do texto" aparece acima deles.
2. Repita o passo 1 escolhendo Destaque em vez de Cor do texto. **Esperado:** mesmo espaçamento, nenhum texto "Destaque" visível.
3. Com texto selecionado e formatado (negrito, cor, etc.), passe o mouse sobre o ícone de borracha na bubble menu. **Esperado:** aparece um tooltip estilizado "Limpar formatação"; clicar remove toda a formatação do trecho selecionado.
4. Olhe o botão de compartilhar no cabeçalho do editor. **Esperado:** só ícone, sem texto "Compartilhar" ao lado; passar o mouse mostra o tooltip.
5. Digite `/` numa nota bem perto do final da tela (role até o fim, digite lá). **Esperado:** o menu de blocos abre inteiro, visível e clicável — nunca cortado pela borda da janela. Repita clicando no botão "+" (não só digitando `/`).
6. Selecione um texto bem perto da borda direita, inferior ou superior da tela. **Esperado:** a bubble menu aparece inteira, sem sair da viewport (perto do topo, ela desce o suficiente pra caber, em vez de subir pra fora da tela).
7. Digite `@`, `[[`, abra o seletor de emoji (ícone), ou o de preview de link, todos perto da borda da tela. **Esperado:** mesmo comportamento nos quatro — menu sempre inteiro e clicável.
8. Edite o título de uma nota, sem esperar o indicador de "salvo", e troque imediatamente para outra nota pela sidebar (ou clique em voltar/avançar). **Esperado:** a troca acontece na hora, sem o delay de antes.
9. Force uma falha de rede (offline no DevTools) bem no momento de trocar de nota com edição pendente. **Esperado:** um toast avisa que a alteração pode não ter sido salva — não é permitido que ela simplesmente desapareça sem nenhum sinal. Depois, reabra a nota que ficou pra trás e confirme se o conteúdo antigo (sem a edição) ainda está lá, sem ter sido sobrescrito por engano na nota errada.
10. Force uma falha na listagem principal de notas (bloqueie `/api/notes` no DevTools) e abra o console. **Esperado:** aparece um `console.error` com informação sobre a falha.
11. Vá até a lixeira. **Esperado:** um texto visível explica que itens ficam lá por até 30 dias antes de serem removidos automaticamente.
12. Selecione duas ou mais notas na lixeira (checkbox) e clique em restaurar. **Esperado:** todas voltam de uma vez, não uma por vez.
13. Repita o passo 12 com excluir permanentemente. **Esperado:** todas as selecionadas são removidas, com uma única confirmação.
14. Clique em "Esvaziar lixeira" com itens presentes. **Esperado:** confirmação clara do que vai acontecer (quantos itens, ação irreversível) antes de executar; depois de confirmar, a lixeira fica vazia.
15. Troque a ordenação da lista de notas para "Personalizado", saia da tela e volte. **Esperado:** o ícone do botão de ordenação continua mostrando o ícone de "Personalizado", não o de "Mais recentes".

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, e qualquer erro no console do navegador.
