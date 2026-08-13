# Plano — Fluxo de notificações (diagnóstico e implementação)

Este documento nasce de uma pergunta direta: "o fluxo de notificações não está funcionando, por quê?". A resposta curta é que **não existe um único bug** — existia uma infraestrutura construída pela metade: tudo que é "passivo" (schema, API de leitura, UI, integração com o provedor de push) estava pronto e correto; tudo que é "ativo" (algo do produto decidir "isso merece virar uma notificação agora") praticamente não existia. Este documento primeiro mapeia o estado real (com evidência em código, não suposição), depois propõe um plano de implementação pra fechar as lacunas, seguindo o mesmo formato usado em `docs/notes/PLANO_TABELA_CONTEUDO.md` e nos demais `PLANO_*.md` do projeto.

> **Atualização**: o roadmap **P0** (seção 7) já foi implementado — o emissor central existe, o primeiro evento real está ligado, o webhook do Stripe foi higienizado e os endpoints de cron passaram a ter proteção de verdade. O restante do documento (diagnóstico, decisões de arquitetura) foi mantido como registro do estado anterior e do raciocínio por trás das decisões — continua válido para entender *por que* o P0 foi feito assim, mesmo que a lacuna que ele descreve já esteja parcialmente fechada. P1/P2 continuam pendentes.

---

## 1. Diagnóstico: por que "não está funcionando" hoje

A tabela `public.notifications` (`supabase/migrations/20260302160000_notifications.sql`) é o que alimenta o sino (`NotificationsButton.vue`) e o slideover (`NotificationsSlideover.vue`) via `GET /api/notifications`. Buscando no repositório inteiro por todo lugar que escreve nela, existe **um único produtor**: `supabase/functions/stripe-webhook/index.ts`, função `safeInsertNotification` (linhas 29-74), chamada apenas em três situações de billing:

- `checkout.session.completed` → "Assinatura iniciada com sucesso." (linha 211-219)
- `customer.subscription.deleted` → "Sua assinatura foi cancelada." (linha 242-247) / `customer.subscription.updated` com `cancel_at_period_end` → "Cancelamento da assinatura agendado..." (linha 251-256)
- `invoice.paid` / `invoice.payment_failed` → confirmação ou falha de pagamento (linha 279-289)

**Nenhum outro módulo do produto (tarefas, hábitos, agenda, notas, ideias, journal, metas) cria uma notificação.** Não é que a lógica exista e tenha um bug — a lógica simplesmente não foi escrita. Resultado: para qualquer conta que não esteja passando por um evento de assinatura Stripe naquele momento, o sino **sempre vai aparecer vazio**, porque não há o que mostrar.

Além disso, dois fluxos que *parecem* prontos do lado do usuário escondem a mesma lacuna:

- **Lembretes de evento de agenda**: `EventCreateModal` permite definir um lembrete, `EventDetailSlideover` mostra os lembretes já salvos, e existe até um endpoint funcional pra reescrevê-los (`POST /api/appointments/events/[id]/reminders`). Mas, como já documentado em `docs/appointments/1.APPOINTMENTS.md:101-106`, **esse endpoint nunca é chamado por nenhum componente** (não dá pra editar lembrete de um evento já criado) e, mais grave: **não existe em lugar nenhum do servidor um job que leia `event_reminders` e dispare alguma coisa** (popup, e-mail, push). A tabela é escrita na criação do evento e nunca mais lida por nada além da tela de detalhe.
- **Lembretes de hábito**: existe um toggle "Lembretes de hábitos" (`habit_reminders`) na tela de configurações (`app/pages/app/settings/notifications.vue:99-102`) e uma configuração de horário de revisão (`habit_user_settings.review_reminder_enabled`/`review_reminder_time`). Nenhum dos dois é lido em nenhum lugar do servidor pra decidir "enviar algo agora" — são apenas gravados. `docs/habits/ANALISE_HABITOS_MERCADO.md:28` já registra isso como lacuna: o Kortex só tem um toggle módulo-inteiro, "tudo ou nada", enquanto os concorrentes pesquisados notificam por hábito/horário individual.

