# Auditoria — Link de Agendamento: o que foi entregue e o que falta (UI/UX vs. Cal.com)

Este documento faz duas coisas: (1) **audita** o estado real do código hoje contra o que [`PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md`](./PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md) propôs — a maior parte já foi implementada desde que aquele plano foi escrito, e a seção 1 dele (diagnóstico) está **desatualizada**; e (2) especifica, no mesmo nível de detalhe, os itens que continuam faltando, mais um lote de melhorias novas inspiradas no Cal.com que nenhum documento anterior cobriu (respostas do formulário nunca aparecem para o anfitrião, tela de reservas sem ações, página pública sem "adicionar ao calendário", perfil público raso).

> Ordem de leitura recomendada: [`PLANO_LINK_AGENDAMENTO.md`](./PLANO_LINK_AGENDAMENTO.md) (plano original, Fases 1–4, **implementado**) → [`PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md`](./PLANO_MELHORIAS_FLUXO_CRIACAO_AGENDAMENTO.md) (redesenho, **~80% implementado**, ver seção 1 abaixo) → este documento (o que resta + itens novos). Nenhuma mudança de código foi feita ao gerar este documento — é só análise e especificação.

---

## 1. Status real (auditoria feita lendo o código em 2026-09-01)

### 1.1 O que o plano de redesenho pediu e **já está implementado**

| Item do `PLANO_MELHORIAS` | Onde está no código hoje |
| --- | --- |
| §8.1 — Bug das opções da pergunta "Seleção" | Corrigido: [`SchedulingQuestionEditSlideover.vue`](../../app/components/appointments/SchedulingQuestionEditSlideover.vue) tem lista de opções com adicionar/remover, mínimo 2 para salvar (`canSave`, linha 39) |
| §8.1 — `capitalize` CSS na data | Corrigido: [`agendar/[token].vue:83-84`](../../app/pages/agendar/%5Btoken%5D.vue) e [`gerenciar/[manageToken].vue:27-28`](../../app/pages/agendar/gerenciar/%5BmanageToken%5D.vue) usam `charAt(0).toUpperCase() + slice(1)` |
| §6.1 — Lista turbinada | [`scheduling.vue`](../../app/pages/app/scheduling.vue): barra de cor (linha 146), toggle Ativa/Pausada direto no card (linha 204), `bookingsCount` (linha 171), duplicar, "Ver reservas", regenerar, abrir ↗ — tudo presente |
| §4 — Criação rápida (3 campos) | [`SchedulingQuickCreateModal.vue`](../../app/components/appointments/SchedulingQuickCreateModal.vue): Título + Duração (com chips 15/30/45/60) + Calendário (oculto se só houver 1, linha 26) — exatamente como especificado |
| §5 — Editor em rota própria, com abas | [`app/pages/app/scheduling/[id].vue`](../../app/pages/app/scheduling/%5Bid%5D.vue): header fixo, link público + copiar no header (desktop), menu "···" (Pré-visualizar/Copiar/Duplicar/Regenerar/Arquivar), toggle Ativa ao lado do Salvar, 6 abas com deep-link `?tab=`, dirty tracking (`isDirty`/`snapshot`), guarda de saída (`onBeforeRouteLeave` + `beforeunload`) |
| §5.2 — Aba Evento | Local condicional por tipo (`locationDetailMeta`, linha 159), paleta de cor fixa (6 cores) |
| §5.3 — Aba Disponibilidade | Fuso horário visível e editável (`useTimezoneOptions`), "copiar para dias úteis" (`copyToWeekdays`), máx. reservas/dia como toggle-que-revela |
| §5.4 — Aba Formulário | Linhas fixas "Seu nome"/"E-mail" com badge, perguntas customizadas com reordenar (chevrons, não drag), badge Obrigatória/Opcional, toggle de exibição (`isHidden`), editar via slideover |
| §5.5 (parcial) — Políticas | Nome do evento na agenda com template (`{titulo}`/`{convidado}`/`{email}`, resolvido em `book.post.ts:76`), cancelamento/reagendamento habilitável, antecedência mín. de cancelamento como toggle, motivo obrigatório |
| §5.6 — Privacidade | `hideDetailsOnManagePage` + zona de perigo (regenerar, arquivar) |
| §7 (schema) | `color`, `calendar_event_title_template`, `cancellation_enabled`, `reschedule_enabled`, `cancellation_min_notice_hours`, `cancellation_reason_required`, `hide_details_on_manage_page`, `scheduling_questions.is_hidden`, `bookings.cancellation_reason` — todas as colunas existem em `types/scheduling.ts` e nas migrations |

