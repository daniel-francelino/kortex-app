# Plano — Página de Agendamento completa (redesenho UX/UI)

Este documento especifica, em detalhe de tela e de campo, como evoluir o módulo de **Agendamento** (`/app/scheduling`) para uma experiência completa de configuração de páginas de agendamento — cobrindo a lista de páginas, o fluxo de criação, o editor completo e a página pública de reserva. A referência de UX são os prints do fluxo do **Cal.com** (onboarding de perfil, modal de novo tipo de reunião, e o editor em abas: Configuração de eventos · Disponibilidade · Formulário de reserva · Confirmação · Aparência · Pagamentos · Limites e intervalos · Recorrente · Reagendar e cancelar · Privacidade e segurança · Apps).

> Pré-requisito de leitura: [`PLANO_LINK_AGENDAMENTO.md`](./PLANO_LINK_AGENDAMENTO.md). Este documento parte do que **já foi implementado** (Fases 1–4 daquele plano, confirmadas no código) e especifica a próxima geração da experiência. Nenhuma mudança de código foi feita ao gerar este documento.

---

## 1. Diagnóstico do estado atual

### 1.1 O que já existe e funciona

Base sólida, Fases 1–4 do plano original completas: múltiplas páginas por usuário, disponibilidade semanal com várias janelas por dia, buffers, incremento de horário, antecedência mín./máx., limite de reservas/dia, perguntas customizadas, cálculo de slots livres com fuso do convidado, reserva pública em 3 passos com revalidação anti-corrida, e gerenciamento (reagendar/cancelar) pelo convidado via link único.

### 1.2 Problemas de UX/UI hoje

1. **Formulário-parede num modal.** Criação e edição usam o mesmo `UModal` com ~15 campos empilhados e scroll interno (`SchedulingPageCreateModal.vue`, 423 linhas, `max-h-[70vh]` na linha 215). Não há agrupamento visual por tema, o botão "Criar página" fica fora da área visível na maior parte do tempo, e em mobile a experiência é de rolar um túnel de campos.
2. **Criar exige decidir tudo de uma vez.** O usuário que só quer "um link de reunião de 30 min" enfrenta buffers, incrementos e antecedências antes de ver o link existir. O Cal.com pede só Título + URL + Duração e joga o resto para o editor.
3. **Lista pobre.** O card (`scheduling.vue:89-148`) mostra só título, "Inativa", duração e o link. Sem cor de identificação, sem contagem de reservas, sem pausar/retomar (a API já aceita `isActive` via `[id].patch.ts`, mas não há toggle), sem duplicar, sem pré-visualizar.
4. **Bug real:** pergunta do tipo "Seleção" não tem campo para digitar as opções (`SchedulingPageCreateModal.vue:379-401` só renderiza label/tipo/obrigatória/remover). O modelo já suporta (`SchedulingQuestion.options: string[] | null`, `types/scheduling.ts:43`) e a página pública já renderiza `USelect` com `q.options` (`agendar/[token].vue:250-256`) — mas as opções nunca são preenchidas, então toda pergunta "Seleção" nasce quebrada.
5. **Bug menor herdado:** `capitalize` CSS na data selecionada da página pública (`agendar/[token].vue:193`) — mesmo defeito já corrigido na Agenda (title-case em "De Agosto"); aplicar o mesmo fix (`capitalizeFirst` só na primeira letra).

### 1.3 O que não existe em lugar nenhum (nem UI, nem tipo, nem banco)

Confirmado contra `types/scheduling.ts:47-70` e o schema das migrations:

| Recurso | Status | Tratado em |
| --- | --- | --- |
| Slug/URL amigável | ❌ (decisão deliberada da Fase 1: token opaco) | Fora desta leva; evolução futura |
| Múltiplas durações por página | ❌ | §7.5 (plano à parte) |
| Confirmação manual do anfitrião | ❌ | §5.5 |
| Política de cancelamento/reagendamento configurável | ❌ | §5.5 |
| Motivo de cancelamento (pedir ao convidado) | ❌ | §5.5 |
| Cor/aparência da página | ❌ | §5.1 |
| Nome do evento no calendário (template) | ❌ (hoje o evento criado usa o título da página) | §5.5 |
| Perfil público do anfitrião (avatar, bio) | ❌ (só `hostName` de auth metadata) | §6.3 |
| Verificação de e-mail do convidado / e-mails em geral | ❌ (não há infra de e-mail no projeto — Fase 5 pendente) | dependência externa, ver §8 |
| Pagamentos, time/round-robin, reserva recorrente | ❌ (fora de escopo declarado no plano original) | não entram |