Por fim, mesmo se algo decidisse "notificar agora", **não existe nenhum agendador rodando neste repositório**. Os dois únicos endpoints com formato de cron (`server/api/habits/cron-skip.post.ts`, `server/api/notes/trash/purge.post.ts`) são protegidos por um segredo compartilhado (`x-cron-secret` vs `runtimeConfig.cronSecret`, ver `cron-skip.post.ts:11-20`) e **precisam ser chamados de fora** — o próprio `docs/notes/1.NOTES.md` já registra isso: *"O agendamento em si (cron) não está neste repositório — precisa ser configurado manualmente por fora"*. Não há `vercel.json` com `crons`, não há `schedule:` no GitHub Actions (`.github/workflows/ci.yml` só dispara em `push`), não há `pg_cron` em nenhuma migration.

### 1.1 E o push (OneSignal)?

A integração client (`app/composables/useOneSignal.ts`) é sofisticada e tecnicamente correta — cobre web push, PWA e push nativo via Capacitor, com sincronização de device (`notification_push_subscriptions`) e listeners de clique/permissão. Mas ela é **desligada por design fora de produção**, em duas camadas:

- `nuxt.config.ts:33`: `oneSignalEnabled: process.env.NODE_ENV === 'production' && process.env.NUXT_PUBLIC_ONESIGNAL_ENABLED === 'true'`
- `useOneSignal.ts:259-266` (`isEnabled`): `return !import.meta.dev && runtimeConfig.public.oneSignalEnabled && Boolean(runtimeConfig.public.oneSignalAppId)`

No `.env` local do projeto, `NUXT_PUBLIC_ONESIGNAL_ENABLED=false` e `NUXT_PUBLIC_ONESIGNAL_APP_ID` vazio — `.env.example` documenta a intenção: só ligar em produção. Isso **não é bug**, é comportamento intencional — mas é a explicação mais provável se o teste de "notificação não chega" foi feito em `pnpm dev` local: nenhum push, web ou mobile, vai disparar nesse ambiente, não importa o que mais esteja certo.

### 1.2 Um resíduo de schema antigo, escondido atrás de um `catch` mudo

`supabase/functions/stripe-webhook/index.ts:58-73`: se o insert principal em `notifications` falhar, há um fallback que tenta inserir usando uma coluna `is_system` — coluna que **não existe** no schema atual (a tabela usa `type text check (type in ('user','system'))`, ver migration `20260302160000_notifications.sql:6,28-31`; nenhuma migration adiciona `is_system`). Esse fallback é resíduo de uma versão anterior do schema. Toda a função é envolvida por um `try { ... } catch { /* best-effort */ }` mudo — qualquer falha ao inserir a notificação de billing é engolida sem log nenhum, então hoje não haveria como saber, olhando só o produto, por que uma notificação de pagamento não apareceu.

### 1.3 Canal de e-mail: existe na UI, não existe de verdade

A tela de configurações tem um toggle "Email" (`channel_email`, `notifications.vue:80-84`) e a coluna existe no banco (`notification_preferences.channel_email`). Mas não há nenhuma lib de e-mail transacional no projeto (`package.json` não tem `resend`, `sendgrid`, `postmark`, `nodemailer` nem similar) e nenhum endpoint envia e-mail de notificação. O toggle liga/desliga uma preferência que nenhum processo consulta.

---

## 2. Estado atual — inventário completo

**Já existe e funciona (metade "passiva"):**