Isso é bem mais do que a seção 1.2 daquele documento (escrita quando tudo isso ainda era modal único de 423 linhas) dava a entender pronto. **Trate a seção 1 do `PLANO_MELHORIAS` como histórico, não como diagnóstico atual.**

### 1.2 O que o plano de redesenho pediu e **continua faltando**

| Item | Pedido em | Status |
| --- | --- | --- |
| Confirmação manual (`requiresConfirmation`, status `pending`, aprovação/recusa) | §5.5, §7 | ❌ não existe — grep por `requiresConfirmation`/`pending` no schema de agendamento não retorna nada |
| Perfil público do anfitrião (avatar) | §6.3 | ❌ `PublicSchedulingPage` só tem `hostName` (texto) |
| Página pública: indicador de passo, resumo sticky, "adicionar ao calendário" (.ics/Google), skeleton dos slots | §6.2 | ❌ nenhum dos quatro |
| Buffers/incremento como `USelect` de valores discretos (em vez de `UInputNumber` livre) | §5.5 | ❌ ainda é `UInputNumber` livre (aba Limites) |
| Antecedência mínima com unidade (Horas/Dias) | §5.3 | ❌ ainda só horas |
| "Copiar horários" como popover com checkboxes de qualquer dia | §5.3 | Parcial — `copyToWeekdays` só cobre "dias úteis" fixo, não um popover arbitrário |

### 1.3 Gaps novos, achados nesta auditoria (não estavam em nenhum documento anterior)

Estes são os itens de maior impacto real hoje, porque não são polimento — são **informação que existe no banco e nunca chega à tela**:

1. **As respostas do formulário nunca aparecem para o anfitrião.** `bookings.answers` é gravado (`book.post.ts:100`) e o tipo `Booking.answers` existe, mas [`scheduling-bookings/[id].vue`](../../app/pages/app/scheduling-bookings/%5Bid%5D.vue) (linhas 60-80) só renderiza nome, e-mail, data de criação e motivo de cancelamento — a pergunta customizada que o convidado respondeu ("De que se trata a reunião?", "Como você me conheceu?") é invisível. O anfitrião marcou a pergunta como importante o bastante para pedir no formulário, e não há lugar nenhum no produto onde ele vê a resposta. **Este é o gap #1 a corrigir, à frente até da confirmação manual.**
 - uma coisa interessantes, deveria exibir as marcações dos clientes na tela de agendamento. Já que tem um calendário justamente para a pessoa organizar a agenda.
2. **A tela de reservas é só uma lista morta.** Sem busca, sem filtro por status (nem "Confirmadas" vs "Canceladas"), sem paginação (busca todas de uma vez via `fetchBookings`), sem ação nenhuma — o anfitrião não consegue cancelar uma reserva por ali (só o convidado, pelo link de gerenciar), não vê o horário marcado (só "Criada em", que é a data em que a reserva foi feita, não a data/hora do compromisso!), e não tem link para abrir o evento correspondente na Agenda.
3. **Sem prévia de "próxima reserva" em lugar nenhum do app.** Diferente do Cal.com (que mostra a próxima reunião confirmada no topo do dashboard), o Kortex não expõe isso nem na página de listagem (`/app/scheduling`) nem em `/app/appointments`.
 - Poderia exibir no dashboard quando tem uma próxima reserva
4. **Sem estado de "sem horários disponíveis" tratado na página pública.** Se o mês inteiro não tiver nenhum slot (calendário lotado, ou o anfitrião nunca configurou disponibilidade), a UI de `agendar/[token].vue` simplesmente mostra o calendário com todos os dias desabilitados, sem nenhuma mensagem explicando — o convidado não sabe se é um bug ou se realmente não há vaga.
5. **`maxAdvanceDays`/`minNoticeHours` não são comunicados ao convidado.** O Cal.com mostra, na própria página pública, até quando dá para agendar ("Disponível até 15 de outubro"). No Kortex esses limites só afetam quais dias ficam clicáveis no mini-calendário, sem nenhum texto explicando — o convidado que tenta o mês seguinte só vê tudo cinza.

---

## 2. O que o Cal.com ainda ensina que nenhum dos dois documentos anteriores cobriu

Os dois documentos anteriores já extraíram a maior parte da lição estrutural do Cal.com (editor em abas, linha de configuração com toggle+descrição, criação em 3 campos). Os pontos abaixo são específicos do fluxo de **pós-reserva** e **gestão do anfitrião** — a metade do produto do Cal.com que os documentos anteriores não detalharam, porque focaram na configuração da página.

