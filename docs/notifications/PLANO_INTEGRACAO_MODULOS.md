# Plano — Integração de notificações por módulo

Este documento complementa `docs/notifications/PLANO_NOTIFICACOES.md` (que trata da infraestrutura: emissor central, cron, canais). Aqui o foco é outro: **para cada módulo do produto, o que já existe no schema que sustenta uma notificação, o que falta, e qual seria o mínimo viável** quando chegar a vez de ligar cada módulo ao emissor central.

**Não é pra ser implementado agora.** O plano do time é terminar de melhorar as telas módulo por módulo primeiro, e só no final voltar aqui pra ligar tudo em notificações — mas com pelo menos o básico funcionando, não a versão completa. Este documento existe pra, quando esse momento chegar, não ser preciso reinvestigar o schema de cada módulo do zero: cada seção abaixo já diz o que dá pra fazer sem migration nova e o que exigiria campo novo.

Pré-requisito comum a tudo abaixo: a Fase 1 de `PLANO_NOTIFICACOES.md` (o utilitário `server/utils/notifications.ts` com `createNotification(...)`). Nenhuma integração de módulo faz sentido antes disso existir — sem ele, cada módulo reinventaria sua própria inserção em `notifications`, o que é exatamente o problema que a Fase 1 evita.

---

## 1. Como ler este documento

Cada módulo tem quatro coisas:

- **Onde vive**: páginas, endpoints, tabelas — pra saber onde plugar a chamada de `createNotification`.
- **Eventos candidatos com suporte de dado hoje**: só eventos para os quais o schema atual já tem o campo necessário. Nada de "seria legal notificar X" sem o dado pra sustentar.
- **O que falta pra sair do papel**: além do emissor central (comum a todos), o que é específico daquele módulo — normalmente um cron que leia a tabela certa, ou uma chamada dentro de um endpoint que já existe.
- **Classificação**: 🟢 **básico** (sem schema novo, plugar e funciona), 🟡 **expansão** (precisa de schema novo ou de uma decisão de produto antes).

---

## 2. Notas — compartilhamento (🟢 implementado, junto com o P0 de `PLANO_NOTIFICACOES.md`)

- **Onde vive**: `server/api/notes/[id]/shares/index.post.ts` (cria o convite), tabela `note_shares` (`supabase/migrations/20260812050000_notes_share_grants.sql`: `note_id, owner_id, shared_with_user_id, shared_with_email, permission ['view','edit'], status ['pending','accepted']`).
- **Evento candidato**: "Fulano compartilhou a nota X com você". **Todo o dado necessário já existe** — quem compartilhou (`owner_id`), o quê (`note_id` → título da nota), com quem (`shared_with_user_id`), com que permissão. Não falta nenhum campo novo no schema.
- **Status**: ✅ implementado — `server/api/notes/[id]/shares/index.post.ts` chama `createNotification` (`server/utils/notifications.ts`) logo após o insert em `note_shares`, mas só quando o convite já resolve para uma conta existente (`resolvedUserId` presente); convites pendentes continuam sem notificação. `link_path` aponta pra `/app/notes/shared-with-me`.
- **Fora do que foi feito agora**: quando um convite `pending` é reconciliado depois (pessoa cria conta com o e-mail convidado, via `server/utils/reconcile-pending-shares.ts`), ainda não dispara notificação nesse momento — só no instante do convite. Ficaria como próximo incremento, não fazia parte do escopo mínimo do P0.
- **Classificação**: 🟢 **básico** — provavelmente a integração de menor esforço de todo este documento, porque não depende de cron nenhum (é síncrono: alguém compartilha → notificação na hora, dentro do próprio request).
- **Fora de escopo do básico**: notas não têm campo de prazo (`due_date`); não há tabela de comentário em nenhuma migration — não dá pra notificar "comentou na sua nota" porque a feature de comentário não existe.

---

## 3. Agenda (Appointments) — lembretes (🟢 schema mais completo, mas exige cron)

