# Plano de implementação — Relação entre Hábitos e Agenda

Este documento detalha como consertar e completar a relação entre os módulos **Hábitos** e **Agenda**, cobrindo os dois fluxos que o produto precisa garantir:

- **(A) "Criei um hábito com horário — deve aparecer na Agenda"**: já existe hoje (`server/utils/habit-event-sync.ts`), mas tem vários bugs confirmados que este plano corrige.
- **(B) "Deixei um hábito para um dia específico — deve aparecer lá"**: **não existe hoje**. Um hábito sem horário fixo (ou com horário fixo, mas que o usuário quer mover só por um dia) não tem nenhuma forma de ganhar uma presença pontual na Agenda sem alterar sua configuração permanente.

> Pré-requisitos de leitura: [`docs/habits/1.HABITS.md`](../habits/1.HABITS.md) (seção 13, sincronização atual) e [`docs/appointments/1.APPOINTMENTS.md`](./1.APPOINTMENTS.md) (seções 6, 11 e 12 — os bugs de recorrência, a relação unidirecional com Hábitos, e o bug do dashboard). Este plano cita esses documentos ao longo do texto em vez de repetir o que já está descrito lá.

---

## 1. Estado atual e problemas confirmados

### Fluxo A — hábito com horário fixo → evento recorrente

Já implementado: um hábito com `scheduledTime` gera, via `syncHabitLinkedEvent()`, um evento recorrente (`rrule` baseado em `frequency`/`customDays`) num calendário-alvo (`habit.calendarId` ou um calendário "Hábitos" criado automaticamente). Funciona — mas com problemas reais já documentados:

| Problema | Onde está documentado | Resumo |
| --- | --- | --- |
| Sincronização é unidirecional e **não reconcilia** | `1.APPOINTMENTS.md`, seção 11 | Editar o evento direto na Agenda é sobrescrito silenciosamente na próxima vez que o hábito for salvo. |
| Arquivar o evento direto na Agenda **duplica**, não desliga | `1.APPOINTMENTS.md`, seção 11 | O vínculo continua apontando para o evento arquivado; a sincronização cria um evento novo em vez de reconhecer a intenção do usuário. |
| Hábito **semanal** sempre sincroniza para **segunda-feira fixa** | `1.APPOINTMENTS.md`, seção 11; `1.HABITS.md`, seção 13 | `WEEKLY_HABIT_DAY = 1` hardcoded, independente do dia real que o hábito representa. |
| **Nenhum indicador** na Agenda de que um evento veio de um hábito | `1.APPOINTMENTS.md`, seções 11 e 14 (item 17) | O vínculo (`entity_links`) só é lido pelo código de sincronização; a UI da Agenda não sabe disso. |
| Eventos recorrentes antigos podem **sumir** de visões futuras da Agenda | `1.APPOINTMENTS.md`, seção 6 | Afeta diretamente eventos de hábito, que são tipicamente criados uma vez e recorrem indefinidamente. |
| **"Agenda de hoje" do dashboard nunca expande recorrência** | `1.APPOINTMENTS.md`, seção 12 (item 18) | Um hábito diário com horário só aparece no widget do dashboard no dia em que o horário foi definido, depois some para sempre — mesmo continuando certo na Agenda completa. |

### Fluxo B — hábito sem horário fixo, agendado pontualmente

Não existe nenhuma peça disso hoje: `habit_logs` (o registro diário do hábito) não tem nenhum campo de horário, e não há nenhuma ação na UI de Hábitos para "colocar isso na agenda hoje, num horário específico" sem alterar `habits.scheduledTime` permanentemente.

---

## 2. Desenho geral

A ideia central deste plano: **um hábito pode se materializar na Agenda de três formas diferentes, todas cientes umas das outras**:

1. **Recorrente permanente** — já existe (Fluxo A), corrigido neste plano (Fase 1).
2. **Ocorrência única movida** — "hoje esse hábito recorrente vai ser às 15h, não no horário de sempre, só hoje" — usa o mecanismo de exceção de recorrência que a Agenda já tem no schema, mas nunca usa (`event_exceptions.type='modified'`, documentado como lacuna em `1.APPOINTMENTS.md`, seção 6). Este plano é a primeira funcionalidade a implementar esse tipo de exceção de ponta a ponta (Fase 2).
3. **Pontual, sem recorrência** — "esse hábito não tem horário fixo, mas hoje eu vou fazer às 19h" — um evento novo, sem `rrule`, criado só para aquele dia, vinculado ao **log daquele dia** (não ao hábito como um todo) — é o Fluxo B propriamente dito (Fase 3).