| Camada | Arquivo(s) | O que faz |
| --- | --- | --- |
| Schema | `supabase/migrations/20260302160000_notifications.sql` | Tabela `notifications` (user_id, type, body, link_path, read_at, metadata) + RLS própria |
| Schema | `supabase/migrations/20260306180000_notification_preferences.sql` | Tabela `notification_preferences` (canais, tópicos, digest) + RLS |
| Schema | `supabase/migrations/20260315200000_notification_channels_onesignal_timezone.sql` | `timezone` em `user_preferences`; expande `notification_preferences` (`channel_web_push`, `channel_mobile_push`, `habit_reminders`, permissões); adiciona `channels`/`category`/`source`/`external_id` em `notifications`; cria `notification_push_subscriptions` (devices OneSignal) |
| API leitura | `server/api/notifications.ts`, `.../read.post.ts`, `.../read-all.post.ts` | Listar, marcar lida/todas — corretos |
| API preferências | `server/api/settings/notifications.get.ts`/`.put.ts`, `.../subscription.put.ts` | CRUD de preferências e sincronização de device — corretos |
| Frontend | `app/composables/useNotifications.ts` | Estado compartilhado (lista, contagem, refresh) |
| Frontend | `app/components/NotificationsButton.vue`, `NotificationsSlideover.vue` | Sino com badge + painel — sem bugs encontrados |
| Frontend | `app/composables/useDashboard.ts:6,13` | Atalho de teclado `N`, estado do slideover |
| Push client | `app/composables/useOneSignal.ts`, `app/plugins/onesignal.client.ts` | Integração web + nativa (Capacitor), completa |
| Push infra | `public/push/onesignal/*.js`, `onesignal-cordova-plugin` (dependência) | Service workers e SDK nativo |

**Resolvido pelo P0** (ver seção 7):

| Item | Situação atual |
| --- | --- |
| Emissor central de notificação de domínio | ✅ `server/utils/notifications.ts` (`createNotification`) |
| Logging de falha no insert de notificação | ✅ `console.error` no emissor central e no webhook do Stripe |
| Proteção real dos endpoints de cron | ✅ `runtimeConfig.cronSecret` agora é declarado de fato (antes, a checagem nunca disparava) |
| Primeiro evento de domínio fora de billing | ✅ Compartilhamento de nota notifica o destinatário |

**Ainda não existe (P1/P2):**

| Lacuna | Situação |
| --- | --- |
| Job/cron que leia `event_reminders` | Não existe — `docs/appointments/1.APPOINTMENTS.md:106` já documenta isso; é P1, item 5 |
| Job/cron que leia `habit_reminders`/`review_reminder_*` | Não existe; é P1, item 6 |
| Agendador chamando os endpoints existentes | Nenhum roda hoje — responsabilidade da API externa de CRON (seção 5.2), fora deste repositório |
| Canal de e-mail | Não existe nenhuma lib nem endpoint — toggle é decorativo; é P2, item 7 |
| Lembrete por hábito individual (vs. módulo inteiro) | Não existe — gap de mercado já registrado; é P2, item 8 |

---

## 3. Hipóteses do "por que hoje não funciona", por probabilidade

1. **Testando em `pnpm dev`/local** → push nunca vai funcionar, por design (seção 1.1). Se a expectativa era ver um push, isso é esperado.
2. **Testando o sino/slideover sem passar por um evento de assinatura Stripe** → lista sempre vazia, porque não há outro produtor de `notifications`.
3. **Testando lembrete de evento de agenda ou de hábito** → gravado no banco, nunca entregue (seção 1, parágrafos 2-3).
4. **Testando notificação por e-mail** → canal nunca foi implementado.
5. **Já passou por um evento real de Stripe em produção e mesmo assim falhou** → possível falha silenciosa no insert (seção 1.2), sem log, sem alerta.

---

## 4. Pra quem isso serve, e quando

O objetivo deste plano não é "religar" algo que quebrou — é **construir a metade que nunca existiu**. Duas entregas seguem trilhas independentes e podem ser feitas em qualquer ordem:

- **Notificações in-app de eventos de domínio** (tarefa vencendo, hábito não registrado, evento próximo, lembrete de agenda) — o valor imediato é o sino deixar de estar sempre vazio.
- **Entrega de fato dos lembretes já configuráveis na UI** (agenda e hábitos) — o valor é fechar uma promessa que a interface já faz hoje sem cumprir.