- **Onde vive**: `server/api/appointments/events/[id]/reminders.post.ts`, tabela `event_reminders` (`event_id, user_id, type ['popup','email','push'], minutes_before`), `supabase/migrations/20260305220000_scheduling_module.sql`.
- **Evento candidato**: "Seu evento X começa em N minutos". Esse é o módulo com o **schema mais completo de todos** — `event_reminders` já modela evento, usuário, canal desejado e antecedência. Já documentado em detalhe (lacuna, não solução) em `docs/appointments/1.APPOINTMENTS.md:101-106`.
- **O que falta**:
  1. Endpoint de varredura (`appointments/cron-reminders.post.ts`) que leia `event_reminders` na janela certa e chame `createNotification` — não existe hoje.
  2. Um agendador real chamando esse endpoint a cada poucos minutos (ver `PLANO_NOTIFICACOES.md`, seção 5.2) — sem isso, mesmo o endpoint pronto não dispara nada sozinho.
  3. Como efeito colateral bem-vindo, dá pra também conectar o campo de edição de lembrete que falta no `EventDetailSlideover` (hoje só leitura) — não é obrigatório pro básico funcionar (lembretes definidos na criação do evento já bastam pro mínimo), mas é barato de incluir junto.
- **Classificação**: 🟢 **básico**, mas é o único, entre os "básicos", que depende de infraestrutura de cron existir primeiro (diferente do compartilhamento de notas, que é síncrono).

---

## 4. Financeiro — parcela de dívida vencendo (🟢 pronto, não citado pelo usuário mas real no produto)

- **Onde vive**: `server/api/financial/debts/`, tabela `debt_installments` (`due_date date, paid boolean, paid_at`), índice `idx_debt_installments_due`, `supabase/migrations/20260306100000_financial_module.sql`.
- **Evento candidato**: "Parcela de X vence hoje/está atrasada". Dado já existe e já tem índice pensado pra esse tipo de consulta.
- **O que falta**: endpoint de varredura diário (`financial/cron-installments-due.post.ts` ou similar) + entrada no agendador.
- **Classificação**: 🟢 **básico** — mesmo padrão de "Agenda", um cron diário simples.
- **Nota**: este módulo não tem página própria hoje (só backend + widgets de dashboard) — vale confirmar se ainda faz sentido notificar algo cuja tela principal não existe ainda, ou se isso espera a tela ser construída.

---

## 5. Tarefas e Ideias — vencimento por data (🟡 dado parcial, sem hora)

- **Onde vive**: `tasks.due_date` (`supabase/migrations/20260305200000_tasks_module.sql`, índice `idx_tasks_due_date`) e `ideas.due_date` (`supabase/migrations/20260306120000_ideas_module.sql`, índice `idx_ideas_user_due`) — estruturalmente idênticos.
- **Evento candidato**: "Tarefa/ideia X vence hoje". O campo existe, mas é só `date`, sem hora — dá pra notificar "vence hoje" (comparando com a data atual), **não** dá pra notificar "vence em 2 horas" sem adicionar um campo de horário, que não existe hoje em nenhum dos dois.
- **O que falta**: cron diário (rodando de manhã, por exemplo) que busque `due_date = hoje AND status != 'completed'/'done'` e notifique. Tecnicamente simples, mas entra em 🟡 porque o resultado é mais pobre que o de Agenda (sem controle de antecedência) — vale decidir se "vence hoje" já é suficiente pro básico ou se espera um campo de horário ser adicionado primeiro.
- **Classificação**: 🟡 **expansão limitada** — dá pra fazer uma versão simplificada ("vence hoje") sem schema novo, mas a versão completa (antecedência configurável, como Agenda) precisa de campo novo.

---

## 6. Hábitos — lembrete de revisão (🟡 módulo-inteiro hoje, por hábito é expansão)

- **Onde vive**: `habit_user_settings.review_reminder_enabled`/`review_reminder_time` (por usuário, não por hábito), tabela `habit_logs`/`habit_streaks` (streak em risco).
- **Evento candidato pronto**: "Hora de revisar seus hábitos hoje", baseado no horário configurado — já documentado como lacuna em `PLANO_NOTIFICACOES.md`, seção 5.4.
- **O que falta**: cron (15-30min) lendo `habit_user_settings` respeitando timezone do usuário (`user_preferences.timezone`) + `createNotification`.
- **Classificação**: 🟢 **básico** pro lembrete módulo-inteiro que já existe na UI (é literalmente cumprir uma promessa que a tela já faz).
- **🟡 Expansão futura, fora do básico**: lembrete por hábito individual, horário próprio por hábito — não existe campo pra isso hoje (`docs/habits/ANALISE_HABITOS_MERCADO.md:28` já registra essa lacuna de mercado). Exige schema novo (`habit_reminder_time` por linha de `habits`, ou tabela própria). Não faz parte do básico.
- **Descartado por falta de porta de entrada, não por falta de schema**: `habit_user_settings.share_token`/`share_enabled` já existe no backend, mas é link público de "compartilhar meu progresso com o mundo", não convite pessoa-a-pessoa (`docs/habits/1.HABITS.md:177,236` — o painel que exporia isso nunca foi montado na UI). Não sustenta notificação tipo "fulano compartilhou um hábito com você" sem antes essa feature existir de verdade.