---

## 2. O que cada print do Cal.com ensina

| Print | Lição de UX a absorver |
| --- | --- |
| 1 — "Adicione seus detalhes" (avatar, nome, username, bio) | O anfitrião tem um **perfil público** que dá cara humana à página de reserva. Kortex hoje mostra só o nome em texto (`agendar/[token].vue:151-153`). → §6.3 |
| 2–3 — "Adicionar um novo tipo de reunião" | Criação pede **só Título, URL e Duração**; o slug é auto-gerado do título conforme se digita ("teste" → url "teste"); opções avançadas (round robin etc.) aparecem mas não bloqueiam. → §4 |
| 4 — Editor "Configuração de eventos" | **Header fixo**: voltar + nome + menu "···" + **Salvar sempre visível**. Abas horizontais roláveis. Campos por seção em cards com fundo distinto. → §5.0 |
| 5 — "Disponibilidade" | Toggle "horários otimizados" com explicação em texto corrido; resumo somente-leitura da grade semanal (dias riscados quando indisponíveis) + link "Editar disponibilidade"; **fuso horário visível** (Europe/Lisbon). → §5.2 |
| 6 — "Confirmação" | "Nome do evento no calendário" com template editável (`{Sche…}` variáveis); redirect pós-reserva; e-mail de resposta customizado. → §5.5 |
| 7–8 — "Aparência" | Cor do tipo de reunião **com aviso explícito de que não afeta o convidado**; layout padrão; toggles com título em negrito + descrição curta em texto muted — padrão consistente de "linha de configuração". → §5.1 e §5.6 |
| 9 — "Limites e intervalos" | Buffers antes/depois, aviso mínimo, intervalos de tempo, e limites (frequência, duração total, reservas futuras) — cada limite é um **toggle que revela campos** quando ligado, não campos sempre visíveis. → §5.4 |
| 10 — "Reagendar e cancelar" | Exigir motivo de cancelamento (com select "obrigatório apenas…"), desabilitar cancelamento, desativar reagendamento — de novo o padrão toggle + descrição. → §5.5 |
| 11 — "Privacidade e segurança" | Requer confirmação, verificação de e-mail do reservante, ocultar notas, links privados. → §5.6 |
| 12 — "Formulário de reserva" | Nome e E-mail são **fixos com badge "Obrigatório"**; demais perguntas têm toggle de exibição + badge (Obrigatório/Opcional/Esconder) + botão "Editar"; "+ Adicionar pergunta" no fim. → §5.3 |

**Padrão visual transversal do Cal.com a adotar:** a "linha de configuração" — título curto em negrito, descrição de 1–2 linhas em texto muted, controle (toggle/select) à direita, separador entre linhas. É barato de construir com Nuxt UI (`USwitch` + slot de descrição) e resolve a sensação de "parede de campos".

---

## 3. Arquitetura de navegação proposta

```
/app/scheduling                     → Lista de páginas (existente, redesenhada — §6.1)
/app/scheduling/[id]                → Editor completo em abas (NOVO — §5)
/app/scheduling-bookings/[pageId]   → Reservas da página (existente; ganha filtro "Pendentes" se §5.5 for feito)
/agendar/[token]                    → Página pública (existente, polimentos — §6.2)
/agendar/gerenciar/[manageToken]    → Gerenciar reserva (existente; §5.5 esconde ações desabilitadas)
```

- O **modal de criação rápida** (§4) continua sendo modal — mas encolhe para 3 campos e, ao criar, redireciona para `/app/scheduling/[id]`.
- O **editor deixa de ser modal** e vira rota própria. Motivos: o formulário é grande demais para modal (já é hoje); rota permite deep-link por aba (`?tab=disponibilidade`); no mobile uma página cheia com header fixo é muito superior a um modal com scroll interno; e o padrão já existe no projeto (rotas aninhadas em `settings/`, abas com `UTabs` em hábitos/metas/assinatura).
- Navegação mobile: `/app/scheduling` já registra as abas contextuais Dia/Semana/Mês/Link no `MobileBottomNav` (feito nesta frente de trabalho). O editor `/app/scheduling/[id]` **não** registra abas contextuais — a barra inferior some naturalmente (fallback global) e o foco fica no header fixo do editor.