O canal de push (OneSignal) e o canal de e-mail são consumidores desse mesmo emissor central — não precisam ser resolvidos primeiro; o in-app (`channel_in_app`, sempre ligado por padrão) já entrega valor sozinho.

---

## 5. Decisões de arquitetura (e o porquê de cada uma)

### 5.1 Um emissor central de notificação, dentro do próprio Nuxt server

Hoje a única função que sabe "inserir uma notificação" (`safeInsertNotification`) vive isolada dentro da Edge Function do Stripe, em Deno, fora do server Nuxt — não é reaproveitável por nenhum outro endpoint do produto. Proposta: criar `server/utils/notifications.ts` com uma função `createNotification(supabase, { userId, body, category, linkPath, metadata })` que:

- Insere em `notifications` respeitando o schema atual (sem o fallback morto de `is_system`).
- Consulta `notification_preferences` do usuário antes de gravar (se `channel_in_app` estiver desligado, não grava; isso já não é feito hoje em lugar nenhum).
- Para os canais push/e-mail, apenas *enfileira a intenção* (ver 5.2) — este utilitário não deve saber falar com OneSignal ou SMTP diretamente, só decidir "essa notificação deveria ir para esses canais, dado que o usuário permitiu".
- Loga erro de insert (`console.error` no mínimo — sem `catch` mudo) em vez de engolir a falha.

Isso vira o único lugar que qualquer endpoint futuro (tarefas, hábitos, agenda) chama pra "avisar o usuário de algo", em vez de cada módulo reinventar sua própria inserção em `notifications`.

### 5.2 Agendamento: API própria com CRON, fora deste repositório

**Decisão já tomada pelo usuário**: em vez de Vercel Cron ou `pg_cron`, o agendamento vai ser resolvido por uma **API própria dedicada a CRON**, separada deste repositório — no mesmo espírito do que já é feito hoje pra outros jobs do produto (`docs/notes/1.NOTES.md` já registra que "o agendamento em si (cron) não está neste repositório — precisa ser configurado manualmente por fora"; `docs/notes/BUGS_AND_IMPROVEMENTS.md` menciona um "outro projeto" cuidando do cron de limpeza da lixeira de notas). Essa API externa é quem vai chamar, periodicamente, os endpoints protegidos por `x-cron-secret` que este repositório expõe (`cron-skip.post.ts` como exemplo já existente, mais os novos endpoints das seções 5.3/5.4).

Isso muda o que este repositório precisa entregar: **não é necessário configurar `vercel.json`/`pg_cron` aqui** — o trabalho deste lado fica limitado a expor os endpoints de varredura (`appointments/cron-reminders.post.ts`, `habits/cron-reminders.post.ts`, e os demais listados em `docs/notifications/PLANO_INTEGRACAO_MODULOS.md`), todos seguindo o mesmo padrão de segredo compartilhado já usado por `cron-skip.post.ts`, prontos pra serem chamados por essa API externa quando ela existir. O item 3 do roadmap (P0, seção 7) passa a ser "garantir que os endpoints estão prontos e documentados pra API de CRON consumir", não "configurar o agendador".

### 5.3 Lembretes de agenda: fechar a ponta a ponta

Três peças, todas pequenas:

1. **Conectar a UI que já falta**: adicionar campo de lembrete no formulário de edição do `EventDetailSlideover` (hoje só mostra, não edita), chamando a ação `upsertReminders` que já existe no composable mas nunca é usada.
2. **Novo endpoint de varredura**: `server/api/appointments/cron-reminders.post.ts`, protegido pelo mesmo `x-cron-secret`, rodando a cada 5-10 minutos (granularidade de "minutos antes" exige mais frequência que os crons diários existentes). A query: eventos cujo lembrete calculado (`start_at - minutes_before`) caiu na janela desde a última execução, que ainda não têm uma notificação emitida pra ele (usar `metadata->>'event_reminder_id'` na notificação criada, ou uma coluna `notified_at` em `event_reminders`, pra não duplicar).
3. **Emitir via `createNotification`** (5.1) com `link_path` apontando pro evento.