| Padrão do Cal.com | Onde vale a pena adaptar |
| --- | --- |
| **Booking detail expandido**: ao clicar numa reserva na lista, abre um painel/slideover com todas as respostas do formulário, local, botões de reagendar/cancelar **pelo próprio anfitrião**, e link para o evento no calendário | §3.1 — resolve o gap #1 e #2 acima |
| **Filtro de status + busca** na lista de reservas (Próximas / Passadas / Canceladas / Pendentes) | §3.1 |
| **"Adicionar ao calendário"** na tela de confirmação (Google/Outlook/Apple/.ics) — quatro botões, não um | §3.2 |
| **Texto de disponibilidade explícito**: "Horários disponíveis de hoje até 12 de outubro" acima do calendário | §3.2 |
| **Empty state de disponibilidade**: "Nenhum horário disponível neste mês" com seta automática para o próximo mês com vaga | §3.2 |
| **Widget incorporável** (embed via `<script>` ou iframe) para o anfitrião colar em outro site | §4 (fora de escopo, registrado) |
| **Analytics básico da página** (visualizações vs. reservas, taxa de conversão) | §4 (fora de escopo, registrado) |

---

## 3. Especificação detalhada dos itens a fazer

### 3.1 Painel de reserva + tela de reservas turbinada (`/app/scheduling-bookings/[id]`)

**Prioridade 1** — é a lacuna mais visível: dado real que o convidado forneceu e o anfitrião nunca vê.

```
┌─ Reservas — Reunião de 30 minutos ──────────────────────────┐
│ [Próximas] [Passadas] [Canceladas]        🔍 Buscar…        │
├───────────────────────────────────────────────────────────┤
│ ● Maria Silva                              qui, 12 de set  │
│   maria@email.com                          14:00 – 14:30   │
│                                          [Confirmada ▾]     │
├───────────────────────────────────────────────────────────┤
│ ● João Souza                               sex, 13 de set  │
│   joao@email.com                           09:00 – 09:30   │
│                                          [Confirmada ▾]     │
└───────────────────────────────────────────────────────────┘
```

- **Filtro por aba** (`Próximas`/`Passadas`/`Canceladas`) calculado client-side sobre `bookings` (comparando `startAt` com `now`, ou `status === 'cancelled'`) — sem endpoint novo, o payload já tem tudo.
- **Ordenar por data do compromisso**, não por `createdAt` — hoje a lista vem na ordem em que os registros foram criados no banco, não na ordem em que as reuniões vão acontecer. Isso exige expor `startAt`/`endAt` na resposta de `GET .../bookings` (hoje `Booking` não tem esses campos — só existem em `events`, ligado por `eventId`; o endpoint de listagem precisa fazer join com `events` e devolver `startAt`/`endAt` no payload).
- **Clicar numa reserva abre um `USlideover`** com: nome, e-mail, data/hora (no fuso do anfitrião), local, **todas as respostas do formulário** (mapeando `booking.answers[question.id]` contra `page.questions` para mostrar o rótulo da pergunta, não só o ID), motivo de cancelamento (se houver), e um link "Ver evento na Agenda" (`/app/appointments?event={eventId}`, reaproveitando a navegação que já existe para abrir o `EventDetailSlideover`).
- **Ações no slideover**: Cancelar (mesma lógica de `manage/[manageToken]/cancel.post.ts`, mas por um endpoint autenticado novo `POST /api/appointments/scheduling-pages/[id]/bookings/[bookingId]/cancel` que verifica `user_id` em vez de `manage_token`) — hoje só o convidado consegue cancelar, o que é uma limitação real (o anfitrião não deveria depender do convidado usar o próprio link para desmarcar).
- **Busca**: filtro client-side simples por `guestName`/`guestEmail` (a lista de um único link de agendamento dificilmente passa de centenas de itens; paginação de servidor só se `bookingsCount` de alguma página passar de ~200 no uso real — não vale complexidade prematura agora).

### 3.2 Página pública — os quatro itens do §6.2 que ainda faltam

Todos dentro de [`agendar/[token].vue`](../../app/pages/agendar/%5Btoken%5D.vue), sem mudança estrutural no fluxo de 3 passos:

1. **Indicador de passo**: `1 de 2` (ou dois pontinhos) entre o cabeçalho e o conteúdo, visível nos passos "pick-time" e "details" (o passo "confirmed" não conta, é o resultado). Componente pequeno, sem estado próprio — deriva de `step.value`.

2. **Texto de janela de disponibilidade** acima do mini-calendário: "Horários disponíveis até {data}" — calculado no cliente a partir de `hoje + maxAdvanceDays` (a página pública já recebe `maxAdvanceDays` implicitamente pelo comportamento da API de disponibilidade, mas `PublicSchedulingPage` **não expõe o campo hoje** — é preciso adicioná-lo ao tipo e ao `schedule/[token].get.ts`, ele não vaza nenhum dado sensível do anfitrião).

