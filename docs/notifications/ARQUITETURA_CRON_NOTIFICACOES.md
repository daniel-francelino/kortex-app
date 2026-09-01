# Arquitetura e implementação — Notificações ponta a ponta (kortex-app × kortex-api)

Este documento é a **fonte da verdade** para implementar a entrega de notificações/lembretes, cobrindo os dois repositórios:

- **kortex-app** (este repo) — Nuxt na Vercel. Dono das **telas** (sino, slideover, configurações), das **tabelas** e das notificações **síncronas** (disparadas dentro de um request do usuário: compartilhamentos, convites, RSVP, reservas).
- **kortex-api** ([`daniel-francelino/kortex-api`](https://github.com/daniel-francelino/kortex-api)) — Express + `node-cron` em PM2 num Droplet DigitalOcean (atrás de Nginx). Dono de **tudo que depende de relógio**: varre o Supabase **diretamente** (service role, mesmo padrão do `close-day`) e insere as notificações agendadas.

> Complementa e **corrige** os documentos anteriores: [`PLANO_NOTIFICACOES.md`](./PLANO_NOTIFICACOES.md) (defasado em pontos importantes — ver §2.3 Erratas) e [`PLANO_INTEGRACAO_MODULOS.md`](./PLANO_INTEGRACAO_MODULOS.md) (mapa por módulo). Onde houver conflito, vale este documento.

**Estado resumido:** a metade "passiva" está pronta (schema, emissor, API de leitura, sino/slideover, tela de configurações, registro de devices OneSignal) e existe até um scan HTTP de lembretes de eventos já implementado no kortex-app — mas nada roda no relógio, nenhum canal além do in-app é entregue, e a UI não atualiza sozinha. Este documento especifica o que falta, em que repo, e em que ordem.

### Escopo desta fase: o dono da conta primeiro

Decisão de produto que organiza todo o roadmap (§7): **a prioridade agora é o próprio usuário do sistema receber os lembretes que ele mesmo configurou** — lembrete de evento, lembrete de hábito, vencimento de tarefa. Notificar **outras pessoas** (o convidado sem conta de uma página de Agendamento público, por exemplo) fica para uma fase seguinte, deliberadamente.

Isso não muda o catálogo (§3) nem a arquitetura (§1) — todo produtor listado já é "para o dono da conta" (mesmo `event_invite`/`calendar_shared`, que notificam *outro usuário do sistema*, continuam sendo esse padrão: alguém com conta recebendo algo no seu próprio sino). Só existe um item genuinamente "outras pessoas" no catálogo inteiro — o gap 4 do §3.2 (lembrete ao convidado de reserva pública, que não tem conta) — e ele já estava marcado como bloqueado/futuro (§3.7). Esta seção só **reordena** o §7 para refletir a prioridade.

**Barra mínima definida pelo usuário:** para os lembretes que já existem (evento, e agora hábito), a entrega precisa alcançar **os dois canais abaixo, ao mesmo tempo**, não um ou outro:

1. **Aba de notificações do app** (sino + slideover) — já funciona de forma passiva hoje (após reload); a Fase C (§6.1) fecha a lacuna de "sem reload".
2. **Push no celular, se o app estiver instalado** — ou seja, o canal **`mobile_push`** via OneSignal, entregue pelo app nativo (Capacitor + `onesignal-cordova-plugin`, já integrado no cliente — só falta o remetente do lado do servidor, Fase B/§6.3). Web push (navegador) sai de graça da mesma implementação, mas o celular com app instalado é o alvo declarado.

---

## 1. Decisão arquitetural: **kortex-api acessa o Supabase diretamente**

### 1.1 O desenho

```
┌────────────────────── kortex-api (Droplet, PM2) ───────────────────────┐
│  node-cron (TZ Europe/Lisbon)          Supabase (service role)         │
│   ├─ close-day        23:55 diário ──────► habit_logs (já existe)      │
│   ├─ reminders-scan   */5 min ───────────► event_reminders + events    │
│   ├─ habits-scan      */15 min (futuro) ─► habit_user_settings         │
│   ├─ due-scan         0 * * * * (futuro)─► tasks/ideas/parcelas/metas  │
│   └─ trash-purge      03:00 diário ──────► notes/folders deletados     │
│              │                                                         │
│              └── NotificationRepository ──► INSERT em `notifications`  │
│                     (checa preferências + dedupe por external_id)      │
└────────────────────────────────────────────────────────────────────────┘
                                   ▲
              Supabase Database Webhook (INSERT em notifications)
                                   │
                    POST /api/webhooks/notification-created
                    (kortex-api envia push via OneSignal REST — Fase B)

┌────────────────────── kortex-app (Vercel, HTTPS) ──────────────────────┐
│  Notificações SÍNCRONAS (dentro do request): share de nota/calendário, │
│  convite, RSVP, reservas de agendamento, webhook Stripe                │
│         └── createNotification() ─► INSERT em `notifications`          │
│                                                                        │
│  UI: sino + slideover ← [Fase C] Realtime para aparecer ao vivo        │
└────────────────────────────────────────────────────────────────────────┘
```

**Regra de divisão:** quem dispara por **relógio** vive no kortex-api com acesso direto ao banco; quem dispara por **ação do usuário** vive no kortex-app, no próprio endpoint da ação. A tabela `notifications` é o ponto de encontro — os dois lados escrevem nela com a mesma disciplina (§1.3).

### 1.2 Por que acesso direto (e não HTTP para endpoints de scan do kortex-app)

1. **É o padrão que já existe e funciona**: o `close-day` roda assim há tempo — repositories próprios, service role, backfill, idempotência. Notificações seguem o mesmo trilho, com a mesma infraestrutura de scheduler/lock/logs.
2. **Sem dependência da Vercel no caminho crítico**: um deploy quebrado, cold start ou timeout de serverless no kortex-app não impede lembretes de sair. Scans longos também não brigam com o limite de execução de função serverless.
3. **Sem contrato HTTP para manter**: o risco "contrato entre repositórios" apontado no `PLANO_NOTIFICACOES.md` §9 desaparece, junto com o problema do guard fail-open do `CRON_SECRET` (§4.2).
4. **Backfill natural**: com o banco na mão, o job pode usar marca-d'água de última execução (§5.4) e reprocessar janelas perdidas após downtime — exatamente como o `close-day` faz com seus 7 dias.

**O custo, dito com clareza:** a lógica de domínio necessária aos scans precisa ser **portada** para o kortex-api:

| O que portar | De onde | Tamanho | Risco de drift |
| --- | --- | --- | --- |
| Motor de recorrência (`expandRecurrence` + exceções de série) | `kortex-app/server/utils/recurrence.ts` | ~214 linhas | ⚠️ **Alto** — é a única duplicação perigosa: qualquer mudança nas regras de recorrência no kortex-app precisa ser espelhada. Mitigação: cabeçalho de comentário em ambos os arquivos apontando um para o outro ("mantenha em sincronia com …"), e teste manual de paridade ao mexer |
| Emissor (checagem de preferências + insert com dedupe) | `kortex-app/server/utils/notifications.ts` | ~75 linhas | Baixo — lógica estável e pequena |
| Conversão de timezone por usuário | `kortex-app/server/utils/timezone.ts` | pequeno | Baixo |

Esse custo é aceito conscientemente em troca dos itens 1–4.

### 1.3 Disciplina comum de escrita (obrigatória nos dois repos)

Todo produtor — síncrono no kortex-app ou job no kortex-api — segue as mesmas regras ao inserir em `notifications`:

1. **Service role sempre** (não há policy de INSERT; RLS só permite leitura/update pelo dono).
2. **Respeitar `notification_preferences`** antes de inserir (`channel_in_app` + o toggle da categoria, quando existir — §6.2).
3. **`external_id` determinístico** em tudo que pode se repetir (jobs), tratando violação `23505` como "já notificado" (sucesso silencioso). Notificações síncronas de ação única podem omitir.
4. **`category` do catálogo** (§3) — nunca inventar categoria fora do catálogo sem atualizá-lo.
5. **`link_path` o mais profundo possível** (levar ao item, não ao módulo).

### 1.4 Destino dos endpoints HTTP de scan existentes no kortex-app

| Endpoint | Situação | Destino |
| --- | --- | --- |
| `POST /api/appointments/reminders-scan` | Implementado, nunca foi chamado por cron | **Deprecar** após o job direto do kortex-api entrar (§5.5). Útil antes disso para testar comportamento esperado e validar paridade do port |
| `POST /api/habits/cron-skip` | Redundante com o `close-day` | **Deprecar** (fallback manual até lá) |
| `POST /api/notes/trash/purge` | Funciona, sem notificações | **Portar** a lógica de purge para um job direto no kortex-api (é um delete simples com cutoff) e deprecar |

Quando os três caírem, o `CRON_SECRET`/`x-cron-secret` do kortex-app pode ser removido por completo — enquanto existirem, aplicar o fix fail-closed do §4.2.

---

## 2. Estado real hoje (inventário verificado no código)

### 2.1 kortex-app — o que existe e funciona

- **Schema completo**: `notifications` (com `channels`, `category`, `source`, `external_id` + índice único parcial para dedupe), `notification_preferences` (8 toggles), `notification_push_subscriptions` (registro de devices OneSignal), `event_reminders`. RLS: usuário lê/atualiza as próprias; **não há policy de INSERT** — só service role escreve.
- **Emissor central**: `server/utils/notifications.ts` → `createNotification()` — respeita `channel_in_app`, trata `23505` + `externalId` como "já notificado". **Grava `channels: ['in_app']` fixo** (ponto de extensão da Fase B).
- **Produtores síncronos ativos**: share de nota, share de calendário, convite de participante, RSVP, e 3 fluxos do webhook Stripe (este último por um caminho legado próprio, `safeInsertNotification` na edge function).
- **Scan HTTP de lembretes**: `POST /api/appointments/reminders-scan` (existe, completo — recorrência, exceções, dedupe — mas nunca disparado; será fonte do port §5.5 e depois deprecado). Dois bugs conhecidos que o port **não deve herdar**: notifica o dono do evento ignorando `event_reminders.user_id` (lembrete de participante vai à pessoa errada) e faz full-table scan de `event_reminders`.
- **API de leitura**: `GET /api/notifications`, `POST /api/notifications/read`, `POST /api/notifications/read-all`.
- **UI**: `NotificationsButton` (sino + badge) e `NotificationsSlideover`. ⚠️ Carrega **uma única vez por sessão** — sem polling nem realtime; notificação criada por job só aparece após reload (Fase C).
- **Configurações**: `app/pages/app/settings/notifications.vue` — canais (in-app, email, web push, mobile push), tópicos (`habit_reminders`, `weekly_digest`, `product_updates`, `important_updates`), gestão de devices. **Não existe toggle para lembrete de eventos** (§6.2).
- **Push (cliente)**: integração OneSignal completa (web/PWA/nativo), desligada fora de produção por design. Devices registrados em `notification_push_subscriptions`… **e nada no servidor jamais chama a REST API do OneSignal**. Não há chave REST em lugar nenhum. Maior gap ponta a ponta (Fase B).
- **Sem e-mail**: nenhuma lib, nenhum endpoint. `channel_email` é decorativo (fora do escopo deste doc).

### 2.2 kortex-api — o que existe e funciona

- Express 5 + TS estrito, `node-cron` com timezone (`TZ`, default `Europe/Lisbon`), **processo único** em PM2 (nunca cluster — duplicaria os crons), Nginx na frente, logs diários com retenção de 30 dias.
- **Job `close-day`**: agendado por env, lock guard, backfill de 7 dias, idempotente por upsert, acesso direto via service role — **o molde de todos os jobs novos**.
- **Trigger manual**: `GET|POST /api/jobs/close-day` com `Authorization: Bearer <JOB_TRIGGER_TOKEN>` (middleware `jobAuth`, fail-closed).
- **Rota de webhooks** já esqueletada (`/api/webhooks/example`) — reaproveitada na Fase B (§6.3).
- **Nenhum job de notificações ainda** — é o trabalho do §5.

### 2.3 Erratas dos documentos anteriores

| Afirmação no doc antigo | Realidade no código |
| --- | --- |
| `PLANO_NOTIFICACOES.md` §7 item 5: scan de lembretes "❌ não implementado" | ✅ Implementado (`reminders-scan.post.ts`, commit `075c170`) — o que nunca existiu foi o disparo |
| Docs chamam o endpoint de `/api/appointments/cron-reminders` | Caminho real: `/api/appointments/reminders-scan` |
| `PLANO_NOTIFICACOES.md` §5.2: "scheduling resolvido por CRON externo chamando endpoints de scan via `x-cron-secret`" | **Superado por este documento**: o cron externo acessa o Supabase diretamente; os endpoints de scan serão deprecados (§1.4) |
| `1.APPOINTMENTS.md` §7: "nenhum job/cron lê `event_reminders`" | Falso desde `075c170` |
| `PLANO_INTEGRACAO_MODULOS.md` §8: metas não têm campo de prazo | `goal_tasks.due_date` existe desde `20260905000000` |
| Docs citam só o produtor de share de nota | Também existem: share de calendário, convite de participante e RSVP |

---

## 3. Catálogo de notificações

Mapa completo — cada notificação que existe, que está planejada ou que está bloqueada. `Origem`: **sync** = disparada no request da ação (kortex-app) · **job** = disparada pelo cron (kortex-api) · **webhook** = Stripe edge function.

### 3.1 Existentes hoje

| Categoria | Origem | Descrição | Destinatário | Mensagem (real) | Dedupe (`external_id`) |
| --- | --- | --- | --- | --- | --- |
| `appointment_reminder` | job (a ativar) | Lembrete de evento da Agenda, X minutos antes do início; suporta recorrência e exceções de série. | Dono do lembrete (`event_reminders.user_id` — corrigir o bug do owner no port) | `Lembrete: "{título}" começa em {quando}.` | `event-reminder-{eventId}-{recurrenceId\|single}-{reminderId}` |
| `event_invite` | sync | Alguém adicionou o usuário como participante de um evento. | Convidado | `{nome} convidou você para "{título}".` | — |
| `event_rsvp` | sync | Um participante respondeu ao convite (aceitou/recusou/talvez). | Dono do evento | `{nome} {aceitou/recusou/…} "{título}".` | — |
| `calendar_shared` | sync | Alguém compartilhou um calendário com o usuário. | Destinatário do share | `{nome} compartilhou o calendário "{nome}" com você.` | — |
| `note_shared` | sync | Alguém compartilhou uma nota com o usuário. | Destinatário do share | `{nome} compartilhou a nota "{título}" com você.` | — |
| billing — assinatura | webhook | Assinatura Stripe criada, cancelada ou com cancelamento agendado. | Assinante | `Assinatura iniciada com sucesso.` / `Sua assinatura foi cancelada.` / `Cancelamento da assinatura agendado para o fim do período.` | — (caminho legado, sem categoria) |
| billing — fatura | webhook | Fatura paga ou falha de pagamento. | Assinante | `Pagamento confirmado. Sua fatura está disponível.` / `Falha no pagamento. Atualize sua forma de pagamento.` | — (idem) |

### 3.2 Mapeamento de cobertura — mecanismo de lembretes de Agenda/Agendamento

Além do catálogo de categorias (§3.1/§3.5/§3.6), esta seção verifica especificamente o **mecanismo** de lembrete em si — de ponta a ponta, para os dois módulos que usam "agendamento": a **Agenda** (eventos/`event_reminders`) e o **Agendamento** (páginas de reserva pública). Objetivo: garantir que nenhum lembrete relevante ficou de fora do mapa. (A mesma verificação de mecanismo, para Hábitos e para o Diário de Bordo, está nos §3.3 e §3.4 a seguir.)

**Cobertura confirmada (funciona, uma vez que o job §5.5 estiver rodando):**

| Cenário | Cobertura |
| --- | --- |
| Evento único com lembrete, X min antes | ✅ `appointment_reminder`, `event_reminders.minutes_before` |
| Evento recorrente (`rrule`) com lembrete | ✅ `expandRecurrence` calcula cada ocorrência dentro da janela |
| Ocorrência de série cancelada individualmente | ✅ `event_exceptions` (`type: 'cancelled'`) é consultada e a ocorrência é pulada |
| Evento/calendário arquivado | ✅ pulado antes de notificar |
| Convite de participante recebido | ✅ `event_invite` (síncrono, na hora do convite) |
| Resposta de RSVP de participante | ✅ `event_rsvp` (síncrono) |

**Gaps encontrados no mecanismo (não são só "categoria faltando" — são falhas de cobertura reais):**

| # | Gap | Onde | Impacto |
| --- | --- | --- | --- |
| 1 | **Reserva pública não gera nenhum lembrete.** `book.post.ts` chama `createEventInternal(...)` sem o parâmetro `reminders` (que a função aceita — `server/utils/appointments-events.ts:13,56-64`). O evento criado a partir de uma reserva de `/agendar/[token]` nasce **sem nenhuma linha em `event_reminders`**. | `server/api/schedule/[token]/book.post.ts` | O anfitrião não recebe lembrete algum do compromisso agendado por um convidado — só dos que ele mesmo cria manualmente pela Agenda |
| 2 | **Lembrete só é editável na criação do evento.** `EventCreateModal.vue` tem um único campo `reminderMinutes` (padrão 10 min, `-1` = sem lembrete). `EventDetailSlideover.vue` só **exibe** lembretes existentes (`v-if="event.reminders?.length"`) — não há nenhum botão de editar/adicionar/remover depois que o evento existe. O endpoint `POST /api/appointments/events/[id]/reminders` (que faz exatamente isso) existe e funciona, mas **nenhum componente o chama**. | `EventCreateModal.vue`, `EventDetailSlideover.vue` | Impossível adicionar lembrete a um evento existente, corrigir o horário, ou adicionar um segundo lembrete pela UI — mesmo a API suportando |
| 3 | **Só um lembrete por evento, sempre tipo `popup`.** O schema (`event_reminders`, `UNIQUE(event_id, user_id, type, minutes_before)`) suporta múltiplos lembretes por evento (ex.: "1 dia antes" + "15 min antes", ou `email`/`push`) — mas a UI só grava um, e sempre `ReminderType.Popup`. Os valores `email`/`push` do enum `reminder_type` nunca são produzidos por nenhum caminho do código. | `EventCreateModal.vue:31,129-130` | Recurso de "vários lembretes" e tipos alternativos existe só no schema, não no produto |
| 4 | **Nenhum lembrete chega ao convidado da reserva pública.** O convidado de uma página de Agendamento não tem conta — não existe canal in-app para ele. Um lembrete tipo Calendly ("sua reunião é em 1h") exigiria e-mail, que não existe no projeto (§2.1, §3.7). Este é o único item do catálogo inteiro que é genuinamente "outras pessoas" (ver "Escopo desta fase" no topo do documento) — fica para depois por decisão de produto, não só por falta de e-mail. | `agendar/[token].vue`, `book.post.ts` | Ausência de recurso, não bug — mas é a lacuna mais visível se comparado a qualquer concorrente de agendamento |
| 5 | **Eventos de dia inteiro (`all_day: true`) não têm tratamento especial no scan.** `reminderAt = startAt − minutesBefore` é calculado igual a um evento com hora — não há lógica de "lembrar às 09:00 do dia" como fazem outros calendários. Não confirmado como bug ativo (não há teste), mas o código não trata o caso. | `reminders-scan.post.ts:59-60` (e o port §5.5) | Comportamento de lembrete em evento de dia inteiro é indefinido/não testado |

**Ações recomendadas por prioridade** (fora da ordem geral do §7 — avaliar se entram no roadmap):

- **Gap 1 é o mais barato e valioso**: adicionar um lembrete padrão (ex.: 30 min antes) ao criar o evento em `book.post.ts`, ou — melhor — herdar da configuração da própria `SchedulingPage` se/quando ela ganhar um campo de lembrete padrão (nenhum existe hoje; seria uma migration nova).
- **Gap 2** destrava sozinho o "múltiplos lembretes" (gap 3) sem exigir nenhuma mudança de schema — é só conectar a UI ao endpoint que já existe.
- **Gap 4** só faz sentido depois da Fase 5 de e-mail (fora deste documento) — registrar como dependência, não implementar.

### 3.3 Mapeamento de cobertura — notificações de hábitos

Mesmo exercício do §3.2, agora para Hábitos. Achado central: existe **uma única configuração de lembrete**, ela é **genuinamente global** (não por hábito), e — diferente do que os docs anteriores sugeriam — **nada em nenhum dos dois repositórios jamais a leu para enviar algo**. Não é "scan não implementado ainda"; é "campo configurável no banco desde sempre, zero consumidores".

**O que existe hoje (confirmado no código):**

| Peça | Onde | Realidade |
| --- | --- | --- |
| `habit_user_settings` | 1 linha por usuário (`user_id` é a PK — não é por hábito) | `review_day` (dia da semana da revisão semanal), `review_reminder_enabled` (bool), `review_reminder_time` (`time`, default `09:00`), `share_token`/`share_enabled` |
| `notification_preferences.habit_reminders` | 1 bool por usuário | Toggle **módulo inteiro**, tudo-ou-nada — mesmo problema decorativo dos outros toggles (§2.1) |
| Consumidores de `review_reminder_enabled`/`review_reminder_time` | — | **Nenhum.** Só as telas de configuração (`SettingsModal.vue`) leem/escrevem; nenhum job, endpoint ou função de envio em nenhum dos dois repos jamais consulta esses campos |
| "N hábitos pendentes hoje" | `GET /api/habits/today` → `TodayHabitsResponse { completedCount, totalCount }` | Dado já existe e já é exibido no dashboard (`DashboardTodayHabits.vue`) — mas só quando o usuário abre o app; nunca é empurrado proativamente |
| "Sequência em risco" | Derivável de `habit_streaks.current_streak > 0` + hábito devido hoje + sem log ainda | **Não existe nenhum campo/flag "at risk"** — o sinal é 100% calculável a partir de dados já existentes, mas ninguém o calcula fora do request síncrono de `log.post.ts` |
| Marco de sequência (7/30/100 dias) | `habit_streaks.current_streak`/`longest_streak` | **Não existe nenhuma celebração.** `longest_streak` é só armazenado e exibido — nunca comparado a um limiar para disparar algo |
| Dia perdido (`status: 'skipped'`) | `habit_logs.status` | Silencioso por completo — o usuário só descobre abrindo o app e vendo o histórico vermelho ("Não feito") |
| **Duplicação a resolver** | — | **Duas rotinas fazem a mesma coisa hoje**: o `close-day` do kortex-api (§2.2, direto no banco) **e** o próprio kortex-app tem `POST /api/habits/cron-skip` (via `x-cron-secret`) — ambos marcam hábitos sem log como `skipped`. Nenhum dos dois notifica; ambos só gravam o status. Decisão já registrada no §1.4: manter o `close-day` como oficial, aposentar o `cron-skip` do kortex-app |

**Notificações novas propostas para o catálogo** (nenhuma tem schema/código hoje — são a expansão pedida):

| Categoria | Origem | Descrição | Gatilho | Mensagem (proposta) | Dedupe |
| --- | --- | --- | --- | --- | --- |
| `habit_review_reminder` | job, */15 min | Lembrete diário no horário escolhido pelo usuário (`review_reminder_time`, timezone local). O único que já tinha entrado no roadmap — confirmado aqui como **realmente nunca implementado do lado de envio**, nos dois repos. | `review_reminder_enabled = true` e horário local caiu na janela | `Hora de revisar seus hábitos de hoje.` | `habit-review-{userId}-{dataLocal}` — máx. 1/dia |
| `habit_pending_today` | job, 1×/dia (fim de tarde/noite, horário local) | "Ainda dá tempo" — hábitos do dia que restaram sem log, reaproveitando o mesmo cálculo de `/api/habits/today`. Mais barato que o de revisão: não precisa de nenhuma configuração nova, só decidir o horário fixo de disparo (ex.: 20:00 local) e checar `totalCount − completedCount > 0`. | Horário local fixo (ex.: 20:00) e `pendentes > 0` | `Você tem {n} hábito(s) pendente(s) hoje.` | `habit-pending-{userId}-{dataLocal}` |
| `habit_streak_at_risk` | job, mesmo scan do anterior | Variante mais específica: só para hábitos com `current_streak > 0` — o corte é "você vai perder uma sequência", não só "ainda falta algo". Pode substituir ou coexistir com `habit_pending_today` (evitar mandar os dois no mesmo dia para o mesmo usuário). | `pendente hoje` + `streak.currentStreak > 0` | `Sua sequência de {n} dias em "{hábito}" está em risco — ainda não registrado hoje.` | `habit-streak-risk-{habitId}-{dataLocal}` |
| `habit_streak_milestone` | **síncrono**, não precisa de job | Diferente dos outros três: o streak já é recalculado em `POST /api/habits/log` a cada log (`updateStreakCache`, `server/api/habits/log.post.ts`). É só comparar `current_streak` antes/depois do recálculo contra uma lista de limiares (7, 30, 100…) e disparar `createNotification` na hora, dentro do mesmo request — **sem esperar nenhum cron**. É a notificação mais barata de todo este documento. | `current_streak` cruza um limiar da lista | `🔥 {n} dias seguidos em "{hábito}"!` | não precisa — evento único por natureza (streak só cresce 1/dia) |

**Gap de produto registrado (não implementar agora, só documentar):** `docs/habits/ANALISE_HABITOS_MERCADO.md:28` já aponta que todo concorrente pesquisado (Streaks, HabitKit, Habitica, Become) notifica por **hábito/horário individual**, enquanto o Kortex só tem o toggle módulo-inteiro `habit_reminders` — e mesmo a única configuração de horário (`review_reminder_time`) é uma só para todos os hábitos, não por hábito. Migrar para lembrete por hábito é mudança de schema (`habits` ganharia campo próprio de horário) — fora do escopo desta fase, mas é o próximo passo natural depois que o global funcionar.

### 3.4 Mapeamento de cobertura — notificações do Diário de Bordo

Mesmo exercício dos §3.2/§3.3, agora para o Diário de Bordo (Journal). Achado central, diferente dos outros dois módulos: aqui **não há nem o campo de configuração** — Hábitos tinha `review_reminder_time` sem consumidor (§3.3); o Diário não tem sequer a coluna. E existe um **bug ativo, independente de qualquer notificação**, que precisa ser corrigido antes de construir algo em cima.

**O que existe hoje (confirmado no código):**

| Peça | Onde | Realidade |
| --- | --- | --- |
| Sequência (streak) de dias escritos | `GET /api/journal/today` (`server/api/journal/today.get.ts:20-44`) | Calculada **na hora, a cada chamada** — busca até 60 `entry_date` recentes e conta dias consecutivos para trás. **Não é persistida** (diferente de `habit_streaks`, que é uma tabela cache atualizada a cada log) |
| Exibição da sequência | `TodayEditor.vue` (badge `🔥 {{ streak }} dias`) e `journal/index.vue` (view de insights) | Só client-side, só quando o usuário abre o app |
| Humor por entrada | `journal_entries.mood` | Vivo e usado (marcador no calendário do Diário e na Agenda) — não confundir com as tabelas de métricas/tags manuais, que **estão mortas** desde a remoção de 2026-08-23 (nenhum código de servidor as lê mais — não usar como gatilho de notificação) |
| Presença de entrada no calendário do Diário e na Agenda | `CalendarView.vue`, `journalEntryToMarker()` em `appointments.vue` | Só mostra dias **com** entrada — nenhum dos dois sinaliza visualmente um dia sem entrada (mesmo padrão de ausência-nunca-sinalizada do §3.3) |
| Configuração de lembrete (horário, dias, "avise se eu não escrevi") | — | **Não existe em lugar nenhum** — nem tabela, nem coluna, nem toggle na tela de configurações. `notification_preferences` tem `habit_reminders` mas nenhum `journal_reminders` |
| Cron/job para o Diário | — | **Não existe nenhum**, nos dois repositórios |
| "Entrada incompleta" | `entries.post.ts` valida só `content.min(1)` | O modelo é binário: vazia (nunca salva) ou não-vazia (conta, ponto final) — não há "começou e não terminou" para acionar um lembrete de retomada |

**⚠️ Bug encontrado, a corrigir antes de qualquer lembrete (não é sobre notificação — é sobre corretude):** "hoje" no módulo de Diário é calculado em **UTC**, não na timezone do usuário — confirmado tanto no servidor (`today.get.ts:9`, `new Date().toISOString().split('T')[0]`) quanto no cliente (`TodayEditor.vue:35`, mesmo padrão). Para um usuário no Brasil (UTC-3), o "hoje" do servidor vira o dia seguinte às 21h no horário local — ou seja, uma entrada escrita às 22h local pode ser gravada com `entry_date` de amanhã. Isso já é um bug de UX hoje (a pessoa pode ver duas "entradas de hoje" diferentes na mesma noite, dependendo de quando abriu o app), e torna qualquer lembrete cron baseado em "essa pessoa não escreveu hoje" **estruturalmente incorreto** até ser corrigido — o mesmo `user_preferences.timezone` já usado (ou a usar) pelos scans de Agenda/Hábitos resolve isso aqui também.

**Notificações novas propostas para o catálogo** (nenhuma tem schema/código hoje):

| Categoria | Origem | Descrição | Gatilho | Mensagem (proposta) | Dedupe |
| --- | --- | --- | --- | --- | --- |
| `journal_reminder` | job, 1×/dia (horário configurável) | Lembrete de escrever no Diário — precisa de **schema novo**: tabela `journal_user_settings` espelhando `habit_user_settings` (`reminder_enabled boolean`, `reminder_time time default '21:00'` — diário costuma ser reflexão de fim de dia, horário padrão diferente do de hábitos) + toggle `journal_reminders` em `notification_preferences`/tela de configurações. | `reminder_enabled = true`, horário local (corrigido pelo bug acima) caiu na janela, e **sem entrada hoje** | `Como foi o seu dia? Escreva no Diário.` | `journal-reminder-{userId}-{dataLocal}` — máx. 1/dia |
| `journal_streak_at_risk` | mesmo job, variante | Mesmo padrão do `habit_streak_at_risk` (§3.3): quando o usuário tem sequência ativa (streak > 0 no momento do scan) e ainda não escreveu hoje, a mensagem é mais específica/urgente que o lembrete genérico. **Não mandar os dois no mesmo dia** — se há sequência em risco, manda só esse. | `journal_reminder` elegível + `streak > 0` | `Sua sequência de {n} dias no Diário está em risco — você ainda não escreveu hoje.` | `journal-streak-risk-{userId}-{dataLocal}` |
| `journal_streak_milestone` | síncrono (recomendado) ou job | Igual ao `habit_streak_milestone` (§3.3) em espírito, mas **exige um passo a mais**: hoje o streak do Diário só é calculado em `GET /today`, não em `POST /entries` (o endpoint de salvar). Para ser síncrono e barato como o de hábitos, `entries.post.ts` precisaria rodar o mesmo cálculo (walk de até 60 linhas — barato) e comparar antes/depois contra os limiares. Alternativa mais preguiçosa: calcular dentro do job diário acima, comparando com o último marco já notificado (guardado em `metadata` da última `journal_streak_milestone` ou numa coluna `last_milestone_notified` na tabela `journal_user_settings` proposta). Recomendação: fazer a versão síncrona — é o mesmo padrão já validado em Hábitos. | `streak` cruza um limiar (7, 30, 100…) | `🔥 {n} dias seguidos escrevendo no Diário!` | não precisa (síncrono) — se virar job, `journal-streak-milestone-{userId}-{n}` |

**Gap de produto registrado (não implementar agora, só documentar):** diferente de Hábitos (que tinha o campo e só faltava o consumidor), aqui o trabalho de schema é maior — não existe `journal_user_settings`. Vale considerar, quando for desenhar essa tabela, se o mesmo padrão "um horário global" (como hábitos) é suficiente ou se o Diário já nasce com dias-da-semana configuráveis (ex.: só lembrar em dias úteis) — mais barato de decidir agora, no desenho da migration, do que depois de já ter uma versão em produção para migrar.

### 3.5 Planejadas — jobs no kortex-api, vencimentos de outros módulos (Fase D)

| Categoria | Frequência do job | Descrição | Destinatário | Mensagem (proposta) | Dedupe |
| --- | --- | --- | --- | --- | --- |
| `task_due` | 1×/hora | Tarefa com `due_date` = hoje (data local do usuário), emitida quando a manhã local chega (~09:00). | Dono da tarefa | `A tarefa "{título}" vence hoje.` | `task-due-{taskId}-{dataLocal}` |
| `idea_due` | 1×/hora (mesmo job) | Ideia com prazo para hoje — mesmo mecanismo das tarefas. | Dono da ideia | `A ideia "{título}" tem prazo para hoje.` | `idea-due-{ideaId}-{dataLocal}` |
| `installment_due` | 1×/hora (mesmo job) | Parcela de dívida não paga vencendo hoje. | Dono da dívida | `A parcela {n}/{total} de "{dívida}" vence hoje.` | `installment-due-{installmentId}-{dataLocal}` |
| `goal_task_due` | 1×/hora (mesmo job) | Tarefa de meta com `due_date` = hoje. | Dono da meta | `A tarefa "{título}" da meta "{meta}" vence hoje.` | `goal-task-due-{taskId}-{dataLocal}` |

### 3.6 Planejadas — síncronas no kortex-app (módulo de Agendamento, hoje mudo!)

O fluxo público de reservas **não emite nenhuma notificação** — o anfitrião só descobre uma reserva nova abrindo a Agenda. São as adições síncronas de melhor custo-benefício do catálogo (uma chamada a `createNotification` em endpoints que já existem):

| Categoria | Gatilho (endpoint existente) | Descrição | Destinatário | Mensagem (proposta) |
| --- | --- | --- | --- | --- |
| `booking_created` | `POST /api/schedule/[token]/book` | Um convidado reservou um horário pelo link público. | Anfitrião | `{convidado} reservou "{página}" em {data} às {hora}.` |
| `booking_cancelled` | `POST /api/schedule/manage/[token]/cancel` | O convidado cancelou a reserva (com motivo, quando exigido). | Anfitrião | `{convidado} cancelou a reserva de {data}.` (+ motivo) |
| `booking_rescheduled` | `POST /api/schedule/manage/[token]/reschedule` | O convidado moveu a reserva para outro horário. | Anfitrião | `{convidado} reagendou de {antes} para {depois}.` |

### 3.7 Bloqueadas / futuras (registrar, não implementar agora)

| Categoria | Bloqueio | Descrição |
| --- | --- | --- |
| `weekly_digest` | Falta job de agregação | Resumo semanal (toggle já existe na tela de configurações). |
| `product_updates` / `important_updates` | Falta caminho de emissão admin | Comunicados do produto — os toggles existem; nada os emite. |
| Lembrete de hábito **por hábito** (não global) | Falta campo de horário em `habits`/`habit_versions` | Migration nova + UI por hábito — gap de produto registrado no §3.3, próximo passo natural depois do lembrete global funcionar. |
| e-mail (canal) | Sem provedor de e-mail no projeto | Todo o canal `channel_email` — depende da infra da Fase 5 do plano de agendamento. |

---

## 4. Segurança

| Segredo | Onde vive | Protege | Observação |
| --- | --- | --- | --- |
| `SUPABASE_SERVICE_ROLE_KEY` | env dos dois repos | Tudo | Já é assim hoje (close-day); nunca sai do servidor |
| `JOB_TRIGGER_TOKEN` | env do kortex-api | Triggers manuais `/api/jobs/*` | ⚠️ O Droplet serve **HTTP puro** — o Bearer token viaja em texto claro num trigger externo. **Recomendado:** TLS no Nginx (Let's Encrypt) antes de usar triggers de fora, ou restringi-los a `curl` via SSH no servidor |
| `WEBHOOK_NOTIFICATIONS_SECRET` (novo, Fase B) | env do kortex-api + config do Database Webhook | `POST /api/webhooks/notification-created` | Header secreto configurado no webhook do Supabase (§6.3) |
| `CRON_SECRET` / `x-cron-secret` | kortex-app | Endpoints de scan legados | Só até a deprecação (§1.4). Enquanto existirem: **corrigir o fail-open** — hoje, sem `CRON_SECRET` setado, o guard pula a checagem e os endpoints ficam públicos. Fix em `server/utils/require-cron-secret.ts`: em produção, sem secret → `503` (mesmo comportamento do `jobAuth`) |

---

## 5. Implementação no kortex-api (o grosso do trabalho)

Seguir o padrão do `close-day` — cada item indica o arquivo espelho.

### 5.1 Novas variáveis de ambiente (`src/config/env.ts` + `.env.example`)

```bash
# Agendas (expressões node-cron, TZ do processo)
CRON_REMINDERS_SCAN_SCHEDULE=*/5 * * * *
CRON_HABITS_SCAN_SCHEDULE=*/15 * * * *
CRON_DUE_SCAN_SCHEDULE=0 * * * *
CRON_TRASH_PURGE_SCHEDULE=0 3 * * *

# Quanto tempo antes do instante do lembrete ele pode ser emitido (min)
REMINDERS_LEAD_MINUTES=5
```

### 5.2 Ports de utilidades (novos arquivos)

- `src/utils/recurrence.ts` — **port fiel** de `kortex-app/server/utils/recurrence.ts` (~214 linhas) + leitura de `event_exceptions` para pular ocorrências canceladas. Adicionar no topo dos **dois** arquivos: `// MANTENHA EM SINCRONIA COM <caminho no outro repo>`.
- `src/utils/timezone.ts` — conversões data/hora local por `user_preferences.timezone`.

### 5.3 Repositório de notificações — `src/repositories/notification.repository.ts` (novo)

Port da disciplina do `createNotification` do kortex-app (§1.3):

```ts
async insert(params: { userId, category, body, linkPath, externalId, metadata? }) {
  // 1. lê notification_preferences do usuário; channel_in_app === false → return null
  // 2. (quando existir toggle da categoria — §6.2 — checa também)
  // 3. insert com channels: ['in_app'], source: 'cron', type: 'system'
  // 4. erro 23505 com externalId → "já notificado", return null (sucesso)
}
```

Dica de eficiência para os jobs: buscar preferências **em lote** (`.in('user_id', [...])`) antes do loop, não uma query por notificação.

### 5.4 Marca-d'água de execução — tabela `cron_job_runs` (migration nova no kortex-app)

A vantagem concreta do acesso direto: janela com memória, em vez de janela cega para frente.

```sql
create table if not exists public.cron_job_runs (
  job_name text primary key,
  last_run_at timestamptz not null
);
-- sem RLS de leitura pública; só service role acessa
```

Cada job de scan calcula a janela como `[max(last_run_at, agora − 24h), agora + lead]`, processa, e só então atualiza `last_run_at = agora`. Consequências:

- **Downtime não perde lembrete**: se o processo ficar 40 min fora, a próxima execução cobre o buraco (limitado a 24h para não inundar após um gap gigante) — o equivalente ao backfill do `close-day`.
- **Sobreposição é grátis**: o dedupe por `external_id` absorve qualquer reprocessamento.
- A restrição frágil do design HTTP antigo ("intervalo do cron ≤ windowMinutes, senão perde silenciosamente") **deixa de existir**.

### 5.5 Job de lembretes de eventos — `src/jobs/reminders-scan.job.ts` + `src/services/reminders-scan.service.ts` (novos)

Lógica portada do endpoint `reminders-scan.post.ts` do kortex-app, **com as correções que o original não tem**:

1. Janela por marca-d'água (§5.4), com `lead = REMINDERS_LEAD_MINUTES`.
2. **Query estreitada no banco** (não full-table): eventos não-recorrentes filtrados por `events.start_at` dentro de `[janela.início, janela.fim + max(minutes_before)]`; recorrentes (`rrule not null`) expandidos em memória via o port do §5.2. Paginação como no `close-day`.
3. Pular eventos/calendários arquivados e ocorrências canceladas (`event_exceptions`).
4. **Destinatário = `event_reminders.user_id`** (o dono do lembrete), não o dono do evento — corrige o bug do original.
5. `link_path` profundo: `/app/appointments?view=day&date=YYYY-MM-DD` (a página já lê `?view=`).
6. Emissão via `NotificationRepository` com o `external_id` do catálogo (§3.1) — **manter o formato existente** para não re-notificar lembretes que o endpoint antigo já tenha emitido em testes.
7. Lock guard + registro no scheduler + trigger manual `GET|POST /api/jobs/reminders-scan` (jobAuth), espelhando o close-day.

### 5.6 Job de hábitos — `src/jobs/habits-scan.job.ts` (novo — priorizado, ver §7)

Cobre as três notificações de job do catálogo §3.3 no mesmo job (uma varredura de `habit_user_settings` + `habits`/`habit_versions`/`habit_streaks` por execução, filtrando por usuário):

1. **`habit_review_reminder`** (a */15 min): usuários com `review_reminder_enabled = true` cujo `review_reminder_time` (convertido da timezone do usuário para UTC) caiu na janela da marca-d'água. `external_id` com data local garante máx. 1/dia.
2. **`habit_pending_today`** (1×/dia, horário fixo ex. 20:00 local — não depende de configuração do usuário): para cada usuário, roda a mesma lógica de `isDueOnDay` + `habit_logs` do endpoint `/api/habits/today` (portar o filtro, não o endpoint inteiro) e conta pendências. Emite só se `pendentes > 0`.
3. **`habit_streak_at_risk`** (mesma passada do item 2): dentre os hábitos pendentes do usuário, filtra os com `habit_streaks.current_streak > 0`. **Não mandar os dois (`habit_pending_today` e `habit_streak_at_risk`) no mesmo dia para o mesmo usuário** — se há hábito(s) em risco, mandar só esse (mais específico e mais urgente); `habit_pending_today` cobre o caso de ninguém ter streak ativo.

`habit_streak_milestone` (a 4ª notificação do catálogo §3.3) **não entra neste job** — é síncrona, implementada direto em `POST /api/habits/log` no kortex-app (§6.7), não no kortex-api.

### 5.7 Job do Diário de Bordo — `src/jobs/journal-scan.job.ts` (novo)

**Pré-requisito obrigatório antes deste job existir**: corrigir o bug de timezone do §3.4 — trocar `new Date().toISOString().split('T')[0]` por "hoje na timezone do usuário" em `server/api/journal/today.get.ts` (e, no cliente, `TodayEditor.vue`) no kortex-app. Sem isso, o job estaria comparando "hoje" errado para qualquer usuário fora de UTC — o mesmo bug se propagaria para o cron.

Depois do fix, mesmo padrão do job de hábitos (§5.6), varrendo `journal_user_settings` (tabela nova, ver §3.4) + `journal_entries`:

1. **`journal_reminder`** (1×/dia, horário por usuário via `journal_user_settings.reminder_time`): emite se não houver `journal_entries` para a data local do usuário.
2. **`journal_streak_at_risk`** (mesma passada): variante quando o streak recalculado (mesmo walk de até 60 dias do `today.get.ts`, portado) é `> 0`. Mesma regra de exclusividade do §5.6: nunca os dois no mesmo dia para o mesmo usuário.

`journal_streak_milestone` **não entra neste job** — recomendação é síncrona, em `POST /api/journal/entries` no kortex-app (§6.8), espelhando `habit_streak_milestone`.

### 5.8 Job de vencimentos — `src/jobs/due-scan.job.ts` (novo, Fase D)

1×/hora: para cada usuário com itens vencendo (`tasks`, `ideas`, `debt_installments` não pagas, `goal_tasks` — todos `due_date` tipo `date`), emite quando `data local == due_date` **e** hora local ≥ 09:00. Conversão por `user_preferences.timezone` obrigatória — "hoje" é conceito local. Um job só, quatro categorias.

### 5.9 Job de purge — `src/jobs/trash-purge.job.ts` (novo)

Port do delete com cutoff do endpoint `/api/notes/trash/purge` (diário, 03:00). Depois disso o endpoint HTTP é deprecado junto com os demais (§1.4).

### 5.10 Observabilidade

- Logar sempre as contagens (`{ notified }` por categoria) — sequência longa de zeros em horário ativo é o alarme.
- Manter **processo único** no PM2 (aviso já existente no README do kortex-api).

---

## 6. Implementação no kortex-app (o lado menor)

### 6.1 Fase C — UI ao vivo

O slideover carrega uma vez por sessão; notificação de job só aparece com reload. Em ordem de preferência:

1. **Supabase Realtime** na tabela `notifications` (canal filtrado por `user_id`; a RLS de SELECT já permite): `useNotifications` assina no `ensureReady()` e faz prepend/refresh ao receber INSERT. Badge atualiza sozinho.
2. Fallback: `refresh()` ao abrir o slideover + intervalo de 60s com a aba visível.

### 6.2 Preferências por categoria

Ironia atual: o lembrete de eventos — o único agendado pronto — é o único sem toggle. Migration aditiva em `notification_preferences`:

```sql
alter table notification_preferences
  add column appointment_reminders boolean not null default true,
  add column due_reminders boolean not null default true;
```

Expor na tela de configurações junto de `habit_reminders`, e mapear `category → coluna` no emissor dos dois repos (kortex-app `createNotification` e kortex-api `NotificationRepository`).

### 6.3 Fase B — push de verdade (um único remetente para os dois repos)

Com produtores nos dois lados, o remetente de push não pode viver "dentro do emissor" sem ser duplicado. Solução: **a tabela como fila + Database Webhook**:

1. **Supabase Database Webhook** em `INSERT` na tabela `notifications` → `POST http(s)://<droplet>/api/webhooks/notification-created`, com header secreto (`WEBHOOK_NOTIFICATIONS_SECRET`). O kortex-api já tem a rota de webhooks esqueletada.
2. O handler no kortex-api: valida o secret, lê a linha recebida, consulta `notification_preferences` (`channel_web_push` / `channel_mobile_push`) e, se habilitado, chama a **OneSignal REST API** (`POST https://api.onesignal.com/notifications` com `include_aliases: { external_id: [user_id] }` — o cliente já registra o id do usuário como external id; nem precisa ler `notification_push_subscriptions` no caso comum). Atualiza `channels` da linha com os canais realmente usados.
3. Falha de push nunca desfaz o in-app — loga e segue. Envs novos no kortex-api: `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY`, `WEBHOOK_NOTIFICATIONS_SECRET`.
4. Cobertura automática de **todos** os produtores, síncronos e de job, sem duplicar remetente. ⚠️ Pré-requisito prático: TLS no Droplet (§4) — o webhook do Supabase vai carregar o secret; não o mande por HTTP puro.

### 6.4 Notificações de reserva (catálogo §3.6)

Uma chamada a `createNotification` em cada um dos três endpoints públicos de agendamento (`book`, `cancel`, `reschedule`), notificando o anfitrião (`scheduling_pages.user_id`). Síncronas, baratas, alto valor — independem de todo o resto.

### 6.5 Gap 1 do §3.2 — reserva pública sem lembrete

Passar `reminders: [{ type: ReminderType.Popup, minutesBefore: 30 }]` para `createEventInternal(...)` dentro de `server/api/schedule/[token]/book.post.ts`. Uma linha de mudança, sem migration — usa o parâmetro que a função já aceita. Faz o job de lembretes (§5.5) valer também para eventos nascidos de reserva pública, não só os criados manualmente na Agenda.

### 6.6 Gap 2 do §3.2 — conectar a UI de edição ao endpoint de lembretes existente

`POST /api/appointments/events/[id]/reminders` já existe e funciona (`upsertReminders` no composable já o chama). Falta o botão em `EventDetailSlideover.vue` (ou um modo de edição do próprio evento) que abre um mini-formulário de lembretes reaproveitando os `reminderOptions` do `EventCreateModal.vue`. Sem mudança de schema — destrava também o gap 3 (múltiplos lembretes por evento), já suportado pela `UNIQUE(event_id, user_id, type, minutes_before)`.

### 6.7 `habit_streak_milestone` — a notificação síncrona (catálogo §3.3)

Não depende de nenhum job. `updateStreakCache` (`server/api/habits/log.post.ts:114-226`) já recalcula `current_streak` a cada `POST /api/habits/log`. Mudança: guardar o `current_streak` anterior antes do recálculo, e depois de gravar o novo, checar se cruzou um limiar de uma lista fixa (`[7, 14, 30, 60, 100, 365]`, por exemplo) — se sim, chamar `createNotification` na hora, dentro do mesmo request. Nenhuma tabela nova, nenhum cron novo — é a entrega mais barata deste documento inteiro (por isso entra cedo no roadmap, §7).

### 6.8 Diário de Bordo — fix de timezone + schema + `journal_streak_milestone` (catálogo §3.4)

Três mudanças, nesta ordem (a primeira é pré-requisito das outras duas):

1. **Fix de timezone** (fazer primeiro, independe de notificação): em `server/api/journal/today.get.ts` e `server/api/journal/insights.get.ts`, trocar `new Date().toISOString().split('T')[0]` por "hoje" calculado na timezone do usuário (`user_preferences.timezone`, mesmo padrão a reaproveitar de Hábitos/Agendamento). Client-side, o mesmo em `TodayEditor.vue:35`. Corrige um bug real de hoje (entrada gravada no dia UTC errado perto da virada), não só prepara terreno para o job.
2. **Schema novo**: migration criando `journal_user_settings` (espelho de `habit_user_settings` — `user_id` PK, `reminder_enabled boolean default false`, `reminder_time time default '21:00'`) + coluna/toggle `journal_reminders` em `notification_preferences` e na tela de configurações.
3. **`journal_streak_milestone` síncrono**: em `POST /api/journal/entries` (`entries.post.ts`), rodar o mesmo walk de streak que hoje só existe em `today.get.ts` (até 60 linhas, barato), comparar `streak` antes/depois do save contra os limiares (`[7, 14, 30, 60, 100, 365]`, mesma lista de hábitos) e chamar `createNotification` na hora — mesmo padrão do §6.7.

### 6.9 Limpeza final

Quando os jobs diretos estiverem rodando: deprecar os três endpoints de scan + remover `CRON_SECRET` (§1.4), e atualizar os docs antigos com as erratas do §2.3.

---

## 7. Roadmap consolidado

Ordenado pelo escopo definido no topo do documento: primeiro tudo que entrega lembrete **para o dono da conta** nos dois canais mínimos (in-app + push no celular), depois o resto do que também é "para o dono da conta" mas menos urgente, e só no final o único item que é **"outras pessoas"**.

| # | Entrega | Repo | Foco | Esforço | Resultado visível |
| --- | --- | --- | --- | --- | --- |
| 1 | Ports (recorrência, timezone, emissor) + tabela `cron_job_runs` + **job `reminders-scan`** + trigger manual | kortex-api (+1 migration) | Você | médio | **Lembretes de eventos passam a existir** (in-app, após reload) — 1ª metade do mínimo definido |
| 2 | Fase B: Database Webhook → OneSignal REST (requer TLS no Droplet) | kortex-api + Supabase | Você | médio | **Push no celular, com o app instalado** — 2ª metade do mínimo. Junto com o item 1, fecha a barra mínima pedida para lembretes de evento |
| 3 | `habit_streak_milestone` síncrono (§6.7) | kortex-app | Você | trivial | Celebração de sequência de hábito (7/30/100 dias) — a entrega mais barata do documento, sem job, sem migration |
| 4 | Job `habits-scan`: `habit_review_reminder` + `habit_pending_today` + `habit_streak_at_risk` (§5.6) | kortex-api | Você | médio | **Lembretes de hábitos passam a existir** — com o item 2 já no ar, chegam automaticamente também no celular |
| 5 | Diário: fix de timezone + schema `journal_user_settings` + `journal_streak_milestone` síncrono (§6.8) | kortex-app (+1 migration) | Você | pequeno | Corrige bug de "hoje" errado perto da virada UTC e já entrega a celebração de sequência do Diário |
| 6 | Job `journal-scan`: `journal_reminder` + `journal_streak_at_risk` (§5.7) | kortex-api | Você | médio | **Lembretes do Diário de Bordo passam a existir** — idem, já chegam no celular via item 2 |
| 7 | Fase C: Realtime no sino | kortex-app | Você | pequeno/médio | Notificação aparece **sem reload** |
| 8 | Toggles `appointment_reminders`/`due_reminders`/`journal_reminders`/por categoria de hábito (§6.2) | kortex-app | Você | pequeno | Controle do usuário sobre o que já está chegando |
| 9 | Gap 1 — reserva pública ganha lembrete padrão (§6.5) | kortex-app | Você | trivial | Compromissos agendados por convidado também disparam lembrete pro anfitrião |
| 10 | Gap 2 — UI de editar/adicionar lembrete em evento existente (§6.6) | kortex-app | Você | pequeno | Destrava também múltiplos lembretes por evento (gap 3) |
| 11 | Notificações de reserva — `booking_created`/`cancelled`/`rescheduled` (§6.4) | kortex-app | Você | pequeno | Anfitrião fica sabendo de reservas na hora |
| 12 | Job `due-scan` — tarefas/ideias/parcelas/metas (§5.8) | kortex-api | Você | médio | Vencimentos de outros módulos |
| 13 | Job `trash-purge` + deprecação dos endpoints de scan + limpeza do `CRON_SECRET` | ambos | Você (infra) | pequeno | Arquitetura única, sem caminho legado |
| 14 | E-mail (`channel_email`) + gap 4 do §3.2 (lembrete ao **convidado sem conta**) | kortex-app | **Outras pessoas** | grande | Fora deste doc — depende de provedor de e-mail. Único item da fase seguinte |

**Itens 1 e 2 juntos são o MVP que satisfaz o pedido explícito**: lembrete de evento chegando na aba de notificações **e** no celular. Itens 3–4 fazem o mesmo valer para hábitos logo em seguida, e itens 5–6 para o Diário de Bordo — em ambos os pares, o item síncrono/schema (3 e 5) nem precisa esperar o job (4 e 6), pode sair primeiro. Itens 8, 9 e 10 independem de migration pesada e podem andar em paralelo com qualquer coisa. **O item 14 é deliberadamente o último** — é o único que não é sobre o dono da conta.

### Tabela final de agendamento (kortex-api)

| Job | Expressão | Janela | Fonte |
| --- | --- | --- | --- |
| `close-day` | `55 23 * * *` | backfill 7 dias | direto (existente) |
| `reminders-scan` | `*/5 * * * *` | marca-d'água + lead 5 min | direto (novo) |
| `habits-scan` | `*/15 * * * *` | marca-d'água | direto (novo) |
| `journal-scan` | `0 * * * *` | data local por usuário | direto (novo) |
| `due-scan` | `0 * * * *` | data local por usuário | direto (novo) |
| `trash-purge` | `0 3 * * *` | cutoff | direto (novo) |

---

## 8. Como testar ponta a ponta

1. **Job isolado, sem esperar o relógio** (trigger manual no Droplet):
   ```bash
   curl -X POST -H "Authorization: Bearer $JOB_TRIGGER_TOKEN" \
     http://<droplet>/api/jobs/reminders-scan
   # cria antes um evento começando em ~10 min com lembrete de 5 min:
   # 1ª chamada → notified: 1 · 2ª chamada imediata → notified: 0 (dedupe OK)
   ```
2. **Marca-d'água**: parar o processo por 20 min com um lembrete caindo no meio; religar; a próxima execução deve emitir o lembrete perdido (atrasado, não descartado).
3. **Destinatário**: criar lembrete como **participante** (não dono) de um evento — a notificação deve chegar ao participante.
4. **UI**: com o item 2 do roadmap, a notificação aparece no sino sem reload; antes dele, após reload.
5. **Push (produção)**: device registrado nas configurações + Fase B → notificação chega com o app fechado; conferir no dashboard do OneSignal.
6. **Reservas**: fazer uma reserva pelo link público → sino do anfitrião recebe `booking_created`.
7. **Diário — fix de timezone**: com o relógio do servidor perto da meia-noite UTC (ou forçando a data manualmente em teste), escrever uma entrada num horário que já seria "amanhã" em UTC mas ainda é "hoje" na timezone do usuário — confirmar que `entry_date` grava o dia local correto, não o UTC.
8. **Diário — streak**: escrever entradas em dias consecutivos até cruzar um limiar (ex.: 7) — a notificação `journal_streak_milestone` deve chegar no mesmo request do 7º save, sem esperar o job.