As três formas usam o **mesmo indicador visual** na Agenda ("veio de um hábito", Fase 4) e o mesmo princípio: **a Agenda nunca mais sobrescreve silenciosamente uma intenção do usuário** — qualquer edição feita direto num evento vinculado a um hábito pergunta explicitamente o que fazer, em vez de ser apagada na próxima sincronização.

---

## Fase 1 — Tornar a sincronização recorrente existente segura e visível

### 1.1 Corrigir o hábito semanal sempre cair na segunda-feira

`server/utils/habit-event-sync.ts` — hoje, `frequency === 'weekly'` sempre gera `FREQ=WEEKLY;BYDAY=MO`. Duas opções, em ordem de preferência:
- **(Recomendado)** Exigir que um hábito `weekly` também tenha um dia da semana associado (reaproveitar o mesmo `customDays` já usado por hábitos `custom`, restrito a um único dia para o caso `weekly`) — unifica o modelo em vez de manter dois conceitos de frequência semi-sobrepostos.
- (Alternativa mais simples/menor risco de migração) Adicionar um campo `weeklyDayOfWeek` só para hábitos `weekly`, sem tocar em `customDays`.

Qualquer uma das duas resolve o bug; a primeira é arquiteturalmente mais limpa a longo prazo.

### 1.2 Marcar visualmente, na Agenda, que um evento veio de um hábito

- `GET /api/appointments/events` e `GET /api/appointments/events/[id]` passam a fazer um `LEFT JOIN`/consulta adicional em `entity_links` (`target_type='event', source_type='habit'`) e anexar `sourceHabitId`/`sourceHabitName` ao evento retornado, quando existir.
- `app/types/appointments.ts` (`CalendarEvent`) ganha `sourceHabitId?: string | null` / `sourceHabitName?: string | null`.
- **Badge visual** (ícone `i-lucide-calendar-check`, mesmo ícone usado no item de navegação de Hábitos) em `EventPopover.vue`, `EventDetailSlideover.vue`, e um indicador discreto nos blocos de `WeekView.vue`/`DayView.vue`/`MonthView.vue` — clicável, levando para o hábito de origem (`/app/habits` com o hábito selecionado, reaproveitando o mesmo padrão de "abrir já selecionado" que o plano de Metas↔Hábitos também precisa — ver [`docs/goals/PLANO_METAS_HABITOS.md`](../goals/PLANO_METAS_HABITOS.md), Fase 4, mesma lacuna de navegação cruzada, resolver uma vez e reaproveitar nas duas pontas).

### 1.3 Substituir a sobrescrita silenciosa por uma decisão explícita

Hoje, editar um evento vinculado a um hábito é permitido normalmente pela Agenda, e a próxima sincronização do hábito apaga a edição sem aviso. Passa a funcionar assim:

- `PATCH /api/appointments/events/[id]` e `POST /api/appointments/events/[id]/archive`: quando o evento tem um vínculo `entity_links(source_type='habit')`, a resposta da requisição de edição/arquivamento passa por uma checagem prévia no cliente (a UI já sabe, pelo badge da seção 1.2, que aquele evento é de origem de hábito) — ao tentar editar ou arquivar, `EventDetailSlideover.vue`/`EventPopover.vue` mostram um `UModal` de confirmação com três opções, no mesmo espírito de como Google Calendar trata edição de série recorrente:
  - **"Editar só hoje"** — cria uma exceção `event_exceptions.type='modified'` para aquela ocorrência (implementado na Fase 2) — a série recorrente do hábito continua intacta, só aquele dia muda.
  - **"Editar o hábito"** — navega para a tela de Hábitos, edição do hábito de origem (é lá que `scheduledTime`/`frequency` realmente vivem).
  - **"Desvincular da sincronização"** (seção 1.4) — desliga a sincronização automática para este hábito especificamente, permitindo editar o evento livremente a partir de agora.