### 5.4 Lembretes de hábito: manter o escopo módulo-inteiro por agora, mas entregar de verdade

O gap de "lembrete por hábito individual" (`docs/habits/ANALISE_HABITOS_MERCADO.md:28`) é real, mas é uma expansão de escopo, não um conserto do que já existe. Proposta pra este plano: **entregar primeiro o que a UI já promete hoje** — o toggle `habit_reminders` e o horário de `review_reminder_time` — antes de expandir pra granularidade por hábito. Um endpoint `server/api/habits/cron-reminders.post.ts`, também no mesmo padrão de segredo, rodando a cada 15-30 minutos, que:

- Busca usuários com `habit_user_settings.review_reminder_enabled = true` cujo `review_reminder_time` (considerando o `timezone` do usuário, já existente em `user_preferences`) caiu na janela atual.
- Verifica se `notification_preferences.habit_reminders` está ligado antes de emitir.
- Emite uma notificação de revisão diária via `createNotification`.

A expansão pra lembrete por hábito/horário individual fica registrada como próximo passo natural (reaproveitando a mesma infraestrutura de cron + `createNotification`), não como parte do escopo mínimo deste plano.

### 5.5 Canal de e-mail: decidir entre implementar ou remover o toggle

Não faz sentido deixar um toggle que não faz nada — isso é o tipo de inconsistência que mina a confiança do usuário nas próprias configurações. Duas saídas válidas, a decidir antes de implementar:

- **Implementar de verdade**: escolher um provedor (Resend é o mais comum em stacks Nuxt/Vercel), criar um endpoint/serviço de envio, e fazer `createNotification` disparar e-mail quando `channel_email` estiver ligado e a categoria da notificação justificar (billing e "atualizações importantes" são os candidatos óbvios; não faz sentido mandar e-mail de cada lembrete de hábito).
- **Remover temporariamente da UI**: esconder o toggle "Email" até o canal existir, evitando prometer algo que não é entregue.

Este plano assume a primeira opção como recomendação (o canal de billing já teria uso imediato: hoje uma falha de pagamento só aparece pra quem abrir o sino), mas fica como decisão a confirmar antes do item 7 (P2) do roadmap (seção 7).

### 5.6 Higienizar o webhook do Stripe

Duas correções pequenas e independentes do resto do plano:

- Remover o fallback com `is_system` em `stripe-webhook/index.ts:58-70` — código morto que nunca vai funcionar contra o schema atual.
- Trocar o `catch { /* best-effort */ }` (linha 71-73) por, no mínimo, um `console.error` com o erro — hoje uma falha aqui é invisível.

### 5.7 OneSignal: manter desligado fora de produção, mas documentar isso na própria tela

O comportamento de `nuxt.config.ts:33` está correto e não deve mudar — testar push de verdade em ambiente de desenvolvimento tende a gerar mais ruído (devices de teste registrados na conta real do OneSignal) do que valor. A UI já avisa isso (`notifications.vue:410-411`, "OneSignal está desabilitado neste ambiente"), então não há ação de código aqui — só vale confirmar, ao testar manualmente este plano, que a mensagem continua aparecendo pra quem olhar a tela em dev.

---

## 6. O que muda vs. o que continua igual

| Continua igual | Muda |
| --- | --- |
| Schema de `notifications`, `notification_preferences`, `notification_push_subscriptions` | Novo utilitário `server/utils/notifications.ts` (`createNotification`) |
| `GET /api/notifications`, `read.post.ts`, `read-all.post.ts` | Novos endpoints cron: `appointments/cron-reminders.post.ts`, `habits/cron-reminders.post.ts` |
| `NotificationsButton.vue`, `NotificationsSlideover.vue`, `useNotifications.ts` | Endpoints de varredura prontos para serem chamados pela API externa de CRON (o agendamento em si fica fora deste repositório) |
| `useOneSignal.ts` e toda a integração push client | `EventDetailSlideover` ganha campo de edição de lembrete (hoje só leitura) |
| Comportamento de `oneSignalEnabled` (desligado fora de produção) | `stripe-webhook/index.ts`: remove fallback `is_system`, adiciona log de erro |
| — | Decisão sobre canal de e-mail: implementar ou remover toggle (seção 5.5) |