---

## 4. Criação rápida (modal novo, substitui o atual no caminho "criar")

### 4.1 Wireframe

```
┌─────────────────────────────────────────┐
│  Nova página de agendamento         ✕   │
├─────────────────────────────────────────┤
│  Título                                 │
│  ┌───────────────────────────────────┐  │
│  │ Ex.: Reunião de 30 minutos        │  │
│  └───────────────────────────────────┘  │
│                                         │
│  Duração                                │
│  ┌──────────────┐                       │
│  │ 30       min │  (15 · 30 · 45 · 60)  │
│  └──────────────┘   ← chips de atalho   │
│                                         │
│  Calendário                             │
│  ┌───────────────────────────────────┐  │
│  │ ● Pessoal                      ▾  │  │
│  └───────────────────────────────────┘  │
│                                         │
│         [ Cancelar ]  [ Continuar → ]   │
└─────────────────────────────────────────┘
```

### 4.2 Especificação

| Campo | Componente | Padrão | Regras |
| --- | --- | --- | --- |
| Título | `UInput`, autofocus | vazio | obrigatório, 1–200 chars (reusa o Zod atual) |
| Duração | `UInputNumber` + 4 chips (`UButton` size xs, variant soft) de atalho 15/30/45/60 | 30 | 5–480; clicar num chip preenche o número |
| Calendário | `USelect` com dot de cor do calendário | primeiro calendário do usuário (comportamento do `resetForm()` atual, linha 69) | obrigatório; se o usuário só tem 1 calendário, **ocultar o campo** e usar direto |

- Botão primário: **"Continuar"** (não "Criar página") — comunica que haverá refinamento depois.
- Ao submeter: chama `createSchedulingPage` com os demais defaults atuais do `resetForm()` (`SchedulingPageCreateModal.vue:66-83`: local `VideoLink`, seg–sex 09:00–18:00, buffers 0, incremento 15, antecedência mín. 4 h / máx. 60 dias, sem perguntas) e navega para `/app/scheduling/[id]` do registro criado.
- Toast de sucesso: "Página criada — ajuste os detalhes e compartilhe o link." (o link já existe neste momento; o editor o exibe no header, §5.0).
- O componente atual `SchedulingPageCreateModal.vue` é aposentado gradualmente: primeiro o caminho de criação migra para este modal novo; o de edição migra para o editor (§5); ao final o arquivo é removido.

---

## 5. Editor completo — `/app/scheduling/[id]`

### 5.0 Estrutura da tela

**Desktop (≥ lg):**