- Arquivar segue a mesma lógica: "Cancelar só hoje" (vira uma exceção `cancelled`, já suportada) vs. "Desvincular da sincronização".

### 1.4 Desvincular a sincronização sem duplicar

Hoje, arquivar o evento sincronizado direto na Agenda faz a próxima sincronização criar um evento novo duplicado (`1.APPOINTMENTS.md`, seção 11). Correção:

- Novo campo `habits.calendar_sync_enabled boolean NOT NULL DEFAULT true`.
- A opção "Desvincular da sincronização" (seção 1.3) seta esse campo para `false` e arquiva o evento atual — `syncHabitLinkedEvent()` passa a checar esse campo **antes** de criar/atualizar qualquer evento, e simplesmente não faz nada se estiver desligado.
- `HabitsEditModal.vue`/`HabitsDetailSlideover.vue` (Hábitos) ganham um toggle "Sincronizar com a Agenda" refletindo/controlando o mesmo campo, para o caminho inverso (reativar a sincronização a partir de Hábitos).

### 1.5 Pré-requisitos de outros documentos que também beneficiam este fluxo

- **Bug de eventos recorrentes antigos sumindo** (`1.APPOINTMENTS.md`, seção 6) — já listado como pré-requisito do plano de link de agendamento (`PLANO_LINK_AGENDAMENTO.md`, seção 5.3); vale corrigir uma vez só, já que afeta os dois planos e o próprio uso normal da Agenda.
- **"Agenda de hoje" do dashboard não expandir recorrência** (`1.APPOINTMENTS.md`, seção 12/14 item 18) — corrigir fazendo `server/api/life/dashboard.get.ts` reaproveitar `expandRecurrence()` (o mesmo motor já usado por `events.get.ts`) em vez de filtrar só pelo `start_at` bruto do evento-mestre.

### Critérios de aceite — Fase 1

- Um hábito semanal sincroniza para o dia da semana correto, não sempre segunda.
- Todo evento vinculado a um hábito mostra um indicador visual na Agenda, com link de volta ao hábito.
- Editar/arquivar um evento vinculado a um hábito nunca mais é sobrescrito silenciosamente — o usuário sempre escolhe explicitamente entre "só hoje", "editar o hábito" ou "desvincular".
- Um hábito diário com horário aparece corretamente todo dia no widget "Agenda de hoje" do dashboard, não só no dia de criação.

---

## Fase 2 — Editar/mover só a ocorrência de hoje de um hábito recorrente

Implementa, pela primeira vez no projeto, o tipo de exceção `modified` que já existe no schema (`event_exceptions`, `1.APPOINTMENTS.md`, seção 6) mas nunca foi usado por nenhum endpoint.

### 2.1 Novo endpoint

`POST /api/appointments/events/[id]/modify-occurrence` — body: `{ recurrenceId, overrideStartAt?, overrideEndAt?, overrideTitle?, overrideDescription?, overrideLocation? }`. Faz upsert em `event_exceptions` (`onConflict: event_id, recurrence_id`) com `type='modified'` e os campos de override preenchidos.

### 2.2 `events.get.ts` passa a aplicar os overrides

Hoje, `events.get.ts` já cruza ocorrências expandidas com `event_exceptions` para pular as `cancelled` — passa a também **aplicar** os campos `override_*` de uma exceção `modified` sobre a ocorrência correspondente antes de devolver ao cliente, em vez de ignorá-los (que é o comportamento atual, já que nada nunca escreve esses campos).

### 2.3 UI

- `EventDetailSlideover.vue`: quando o evento é uma ocorrência (`event.recurrenceId` presente — já existe essa distinção hoje, usada por "Cancelar ocorrência"), o botão "Editar" abre o formulário de edição normal, mas ao salvar oferece a mesma escolha "só hoje" vs. "toda a série" já descrita na Fase 1.3 — "só hoje" chama o endpoint novo (2.1) em vez de `PATCH /events/[id]` (que sempre edita a série inteira).
- Isso vale tanto para eventos de origem manual quanto de origem de hábito — a Fase 1 só é o gatilho que torna essa escolha obrigatória especificamente para eventos vinculados a hábito (já que lá a alternativa "editar a série" tem uma consequência adicional: também deveria editar o hábito).