---

## 7. Roadmap sugerido (por prioridade)

Mesmo formato usado em `docs/notes/ANALISE_EDITOR_MERCADO.md`: itens marcados ❌ **Faltando** — nada deste roadmap está implementado ainda, esse é o estado real hoje, não um histórico de progresso. A prioridade reflete o que destrava mais valor com menos dependência de peças que ainda não existem, não o tamanho do esforço.

### P0 — Fundação: o mínimo pra alguma notificação real (fora de billing) aparecer no sino — ✅ concluído

Sem isso, nenhum item de P1/P2 tem onde se apoiar — é a base compartilhada por qualquer evento de domínio futuro.

1. ✅ **Emissor central `createNotification`** (`server/utils/notifications.ts`) — insere em `notifications` respeitando `notification_preferences.channel_in_app` (não grava se o usuário desligou o canal in-app), loga erro de insert via `console.error` em vez de engolir, e suporta `externalId` como guarda de idempotência (unique index em `notifications.external_id`) para quando os crons de P1 passarem a chamá-lo repetidamente. Ver seção 5.1.
2. ✅ **Higienizar o webhook do Stripe** — removido o fallback morto com `is_system` e o `catch` mudo em `supabase/functions/stripe-webhook/index.ts`; uma falha ao inserir a notificação agora aparece via `console.error` nos logs da Edge Function. Ver seção 5.6.
3. ✅ **Endpoints de cron com contrato estável** — a checagem de `x-cron-secret` foi extraída para `server/utils/require-cron-secret.ts` e passou a ser usada por `cron-skip.post.ts` e `trash/purge.post.ts`. Isso também corrigiu um problema real encontrado durante a implementação: **`runtimeConfig.cronSecret` nunca tinha sido declarado em `nuxt.config.ts`** — os dois endpoints liam uma config inexistente, então a checagem sempre caía no branco `if (cronSecret)` falso e ambos ficavam **sem autenticação nenhuma**, exatamente o alerta que já constava em `docs/habits/1.HABITS.md:198,336`. Agora `cronSecret` é declarado (lido de `CRON_SECRET`), documentado em `.env.example`, e adicionado (vazio) em `.env` local. Contrato dos dois endpoints, para a API externa de CRON consumir:

   | Endpoint | Método | Header | Parâmetros | Resposta |
   | --- | --- | --- | --- | --- |
   | `/api/habits/cron-skip` | `POST` | `x-cron-secret` | `?date=YYYY-MM-DD` (opcional, padrão: ontem) | `{ skipped: number, date: string }` |
   | `/api/notes/trash/purge` | `POST` | `x-cron-secret` | — | `{ purgedFolders: number, purgedNotes: number, cutoff: string }` |

   Os endpoints de varredura de lembretes (agenda, hábitos) ainda não existem — fazem parte de P1 (itens 5-6), não deste item.
4. ✅ **Primeiro evento real ligado ao emissor** — compartilhamento de nota (`server/api/notes/[id]/shares/index.post.ts`) agora chama `createNotification` quando o convite resolve para uma conta existente na hora do convite (`resolvedUserId` presente), com `category: 'note_shared'` e `link_path: '/app/notes/shared-with-me'`. Convites pendentes (pessoa ainda sem conta) continuam sem notificação — ficam para quando `reconcile-pending-shares.ts` for revisitado. Ver `docs/notifications/PLANO_INTEGRACAO_MODULOS.md`, seção 2.

### P1 — Cumprir o que a UI já promete hoje