```
┌────────────────────────────────────────────────────────────────────┐
│ ← │ Reunião de 30 minutos ✎        agendar/a1b2c3… [copiar] │ ··· │ [ Salvar ] │  ← header fixo
├────────────────────────────────────────────────────────────────────┤
│  Evento │ Disponibilidade │ Formulário │ Limites │ Políticas │ Privacidade  │  ← UTabs
├────────────────────────────────────────────────────────────────────┤
│                                                                    │
│   (conteúdo da aba ativa — largura máx. ~672px, centralizado,      │
│    seções em cards `UCard` com espaçamento generoso)               │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Mobile (< lg), fiel aos prints 4–11 do Cal.com:**

```
┌──────────────────────────────────┐
│ ←  Reunião de 30 min   ··· [Salvar] │  ← header fixo (sticky top)
├──────────────────────────────────┤
│ (Evento) (Disponibilidade) (For… →│  ← pills roláveis horizontalmente,
├──────────────────────────────────┤     scrollbar oculta, fade na borda
│  conteúdo da aba, 1 coluna       │
│  …                               │
└──────────────────────────────────┘
```

Elementos do header:
- **←** volta para `/app/scheduling` (com guarda de alterações não salvas, §5.7).
- **Nome editável inline**: clicar no nome (ou no ícone ✎) transforma em `UInput`; é o mesmo campo "Título" da aba Evento — editar num lugar reflete no outro.
- **Link público resumido + copiar** (desktop): mostra `agendar/{token}` truncado com botão de copiar — o usuário nunca precisa voltar à lista para pegar o link. No mobile este item vai para o menu "···".
- **Menu "···"** (`UDropdownMenu`): Pré-visualizar (abre `/agendar/[token]` em nova aba) · Copiar link · Duplicar página · Regenerar link (com `UModal` de confirmação — "o link antigo deixará de funcionar") · separador · Arquivar (vermelho, com confirmação).
- **Salvar**: primário, sempre visível. Desabilitado quando não há alterações; com badge/dot quando há (§5.7).
- Toggle **Ativa/Pausada** (`USwitch` com label) ao lado do Salvar no desktop, dentro do "···" no mobile — liga em `isActive`, salvando imediatamente (não espera o Salvar; é uma ação de estado, não de formulário).

### 5.1 Mapeamento de abas (11 do Cal.com → 6 no Kortex)

Não copiar a taxonomia inteira do Cal.com — várias abas dele teriam 1 toggle órfão no nosso escopo. Consolidação proposta, com rastreabilidade:

| Aba Kortex | Absorve do Cal.com | Racional |
| --- | --- | --- |
| **Evento** | Configuração de eventos + cor de "Aparência" | Identidade da página: o quê, onde, quanto tempo, que cor |
| **Disponibilidade** | Disponibilidade | Quando pode ser reservado |
| **Formulário** | Formulário de reserva | O que o convidado responde |
| **Limites** | Limites e intervalos | Proteções de agenda (buffers, incremento, antecedências, máx./dia) |
| **Políticas** | Confirmação + Reagendar e cancelar | Ciclo de vida da reserva depois de criada |
| **Privacidade** | Privacidade e segurança | Exposição de dados + zona de perigo |
| *(não entram)* | Pagamentos, Recorrente, Apps, Round-robin | Fora de escopo declarado no plano original |

Deep-link: `?tab=<slug-da-aba>`; a aba ativa sincroniza com a query (padrão já usado com `UTabs` no projeto).

### 5.2 Aba **Evento**

```
┌─ Detalhes ────────────────────────────────┐
│ Título          [Reunião de 30 minutos  ] │
│ Descrição       [textarea, 3 linhas     ] │
│                 "Aparece para o convidado  │
│                  no topo da página."       │
├─ Agendamento ─────────────────────────────┤
│ Calendário      [● Pessoal            ▾ ] │
│ Duração         [30] min                  │
├─ Local ───────────────────────────────────┤
│ Tipo            [🎥 Link de vídeo      ▾ ] │
│ (campo condicional pelo tipo — abaixo)    │
├─ Cor ─────────────────────────────────────┤
│ ○ ● ○ ○ ○ ○ ○ ○  (paleta fixa)            │
│ "Usada só para diferenciar suas páginas   │
│  na lista. O convidado não vê."           │
└───────────────────────────────────────────┘
```

- **Local condicional** (hoje o "Detalhe do local" é um texto genérico sempre visível, `SchedulingPageCreateModal.vue:254-256`): o campo de detalhe muda de rótulo/placeholder conforme `locationType` — `video_link`: "Link da chamada" (placeholder "https://meet.google.com/…", validar URL); `phone`: "Número de telefone"; `in_person`: "Endereço"; `custom`: "Instruções para o convidado". Mesmo campo `locationDetails` no banco, só UX.
- **Cor** (campo novo, §7): paleta fixa de ~8 cores (`URadioGroup` estilizado como círculos) — não color-picker livre, para manter consistência com o design system. Reutilizar a mesma paleta dos calendários da Agenda se existir.
- Título aqui e no header são o mesmo estado (single source of truth no formulário da página).

### 5.3 Aba **Disponibilidade**

```
┌─ Grade semanal ───────────────────────────────────────┐
│ ⏰ Fuso: America/Sao_Paulo (detectado)      [alterar ▾]│
│                                                       │
│ [✓] Seg   [09:00] – [18:00]   [+ janela]  [⧉ copiar…] │
│ [✓] Ter   [09:00] – [18:00]               [⧉]         │
│ [ ] Qua   Indisponível                                │
│ [✓] Qui   [09:00] – [12:00]   ✕                       │
│           [14:00] – [18:00]   ✕           [⧉]         │
│ …                                                     │
├─ Janela de reserva ───────────────────────────────────┤
│ Antecedência mínima      [4    ] [Horas ▾]            │
│ "Impede reservas de última hora."                     │
│ Reservas até             [60   ] dias no futuro       │
│ Máx. de reservas por dia [ativar ⭘]                   │
│   └ quando ligado: [5] por dia                        │
└───────────────────────────────────────────────────────┘
```

Melhorias sobre a grade atual (`SchedulingPageCreateModal.vue:259-308`):
- **Fuso horário visível e editável** (print 5 mostra "Europe/Lisbon" no rodapé do card). Hoje `timezone` é capturado silenciosamente (`Intl…resolvedOptions().timeZone`, linha 22) e o usuário nunca vê — se ele configurar a agenda viajando, salva o fuso errado sem saber. Expor como `USelect` searchable (mesma fonte `Intl.supportedValuesOf('timeZone')` já usada na página pública).
- **"Copiar horários para…"** (`⧉`): popover com checkboxes dos outros dias + "todos os dias úteis" — elimina o retrabalho de digitar a mesma janela 5×. Padrão consagrado do Cal.com/Google.
- Inputs de hora: manter `UInput type="time"` (nativo funciona bem no mobile); validar janela (`endTime > startTime`) e sobreposição de janelas no mesmo dia, com mensagem inline no card do dia (borda vermelha + texto), não só toast.
- **Antecedência mínima com unidade** (Horas/Dias, select) — hoje é só horas; guardar sempre em horas no banco (campo atual `minNoticeHours` serve), a unidade é só apresentação.
- **Máx. reservas/dia como toggle-que-revela** (padrão do print 9): desligado = `null` (sem limite). Hoje é um `UInputNumber` sempre visível com placeholder "Sem limite" — o toggle comunica melhor o estado.
- "Horários otimizados" do print 5 (slots que se encaixam entre reservas vs. horários fixos) **não entra**: nosso `slotIncrementMinutes` já cobre o caso comum e o algoritmo de slots otimizados é escopo grande com ganho marginal.

### 5.4 Aba **Formulário**

Fiel ao print 12 — lista de "linhas de pergunta", não inputs soltos:

```
┌─ Perguntas da reserva ────────────────────────────────┐
│ Seu nome            [Obrigatório]              Editar │
│ Name                                                  │
│ ───────────────────────────────────────────────────── │
│ Endereço de e-mail  [Obrigatório]     (⭘ on)   Editar │
│ Email                                                 │
│ ───────────────────────────────────────────────────── │
│ ⠿ De que se trata?  [Opcional]        (⭘ on)   Editar │
│   Texto curto                                         │
│ ───────────────────────────────────────────────────── │
│ ⠿ Como nos conheceu? [Opcional]       (⭘ off)  Editar │
│   Seleção · 3 opções                                  │
│ ───────────────────────────────────────────────────── │
│              [ + Adicionar pergunta ]                 │
└───────────────────────────────────────────────────────┘
```

- **Nome e E-mail aparecem como linhas fixas** no topo, badge "Obrigatório", sem toggle nem remover (hoje eles nem aparecem no formulário do anfitrião — só existem hardcoded na página pública, `agendar/[token].vue:236-241`; mostrar aqui dá a visão completa do que o convidado verá). Não viram registros no banco — são linhas estáticas da UI.
- Cada pergunta customizada: **handle de arrastar** (⠿, reordenar → `sortOrder`; usar `vuedraggable` ou HTML5 drag — decidir na implementação, o projeto ainda não tem lib de drag em listas), **badge** (Obrigatório/Opcional), **toggle de exibição** (pergunta pode ficar oculta sem ser deletada — campo novo `isHidden`, §7), e **Editar**.
- **Editar abre um `USlideover`** (não inline): Rótulo · Tipo (`Texto curto`/`Texto longo`/`Seleção`) · **Opções (quando tipo = Seleção)** — lista editável de opções com adicionar/remover/reordenar, mínimo 2 para salvar · Obrigatória (`USwitch`) · Placeholder opcional. **Isto corrige o bug do §1.2-4.**
- Excluir pergunta fica dentro do slideover (botão vermelho no rodapé), com confirmação se a página já tem reservas respondidas.

### 5.5 Abas **Limites** e **Políticas**

**Limites** (padrão do print 9 — toggle revela campos):

```
Antes do evento     [Sem intervalo ▾]   (0/5/10/15/30/45/60 min)
Após o evento       [Sem intervalo ▾]
Intervalo de horários [Usar a duração do evento ▾]  (ou 5–120 min)
```

- Buffers como `USelect` de valores discretos (como o Cal.com), não `UInputNumber` livre — menos decisões, zero estados inválidos. Banco continua em minutos (`bufferBeforeMinutes`/`bufferAfterMinutes`).
- "Intervalo de horários" = `slotIncrementMinutes`, com a opção padrão "Usar a duração do evento" (= slot de 30 em 30 para reunião de 30 min) — hoje o padrão é 15 fixo, o que gera sobreposição de oferta ("9:00, 9:15, 9:30…" para reuniões de 30 min) sem o usuário entender por quê.
- Antecedência mín./máx. e máx./dia ficam na aba Disponibilidade (§5.3) — são sobre *quando pode reservar*, não sobre *espaçamento*. (Divergência consciente do Cal.com, que os põe em Limites.)

**Políticas** (novos campos — §7; padrão visual do print 10):

```
Confirmação manual                              (⭘ off)
"Você aprova cada reserva antes de ela entrar
 na sua agenda."
   └ quando ligado: reservas nascem 'pending';
     tela de aprovação em /app/scheduling-bookings

Nome do evento na agenda                       [Editar]
"Como a reserva aparece no SEU calendário."
 Padrão: "{Título} com {Nome do convidado}"

Permitir cancelamento pelo convidado            (⭘ on)
   └ quando ligado: Antecedência mín. p/ cancelar [—/2h/24h ▾]
Permitir reagendamento pelo convidado           (⭘ on)
Exigir motivo do cancelamento                   (⭘ off)
```

- **Confirmação manual** (`requiresConfirmation`): estende `BookingStatus` com `pending`; a reserva pendente **bloqueia o slot** (decisão: igual Cal.com, evita dois pedidos concorrentes; se recusada, o slot volta). Aprovação/recusa em `/app/scheduling-bookings/[pageId]` com filtro "Pendentes" + ações. ⚠️ Sem e-mail (Fase 5 pendente), o convidado só descobre o resultado pelo link de gerenciamento — exibir aviso disso na própria linha de configuração ("Recomendado após ativar notificações por e-mail").
- **Nome do evento na agenda** (`calendarEventTitleTemplate`): template com variáveis `{titulo}`, `{convidado}`, `{email}` — resolve no `book.post.ts` ao criar o evento. Hoje o evento herda o título cru da página.
- **Cancelamento/reagendamento**: `cancellationEnabled`, `rescheduleEnabled`, `cancellationMinNoticeHours`, `cancellationReasonRequired`. Endpoints `manage/[manageToken]/cancel|reschedule.post.ts` passam a validar; a página `gerenciar/[manageToken].vue` esconde os botões desabilitados e, se motivo exigido, mostra `UTextarea` obrigatório no modal de cancelar (armazenar em `bookings.cancellationReason`, coluna nova).

### 5.6 Aba **Privacidade**

```
Ocultar detalhes na página de gerenciamento     (⭘ off)
"O convidado vê só data, hora e status — sem
 descrição nem local — ao abrir o link de
 gerenciamento."

┌─ Zona de perigo ──────────────────────────────┐
│ Regenerar link público            [Regenerar] │
│ "O link atual deixa de funcionar na hora."    │
│ Arquivar página                    [Arquivar] │
└───────────────────────────────────────────────┘
```

- Só 1 configuração nova de fato (`hideDetailsOnManagePage`) + a **zona de perigo**, que dá casa permanente a Regenerar link e Arquivar (hoje escondidos no menu da lista). Verificação de e-mail do reservante (print 11) fica registrada como futuro — depende da Fase 5 (e-mail).
- Manter a aba mesmo pequena: é o lugar natural de crescer (links com expiração, e-mail verification) sem reorganizar de novo.

### 5.7 Estado, salvamento e navegação

- **Um único estado de formulário** para todas as abas (as abas são apresentação, não formulários separados). Trocar de aba **não** salva nem descarta.
- **Dirty tracking**: snapshot do estado ao carregar; `isDirty` computado por comparação. Salvar habilita só quando dirty; após salvar com sucesso, snapshot atualiza e botão volta a desabilitado + toast "Alterações salvas".
- **Guarda de saída**: `onBeforeRouteLeave` com `UModal` "Descartar alterações?" (Continuar editando / Descartar) quando dirty. Cobre o botão ←, o back do browser e as abas contextuais do mobile.
- Exceções ao fluxo do Salvar (ações imediatas, com feedback próprio): toggle Ativa/Pausada, Regenerar link, Arquivar, Duplicar.
- **Validação por aba com indicador**: se o submit falhar por campo inválido em aba não visível, a aba culpada ganha um dot vermelho e o toast diz onde ("Corrija os campos em *Disponibilidade*"). Sem isso, abas + validação = erro invisível.
- Loading: skeleton do header + das linhas de configuração enquanto `fetchSchedulingPage(id)` resolve; 404 → redirect para a lista com toast.

---

## 6. As outras telas

### 6.1 Lista `/app/scheduling` (redesenho do card)

```
┌──────────────────────────────────────────────────┐
│ ▌ Reunião de 30 minutos              (⭘ on) ···  │   ▌ = barra na cor da página
│ ▌ 30 min · 🎥 Link de vídeo · 12 reservas        │
│ ▌ ┌ agendar/a1b2c3d4… ┐ [copiar] [abrir ↗]       │
└──────────────────────────────────────────────────┘
```

- **Barra de cor** à esquerda (campo novo `color`), **toggle Ativa/Pausada** direto no card (substitui a badge somente-leitura; chama `updateSchedulingPage(id, { isActive })` na hora), **contagem de reservas** (o endpoint de listagem passa a devolver `bookingsCount` confirmadas — agregação simples no `index.get.ts`), **tipo de local** com ícone (`LOCATION_TYPE_META` já existe, `types/scheduling.ts:22-27`), e **abrir ↗** (pré-visualização em nova aba).
- Clicar no **corpo do card** navega para o editor (`/app/scheduling/[id]`) — o card inteiro é o CTA de edição; menu "···" mantém: Duplicar · Ver reservas · Regenerar link · Arquivar.
- **Duplicar**: client-side — lê a página e chama `createSchedulingPage` com os mesmos campos + título com sufixo "(cópia)"; sem endpoint novo.
- Empty state atual (`scheduling.vue:81-87`) é bom; só trocar o CTA para abrir o modal de criação rápida novo.

### 6.2 Página pública `/agendar/[token]` — polimentos

Sem redesenho estrutural (o fluxo de 3 passos está correto); ajustes:

1. **Fix do `capitalize`** (linha 193) — primeira letra apenas, como na Agenda.
2. **Indicador de passo** discreto ("1 de 2" ou dots) — o convidado hoje não sabe quantas etapas faltam.
3. **Resumo fixo no passo 2**: o card com data/hora escolhida (linhas 227-234) vira sticky no topo em mobile, para não sumir ao rolar o formulário de perguntas.
4. **Confirmação com "adicionar ao calendário"**: botão que baixa `.ics` gerado client-side (data URI, sem endpoint) + link "Google Calendar" (URL `calendar.google.com/calendar/render?action=TEMPLATE&…`) — ausência sentida vs. qualquer concorrente. Guardar o aviso "salve este link" que já existe (não há e-mail).
5. **Skeletons de slots** enquanto `slotsLoading` (hoje o loading só aparece no month picker).
6. **Cabeçalho com avatar** do anfitrião quando §6.3 existir.
7. Respeitar novos campos de política: se `requiresConfirmation`, o passo 3 diz "Pedido enviado — aguardando confirmação de {anfitrião}" em vez de "Reserva confirmada!", com ícone de relógio em vez de check.

### 6.3 Perfil público do anfitrião (escopo pequeno, inspirado no print 1)

- Hoje: `hostName` resolvido de auth metadata no server (`schedule/[token].get.ts`). Proposta mínima: seção "Perfil de agendamento" em `/app/settings` com **Nome público** (default: nome da conta) e **Avatar** (reusar o avatar da conta se já existir em settings) — expostos em `PublicSchedulingPage` e renderizados no header da página pública. **Bio** fica como campo opcional de segunda leva.
- Não criar conceito de "username público" (isso é o projeto de slug, deliberadamente fora).

---

## 7. Mudanças de modelo e API (consolidado)

Cada campo novo exige: coluna (migration Supabase) → tipo em `types/scheduling.ts` → Zod nos endpoints (`index.post.ts`, `[id].patch.ts`) → normalização no composable (`useSchedulingPages.ts:32-58`) → UI.

| Campo novo (em `scheduling_pages`) | Tipo | Default | Aba |
| --- | --- | --- | --- |
| `color` | `text \| null` | `null` | Evento |
| `requires_confirmation` | `boolean` | `false` | Políticas |
| `calendar_event_title_template` | `text \| null` | `null` (= título da página) | Políticas |
| `cancellation_enabled` | `boolean` | `true` | Políticas |
| `reschedule_enabled` | `boolean` | `true` | Políticas |
| `cancellation_min_notice_hours` | `int \| null` | `null` | Políticas |
| `cancellation_reason_required` | `boolean` | `false` | Políticas |
| `hide_details_on_manage_page` | `boolean` | `false` | Privacidade |

| Outras mudanças | Onde |
| --- | --- |
| `scheduling_questions.is_hidden boolean default false` + expor `options` na UI (bug fix) | §5.4 |
| `bookings.cancellation_reason text \| null` | §5.5 |
| `BookingStatus` ganha `pending`; `book.post.ts` cria como `pending` quando `requires_confirmation`; endpoints novos `bookings/[id]/approve|decline.post.ts` (autenticados) | §5.5 |
| `index.get.ts` da listagem devolve `bookings_count` | §6.1 |
| `manage/[manageToken]/cancel|reschedule.post.ts` validam as políticas | §5.5 |
| `PublicSchedulingPage` ganha `hostAvatarUrl?`, `requiresConfirmation` | §6.2/§6.3 |

Todos os defaults preservam o comportamento atual — migration é aditiva, zero backfill além dos defaults.

### 7.5 Fora desta leva (registrar, não fazer)

- **Múltiplas durações** (`durations: number[]`): muda a página pública (seletor de duração antes dos slots) e o `computeAvailableSlots` (duração paramétrica). Plano à parte.
- **Slug/URL amigável**: continua sendo o projeto "handle público", fora.
- **Horários otimizados** (print 5): ganho marginal sobre `slotIncrementMinutes`.
- **E-mails** (confirmação, lembrete, aviso de aprovação): é a Fase 5 do plano original — pré-requisito real apenas para a confirmação manual (§5.5) render de ponta a ponta.

---

## 8. Ordem de execução

| # | Entrega | Escopo | Depende de |
| --- | --- | --- | --- |
| 1 | **Bug fixes**: opções da pergunta "Seleção" (no modal atual mesmo, antes do redesenho) + `capitalize` da página pública | pequeno | — |
| 2 | **Lista turbinada**: toggle ativa/pausada, duplicar, abrir ↗, `bookingsCount`, campo `color` + barra no card | pequeno/médio | migration do `color` |
| 3 | **Criação rápida** (modal 3 campos → redireciona pro editor) | pequeno | 4 (pode nascer redirecionando pro modal antigo em modo edição, mas o ideal é entregar junto com 4) |
| 4 | **Editor em abas** com os campos existentes reorganizados (abas Evento/Disponibilidade/Formulário/Limites) + header fixo + dirty tracking + melhorias de grade (fuso visível, copiar horários) | grande — o coração do plano | — |
| 5 | **Políticas** (cancelamento/reagendamento/motivo/template do título) | médio | 4, migrations |
| 6 | **Privacidade** + zona de perigo | pequeno | 4 |
| 7 | **Confirmação manual** (status `pending`, tela de aprovação) | médio | 4, idealmente Fase 5 (e-mail) |
| 8 | **Página pública**: indicador de passo, sticky, `.ics`/Google Calendar, skeletons | médio | — (paralelo) |
| 9 | **Perfil do anfitrião** (nome público + avatar) | pequeno | — (paralelo) |

Itens 1, 2, 8 e 9 são independentes entre si e do redesenho — podem ser distribuídos/paralelizados. O item 4 é o investimento estrutural: depois dele, 5–7 são incrementais (cada um é "mais uma aba/linha de configuração", sem retrabalho de layout).