### Critérios de aceite — Fase 2

- É possível mover/renomear só a ocorrência de hoje de um evento recorrente (de hábito ou não) sem afetar as demais ocorrências.
- A ocorrência modificada aparece corrigida em todas as visões da Agenda; as demais ocorrências continuam no horário original.

---

## Fase 3 — Agendar um hábito sem horário fixo para um dia específico

O fluxo B do início deste documento: um hábito que **não tem** `scheduledTime` (ou tem, mas o usuário quer um horário diferente só por hoje — nesse caso, ver Fase 2, que já resolve isso via exceção) ganha uma presença pontual na Agenda.

### 3.1 Modelo de dados

```sql
-- supabase/migrations/<timestamp>_habit_log_scheduling.sql
ALTER TABLE habit_logs ADD COLUMN scheduled_at timestamptz;
ALTER TABLE habit_logs ADD COLUMN scheduled_end_at timestamptz;
```

Guardado no **log do dia** (`habit_logs`, já `UNIQUE(habit_id, log_date)`), não no hábito — é intencionalmente um dado de **um dia específico**, não uma mudança de configuração permanente do hábito. Se ainda não existir um log para aquele dia (usuário agendando um dia futuro, antes de qualquer conclusão), o log é criado com `status` nulo/pendente só para guardar o agendamento — o mesmo padrão que `POST /api/habits/log` já faz para o caso de completar um hábito num dia sem log prévio.

### 3.2 Endpoint

`POST /api/habits/[id]/schedule-day` — body: `{ date, scheduledAt, scheduledEndAt? }`.

1. Upsert em `habit_logs` (por `habit_id, log_date=date`), preenchendo `scheduled_at`/`scheduled_end_at`.
2. Cria (ou atualiza, se já existir um agendamento anterior para aquele log) um evento **não-recorrente** em `events` — `calendar_id` = mesmo alvo já resolvido pela sincronização recorrente (`resolveTargetCalendarId`/`getOrCreateHabitsCalendar`, reaproveitados de `habit-event-sync.ts`), `start_at`/`end_at` = os horários informados, sem `rrule`.
3. Cria/atualiza uma linha em `entity_links` — mas com `source_type='habit_log'` (**não** `'habit'`), `source_id` = id do log — distinguindo claramente, para a Fase 4, um agendamento pontual de uma sincronização recorrente permanente.
4. Enviar `scheduledAt: null` remove o agendamento — arquiva o evento pontual correspondente.

### 3.3 UI

- **`HabitsTodayTreeRow.vue`** (aba Hoje) e **`HabitsDetailSlideover.vue`**: um novo botão/ícone ("Agendar horário", `i-lucide-clock-plus`) — só aparece para hábitos **sem** `scheduledTime` fixo (hábitos que já têm horário fixo usam a Fase 2, "editar só hoje", para o mesmo efeito). Abre um popover leve de horário (reaproveitando `UiTimePicker`, já usado em `HabitsCreateModal.vue`).
- **`HabitsCalendar.vue`** (calendário por hábito, dentro do slideover de detalhe): clicar num dia futuro sem log oferece a mesma ação — "Agendar horário neste dia" — permitindo planejar um hábito pontual para uma data futura, não só hoje.
- O indicador de "tem horário agendado hoje" aparece na aba Hoje ao lado do hábito (badge de horário, reaproveitando o badge que hábitos com `scheduledTime` fixo já mostram).

### Critérios de aceite — Fase 3

- Um hábito sem horário fixo pode ganhar um horário só para hoje (ou uma data futura específica), sem alterar sua configuração permanente.
- Esse agendamento pontual aparece na Agenda como um evento comum, não-recorrente, com o mesmo indicador visual "veio de um hábito" da Fase 1.
- Remover o horário agendado de um dia arquiva o evento pontual correspondente, sem afetar o hábito nem outros dias.

---

## Fase 4 — Consolidar a visão cruzada