A interface já tem os campos de configuração para os dois itens abaixo (lembrete de evento, lembrete de hábito) — hoje eles são gravados e nunca lidos por nada. P1 é fechar essa promessa já feita ao usuário, não adicionar nada novo à UI.

5. ❌ **Lembretes de evento de agenda, ponta a ponta** — endpoint de varredura `appointments/cron-reminders.post.ts` lendo `event_reminders`, mais o campo de edição de lembrete que falta no `EventDetailSlideover`. Ver seção 5.3.
6. ❌ **Lembretes de hábito, escopo módulo-inteiro** — endpoint `habits/cron-reminders.post.ts` lendo `habit_user_settings.review_reminder_*`, respeitando o timezone do usuário. Ver seção 5.4.

### P2 — Decisões de produto pendentes e expansão

Itens que dependem de uma decisão de produto (não só de código) ou que ampliam o escopo além do que a UI já promete hoje.

7. ❌ **Canal de e-mail** — decidir entre implementar de fato (ex.: Resend) ou remover o toggle "Email" da tela de configurações, que hoje não faz nada. Ver seção 5.5.
8. ❌ **Lembrete por hábito individual** (horário próprio por hábito, não módulo-inteiro) — gap de mercado já registrado (`docs/habits/ANALISE_HABITOS_MERCADO.md:28`), mas exige schema novo (coluna/tabela de horário por hábito). Reaproveita a infraestrutura de P0.
9. ✅ **OneSignal permanece desligado fora de produção** — não é um item pendente, é comportamento intencional já correto (seção 5.7); listado aqui só pra registrar que não faz parte deste roadmap.

Demais eventos de domínio por módulo (tarefas, ideias, financeiro, journal, metas) ficam fora deste roadmap de infraestrutura — o mapeamento completo, módulo a módulo, com sua própria priorização, está em `docs/notifications/PLANO_INTEGRACAO_MODULOS.md`.

Cada item é independente o suficiente pra ser entregue e testado isoladamente dentro do seu tier — mas P1 e P2 pressupõem que o emissor central (P0, item 1) já existe; não há como pular P0.

---

## 8. Critérios de aceite

**P0 (implementado):**

- ✅ Um evento de domínio fora de billing (compartilhamento de nota) gera uma linha em `notifications` e aparece no sino/slideover sem precisar de nenhuma ação manual no banco.
- ✅ Desligar `channel_in_app` nas preferências impede a criação da notificação in-app correspondente.
- ✅ Uma falha ao inserir notificação de billing aparece nos logs (Supabase Edge Function), não desaparece silenciosamente.
- ✅ O fallback `is_system` não existe mais no webhook do Stripe.
- ✅ `cron-skip` e `trash/purge` só respondem com sucesso a chamadas com o `x-cron-secret` correto quando `CRON_SECRET` está configurado.
- Testando em `pnpm dev`, a tela de configurações continua deixando claro que push está desabilitado no ambiente — nenhuma mudança de comportamento aqui, só confirmação de que nada quebrou.

**P1 (pendente):**

- Editar o lembrete de um evento já criado, pelo `EventDetailSlideover`, persiste via `upsertReminders` (hoje impossível pela UI).
- Um lembrete de evento de agenda, configurado para "15 minutos antes", gera uma notificação dentro da janela esperada, sem duplicar em execuções seguintes do cron.
- Usuário com `review_reminder_enabled = true` recebe notificação de revisão de hábitos no horário configurado (respeitando seu timezone).

---

## 9. Riscos

**Médio.** A parte de schema/UI/API de leitura já está pronta e testada em produção (billing funciona), então o risco não está aí. Com o agendamento resolvido por uma API externa própria (5.2), o risco de infraestrutura sai deste repositório — o que sobra aqui é (1) **contrato entre repositórios**: os endpoints de varredura precisam de uma interface estável (rota, segredo, parâmetros, formato de resposta) pra API de CRON não quebrar a cada mudança; (2) **cálculo de janelas de tempo** (lembrete "X minutos antes", horário de revisão com timezone) é o tipo de lógica fácil de acertar no caso feliz e errar em borda (troca de horário de verão, execução do cron atrasada perdendo a janela, duplicação se o cron rodar duas vezes). Vale cobrir esses casos de borda explicitamente no teste manual antes de considerar os itens 5/6 (P1) prontos, e alinhar o contrato dos endpoints com quem for construir a API de CRON antes de fechar o formato.