---

## 7. Journal — sem evento forte hoje (🟡 fraco)

- **Onde vive**: `journal_entries` (`entry_date`, `UNIQUE(user_id, entry_date)` — um registro por dia).
- **Evento candidato**: o único disponível seria "você ainda não escreveu hoje" (ausência de linha pra data atual) — é mais fraco que um vencimento de verdade, mais parecido com um nudge de engajamento.
- **O que falta**: não há nenhum campo de horário/preferência específico do módulo pra decidir *quando* mandar esse nudge (diferente de hábitos, que já tem `review_reminder_time`).
- **Classificação**: 🟡 **expansão** — não é básico porque exigiria antes decidir/adicionar uma preferência de horário, e é o tipo de notificação mais fácil de virar incômodo se malfeita (ninguém quer nudge de diário todo dia sem poder configurar horário).

---

## 8. Metas (Goals) — sem campo de prazo (🟡 bloqueado por schema)

- **Onde vive**: `goals` (`status`, `progress` — recalculado automaticamente por trigger quando `goal_tasks` muda), `supabase/migrations/20260305100000_goals_module.sql`.
- **Evento candidato só parcial**: "meta concluída" (`status = 'completed'`) e "progresso mudou" são sustentados, mas são eventos de baixo valor pra notificação (o usuário normalmente já está olhando a tela quando isso acontece, por ser ele mesmo quem fez a ação).
- **O que falta pro evento que teria valor de verdade** ("sua meta X está vencendo"): **não existe nenhum campo de prazo/deadline em `goals` nem em `goal_tasks`** — nenhuma coluna `due_date`/`deadline`/`target_date` em nenhuma migration. Isso é bloqueado por schema, não só por falta de cron.
- **Classificação**: 🟡 **expansão** — não entra no básico enquanto o campo de prazo não existir.

---

## 9. Billing (Stripe) — já funciona, referência de padrão

- Já é o único módulo que efetivamente cria notificações hoje, via `supabase/functions/stripe-webhook/index.ts` (`safeInsertNotification`). Não precisa de trabalho novo de integração — mas quando a Fase 1 de `PLANO_NOTIFICACOES.md` existir, vale decidir se essa Edge Function passa a usar o mesmo emissor central (ou mantém sua cópia própria, já que Edge Functions em Deno não importam módulos do Nuxt server diretamente — ver `PLANO_NOTIFICACOES.md`, Fase 1).

---

## 10. Resumo — o que é "básico" quando chegar a vez

| Módulo | Evento do básico | Depende de cron? | Schema novo necessário? |
| --- | --- | --- | --- |
| Notas | ✅ "Fulano compartilhou uma nota com você" — já implementado | Não (síncrono, dentro do endpoint de share) | Não |
| Agenda | "Seu evento começa em N minutos" | Sim | Não (só falta o job) |
| Financeiro | "Parcela vence hoje/atrasada" | Sim (diário) | Não |
| Hábitos | "Hora de revisar seus hábitos" (módulo-inteiro) | Sim | Não |
| Tarefas / Ideias | "Vence hoje" (sem antecedência configurável) | Sim (diário) | Não, mas versão limitada |
| Journal | — | — | Sim (preferência de horário) |
| Metas | — | — | Sim (campo de prazo) |

**Ordem sugerida de integração, quando a vez chegar** (do menor pro maior esforço): Notas (síncrono, sem cron) → Agenda (cron já bem definido pela tabela `event_reminders`) → Hábitos e Financeiro (crons simples de data/horário) → Tarefas/Ideias (cron simples, mas resultado mais pobre) → Journal e Metas (precisam de decisão de produto + schema novo antes de começar).

Cada linha da tabela acima é independente — dá pra integrar Notas sem esperar Agenda, por exemplo. Não há necessidade de fazer todas de uma vez; o "básico" de cada módulo pode entrar conforme aquele módulo for revisitado no roadmap de telas.