- O indicador visual da Fase 1.2 (`sourceHabitId`/badge) passa a distinguir, na Agenda, os três casos da seção 2 (recorrente permanente / ocorrência movida / pontual sem recorrência) só pelo tooltip do badge — a aparência é a mesma, a informação extra é contextual, não uma nova categoria visual para o usuário memorizar.
- `HabitsDetailSlideover.vue` (lado de Hábitos) passa a mostrar, além do badge de horário fixo (se houver), quantos dias têm agendamento pontual futuro (`scheduled_at` preenchido em `habit_logs` para datas ≥ hoje) — visibilidade mínima do que foi planejado pontualmente sem precisar abrir a Agenda.

### Critérios de aceite — Fase 4

- A partir de Hábitos, dá para saber que existe um agendamento pontual futuro sem precisar navegar até a Agenda.
- A partir da Agenda, todo evento de origem de hábito (recorrente, ocorrência movida, ou pontual) é identificável e leva de volta ao hábito correspondente.

---

## 5. Fora de escopo (deste plano)

- **Marcar um hábito como concluído diretamente a partir da Agenda** (clicar no evento e já marcar "feito") — já registrado como pedido aberto no TODO interno de Hábitos (`docs/habits/1.HABITS.md`, seção 1) e no roadmap de mercado da Agenda; é uma extensão natural depois deste plano (o evento já sabe seu hábito de origem, seção 1.2), mas é uma peça de UI/UX própria que merece ser desenhada separadamente.
- **Sincronização bidirecional completa** (qualquer edição na Agenda refletir automaticamente de volta no hábito, sem perguntar) — deliberadamente descartada: a Fase 1.3 escolhe **perguntar** em vez de **adivinhar a intenção**, para não trocar um bug (sobrescrita silenciosa) por outro (a Agenda mudando a configuração do hábito sem o usuário perceber).
- **Generalizar a edição por ocorrência (Fase 2) para toda a Agenda de uma vez** — a Fase 2 é desenhada para servir o caso de hábitos primeiro, mas a implementação (`event_exceptions.type='modified'`, endpoint novo) já é genérica o suficiente para qualquer evento recorrente; expandir a UI de edição de eventos comuns para oferecer a mesma escolha é um trabalho de UI adicional, não bloqueado por este plano, mas não incluído nele.

## 6. Riscos

- **Unificar `weekly` com `customDays`** (Fase 1.1) é uma mudança de schema que precisa de uma migration de backfill cuidadosa para hábitos `weekly` já existentes (decidir um dia padrão, provavelmente segunda-feira, para preservar o comportamento atual até o usuário ajustar manualmente).
- **O modal de decisão explícita da Fase 1.3** adiciona uma etapa de interação a uma operação que hoje é imediata (editar um evento) — vale medir se isso gera fricção real ou se, por acontecer só em eventos vinculados a hábito (uma minoria dos eventos totais de um usuário), o impacto é pequeno.
- **`habit_logs` acumula mais responsabilidade** (agora guarda status de conclusão *e* agendamento pontual) — aceitável, já que os dois conceitos são inerentemente por-dia, mas vale revisar se algum código existente assume que `habit_logs` só existe quando há uma conclusão registrada (a Fase 3.1 cria logs "vazios" só para guardar um agendamento, um caso que hoje não acontece).

## 7. Checklist de rollout

- [ ] Fase 1.1 — hábito semanal com dia da semana correto (migration + `habit-event-sync.ts`)
- [ ] Fase 1.2 — badge "veio de um hábito" nos eventos da Agenda + link de volta
- [ ] Fase 1.3 — modal de decisão explícita ao editar/arquivar evento vinculado a hábito
- [ ] Fase 1.4 — `habits.calendar_sync_enabled` + toggle na UI de Hábitos
- [ ] Fase 1.5 — correção do bug de recorrência antiga + expansão de recorrência no dashboard
- [ ] Fase 2.1–2.2 — endpoint de exceção `modified` + `events.get.ts` aplicando overrides
- [ ] Fase 2.3 — UI de "editar só hoje" vs. "editar a série"
- [ ] Fase 3.1–3.2 — migration de `habit_logs` + endpoint `schedule-day`
- [ ] Fase 3.3 — UI de agendar horário pontual (Hoje + calendário por hábito)
- [ ] Fase 4 — visibilidade cruzada consolidada nos dois módulos