---

# Plano de testes manuais

Os passos 1-2 e 1'-2' (P0) já podem ser rodados — o código está implementado, só falta validar manualmente. Os passos 3-7 (P1) ainda não podem, dependem dos itens 5-6 do roadmap (seção 7) serem implementados primeiro. Use como roteiro conforme cada item da seção 7 for construído/validado.

1'. Compartilhe uma nota (`POST /api/notes/[id]/shares`) com o e-mail de uma conta que já existe no ambiente de teste. **Esperado:** a conta destinatária recebe uma notificação in-app ("... compartilhou a nota '...' com você"), visível no sino/slideover, com link pra `/app/notes/shared-with-me`.
2'. Desligue `channel_in_app` nas preferências da conta destinatária e repita o passo 1'. **Esperado:** nenhuma notificação é criada.
3'. Compartilhe uma nota com um e-mail que **não** tem conta ainda. **Esperado:** nenhuma notificação é criada (convite fica `pending`, sem destinatário resolvido).
4'. Chame `POST /api/habits/cron-skip` e `POST /api/notes/trash/purge` sem o header `x-cron-secret`, com `CRON_SECRET` configurado no ambiente. **Esperado:** `401 Unauthorized` nos dois. Repita com o header correto. **Esperado:** `200`, resposta no formato documentado na seção 7, item 3.
5'. Force um evento de teste do Stripe (checkout de assinatura em modo teste). **Esperado:** notificação aparece no sino em poucos segundos, sem precisar dar refresh manual na página.
6'. Force uma falha no insert de `notifications` (ex.: temporariamente quebrando uma constraint) e dispare um evento de billing de teste. **Esperado:** o erro aparece nos logs da Edge Function (Supabase), a função não trava silenciosamente.
7'. Rode `pnpm dev` localmente e abra a tela de configurações de notificações. **Esperado:** mensagem "OneSignal está desabilitado neste ambiente" continua aparecendo, nenhum push é solicitado ao navegador (comportamento que já existia, sem relação com o P0 — só reconfirmar que nada quebrou).

---

**Passos abaixo dependem de P1/P2 — ainda não implementados, não podem ser rodados hoje.**

3. Crie um evento de agenda com lembrete de "10 minutos antes". Aguarde o cron rodar (ou dispare manualmente o endpoint com o `x-cron-secret` correto) na janela esperada. **Esperado:** notificação aparece no sino com link pro evento.
4. Rode o mesmo cron de lembretes de agenda duas vezes seguidas sem alterar nada. **Esperado:** a notificação do passo 3 não é duplicada.
5. Edite o lembrete de um evento já existente pelo `EventDetailSlideover`. **Esperado:** o campo de lembrete aparece no formulário de edição (hoje não existe) e a alteração persiste (confirmar consultando `event_reminders` ou reabrindo o slideover).
6. Configure `review_reminder_enabled = true` com um horário próximo do atual, num usuário com timezone diferente de UTC. **Esperado:** a notificação chega dentro da janela esperada, ajustada ao timezone configurado, não ao horário UTC do servidor.
7. Desligue `habit_reminders` nas preferências e repita o passo 6. **Esperado:** nenhuma notificação de revisão é criada.
8. Ligue o toggle "Email" (após o item 7/P2 decidir o escopo) e force um evento de billing/atualização importante. **Esperado:** conforme a decisão tomada — ou o e-mail chega de fato, ou o toggle não existe mais na tela.

**Se algum teste falhar:** anote o passo exato, o que esperava vs. o que aconteceu, e qualquer erro nos logs do servidor (Vercel/Supabase) ou no console do navegador.