3. **Empty state do mês**: se `availableDates.size === 0` depois de `onMonthChange` resolver, mostrar no lugar da grade "Nenhum horário disponível em {mês}" + botão "Ver {próximo mês}" que chama `goNextMonth()` do `ScheduleMonthPicker.vue` programaticamente (expor um método via `defineExpose` ou subir o estado de mês para o pai).

4. **"Adicionar ao calendário"** no passo de confirmação — quatro links, sem endpoint novo:
   - **Google Calendar**: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=...&details=...`
   - **Outlook**: `https://outlook.live.com/calendar/0/deeplink/compose?...`
   - **Apple/outros (.ics)**: gerar um arquivo `.ics` client-side (data URI, template mínimo `VCALENDAR`/`VEVENT` com `DTSTART`/`DTEND`/`SUMMARY`/`LOCATION`) — sem lib nova, é um template de string.
   - Todos os quatro derivam só de `confirmation.value.booking` + `selectedSlot.value`, dado que já está na memória do componente nesse ponto — zero chamada de rede adicional.

5. **Skeleton dos slots**: enquanto `slotsLoading`, hoje só o `ScheduleMonthPicker` mostra "Carregando disponibilidade..." (texto) — trocar a lista de horários (coluna direita, `agendar/[token].vue:201-213`) por 6 `USkeleton` do tamanho de um botão de horário enquanto `slotsLoading` é `true` e `selectedDate` já foi escolhido.

### 3.3 Confirmação manual (`requiresConfirmation`) — retomado do `PLANO_MELHORIAS` §5.5/§7

Mantido aqui só como referência de dependência: **este item deveria vir depois de 3.1** (painel de reserva), porque a tela de aprovação/recusa é, estruturalmente, o mesmo slideover de detalhe da reserva com dois botões a mais (Aprovar/Recusar) em vez de um formulário à parte. Construir 3.1 primeiro elimina retrabalho de UI quando 3.3 chegar. Especificação completa já existe no `PLANO_MELHORIAS`, seção 5.5 — sem mudanças a propor aqui além da ordem de execução.

### 3.4 Perfil público do anfitrião (avatar) — retomado do `PLANO_MELHORIAS` §6.3

Mesma observação: especificação já existe, sem novidade aqui. Vale só registrar que, combinado com 3.2, o cabeçalho da página pública fica: avatar + nome do anfitrião + título da página + indicador de passo — visualmente equivalente ao cabeçalho de reserva do Cal.com.

---

## 4. Fora de escopo (mantido do plano anterior + itens novos desta auditoria)

- **Widget incorporável (embed)** — pressupõe um endpoint de "modo iframe" da página pública (sem o layout de página inteira, CSS isolado) e configuração de CORS/CSP para domínios de terceiros; projeto à parte, não uma variação da página atual.
- **Analytics da página** (visualizações vs. reservas, taxa de conversão) — exigiria rastrear acessos anônimos à página pública (`GET /api/schedule/[token]`), uma responsabilidade nova (nenhum endpoint hoje grava telemetria de acesso); vale só depois que o volume de uso justificar.
- Todos os itens já registrados como fora de escopo no `PLANO_LINK_AGENDAMENTO.md` §9 (pagamento, round-robin, overlay de agenda do convidado, URLs legíveis) e no `PLANO_MELHORIAS` §7.5 (múltiplas durações, horários otimizados, e-mails) continuam fora — nada mudou sobre eles.

---

## 5. Ordem de execução recomendada

| # | Entrega | Por quê nessa posição |
| --- | --- | --- |
| 1 | **Painel de reserva com respostas do formulário** (§3.1) | Maior lacuna real hoje — dado que já existe no banco e é invisível. Não depende de nada. |
| 2 | **Filtro/ordenação por data do compromisso + cancelamento pelo anfitrião** (§3.1) | Mesma tela do item 1, entrega junto sem custo extra de contexto. |
| 3 | **Página pública: indicador de passo, janela de disponibilidade, empty state, skeleton** (§3.2, itens 1-3, 5) | Pequeno, paralelo, sem dependência. |
| 4 | **"Adicionar ao calendário"** (§3.2, item 4) | Pequeno, paralelo, zero dependência de backend. |
| 5 | **Confirmação manual** (§3.3 → especificação em `PLANO_MELHORIAS` §5.5) | Depende logicamente do item 1 (reaproveita o slideover de detalhe da reserva). |
| 6 | **Perfil público do anfitrião** (§3.4 → especificação em `PLANO_MELHORIAS` §6.3) | Paralelo, independente de tudo o resto. |

Itens 3, 4 e 6 podem rodar em paralelo com 1/2 a qualquer momento — não competem pelo mesmo arquivo. O item 5 é o único com dependência real de sequência.
