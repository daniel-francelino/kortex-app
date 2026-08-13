# Plano de implementação — Link de Agendamento Público

Este documento especifica, em detalhe e por fases, como implementar um **link de agendamento público**: uma página, sem login, onde qualquer pessoa escolhe um horário livre do usuário do Kortex e marca um compromisso sozinha — o modelo popularizado pelo Calendly. Inclui análise de concorrência dedicada (seção 1), o desenho completo do fluxo ponta a ponta (seção 2), o modelo de dados novo (seção 3) e a implementação faseada (seções 4–8).

> Pré-requisito de leitura: [`1.APPOINTMENTS.md`](./1.APPOINTMENTS.md) — em especial as seções 6 (motor de recorrência, incluindo o bug de séries antigas que precisa ser corrigido antes deste plano, ver seção 4.0) e 7 (lembretes hoje não são entregues — este plano constrói a primeira infraestrutura real de envio de e-mail do projeto, não reaproveita nada existente, porque **nada existe hoje**: o projeto não tem nenhum provedor de e-mail transacional integrado — confirmado por busca no código, `server/api/mails.ts` é dado estático de uma tela de exemplo, não um envio real).

---

## 1. Análise de concorrência

Levantamento de 2026 sobre as ferramentas de agendamento por link mais relevantes — **Calendly** (a líder de mercado, referência de UX), **Cal.com** (open-source, a alternativa mais técnica/customizável), **SavvyCal** (diferencial de sobrepor a agenda do convidado à do anfitrião), e o **recurso de agendamento nativo do Google Calendar** (o mais parecido, arquiteturalmente, com o que o Kortex já tem hoje — calendário + eventos, sem um produto à parte).

| Recurso | Calendly | Cal.com | SavvyCal | Google Calendar (Agendamentos) |
| --- | --- | --- | --- | --- |
| Modelo | SaaS fechado, líder de mercado | Open-source, self-host ou nuvem, API-first | SaaS premium, foco em vendas/1:1 | Recurso embutido no Google Calendar |
| Tipos de evento (durações/regras diferentes) | Vários por conta, plano pago para ilimitados | Ilimitados, altamente customizável | Vários | Uma página no plano gratuito; várias no plano pago |
| Regras de disponibilidade | Por tipo de evento, com buffers antes/depois, limite de reuniões/dia, incrementos de horário configuráveis | Equivalente, mais granular | Equivalente | Janelas por dia da semana, buffer, máximo de reservas/dia |
| **Diferencial citado** | Confiabilidade e reconhecimento de marca — "o mais usado do mundo" | Open-source, auto-hospedável, forte em integrações via API | **Convidado sobrepõe a própria agenda à do anfitrião** — compara horários visualmente em vez de só escolher entre slots prontos | Pré-configurado dentro do Google Calendar — sem outra conta, sem outro produto |
| Perguntas customizadas no formulário de reserva | Sim | Sim | Sim | Limitado |
| Cancelamento/reagendamento pelo convidado | Sim, por link único | Sim | Sim | Sim |
| Automação de lembrete/confirmação | "Workflows" — gatilho + ação, e-mail/SMS, confirmação, lembrete, reconfirmação, follow-up | Equivalente | Equivalente | E-mail básico do Google Calendar |
| Pagamento integrado | Sim (Stripe), planos pagos | Sim (Stripe) | Não é o foco | Sim (Stripe), planos pagos |
| Round-robin / múltiplos anfitriões | Planos pagos | Sim, nativo | Não é o foco | Não |

### Decisões de design informadas pela concorrência

- **Slug de URL**: Calendly/Cal.com usam URLs legíveis (`calendly.com/usuario/30min`) — isso exige um sistema de "nome de usuário público" único globalmente, que o Kortex não tem hoje (o compartilhamento de notas usa token opaco por item, não um nome por usuário). Para não represar este plano num projeto à parte ("sistema de handle público"), a Fase 1 usa **token opaco por página de agendamento** (mesmo padrão já usado em `server/utils/share-token.ts` para notas) — URLs como `/agendar/[token]`, não legíveis. Uma URL legível (`/agendar/usuario/30min`, no estilo Calendly) fica registrada como possível evolução futura (seção 8), não bloqueando a entrega inicial.
- **Buffers e incrementos de horário**: tanto Calendly quanto Google Agendamentos tratam isso como configuração básica, não avançada — a Fase 1 já inclui buffer antes/depois e incremento de slot desde o primeiro momento (não como um "v2").
- **Overlay de agenda do convidado (SavvyCal)**: recurso de UX avançado e o mais caro de construir dos quatro concorrentes (exige o convidado conectar/importar a própria agenda) — fora do escopo deste plano (seção 8), mas vale registrar como o principal diferencial a perseguir depois, se o recurso validar uso.
- **Automação de comunicação (Workflows do Calendly)**: a Fase 5 deste plano entrega o mínimo necessário (confirmação + 1 lembrete) — o conceito completo de "gatilho + ação" configurável pelo usuário é um projeto à parte, não faz parte deste plano.

---

## 2. Visão do fluxo completo

```
ANFITRIÃO (autenticado)                       CONVIDADO (sem login)
──────────────────────                        ─────────────────────
1. Cria uma "página de agendamento"
   (título, duração, calendário-alvo,
   disponibilidade semanal, buffers,
   antecedência mín/máx, perguntas)
                                          
2. Copia o link público
   (/agendar/{token}) e compartilha    →   3. Abre o link — sem login
                                              vê: título, duração, anfitrião,
                                              calendário de dias disponíveis

                                          →  4. Escolhe um dia
                                              vê horários livres, já convertidos
                                              para o fuso horário do navegador

                                          →  5. Escolhe um horário
                                              preenche nome, e-mail e
                                              responde perguntas (se houver)

                                          →  6. Confirma a reserva
                                              (revalidação de disponibilidade
                                              no servidor, contra corrida)

7. Evento aparece na Agenda do            ←   8. Recebe e-mail de confirmação
   anfitrião normalmente, criado no          com data/hora no seu fuso,
   calendário-alvo da página                 e um link único de gerenciar
                                              (reagendar/cancelar)

9. Recebe e-mail avisando da              
   nova reserva (opcional, Fase 5)
   
                              [antes do horário marcado]
                                          
10. Lembrete por e-mail disparado    →   11. Convidado recebe lembrete,
    a X horas de antecedência              pode reagendar/cancelar pelo
    (Fase 5)                               mesmo link único
```

O ponto central de design: **o convidado nunca precisa de conta no Kortex** — toda a sessão dele é anônima, autenticada só pelo token da página de agendamento (para ver disponibilidade e reservar) e por um token de gerenciamento individual por reserva (para reagendar/cancelar depois).

---

## 3. Modelo de dados novo

Nenhuma tabela existente é alterada de forma destrutiva; o plano se apoia em `calendars`/`events`/`server/utils/recurrence.ts` já existentes (reaproveitados, não duplicados) e adiciona quatro tabelas novas.

```sql
-- supabase/migrations/<timestamp>_scheduling_pages_module.sql

CREATE TYPE scheduling_location_type AS ENUM ('video_link', 'phone', 'in_person', 'custom');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled', 'rescheduled');
CREATE TYPE scheduling_question_type AS ENUM ('text', 'textarea', 'select');

-- 1. Página de agendamento ("tipo de evento" no vocabulário Calendly)
CREATE TABLE scheduling_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES calendars(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  duration_minutes int NOT NULL CHECK (duration_minutes >= 5),
  location_type scheduling_location_type NOT NULL DEFAULT 'video_link',
  location_details text,
  timezone text NOT NULL, -- fuso do anfitrião no momento da criação; ver seção 4.2
  buffer_before_minutes int NOT NULL DEFAULT 0,
  buffer_after_minutes int NOT NULL DEFAULT 0,
  slot_increment_minutes int NOT NULL DEFAULT 15,
  min_notice_hours int NOT NULL DEFAULT 4,
  max_advance_days int NOT NULL DEFAULT 60,
  max_bookings_per_day int, -- NULL = sem limite
  share_token text NOT NULL UNIQUE, -- gerado via createShareToken(), reaproveitado de server/utils/share-token.ts
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

-- 2. Janelas de disponibilidade semanal (múltiplas por dia, ex.: manhã e tarde)
CREATE TABLE scheduling_availability_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  day_of_week smallint NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0 = domingo
  start_time time NOT NULL,
  end_time time NOT NULL,
  CHECK (end_time > start_time)
);

-- 3. Perguntas customizadas do formulário de reserva
CREATE TABLE scheduling_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  label text NOT NULL,
  type scheduling_question_type NOT NULL DEFAULT 'text',
  is_required boolean NOT NULL DEFAULT false,
  options jsonb, -- só para type = 'select'
  sort_order int NOT NULL DEFAULT 0
);

-- 4. Reservas de fato
CREATE TABLE bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scheduling_page_id uuid NOT NULL REFERENCES scheduling_pages(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE, -- o evento real criado na Agenda do anfitrião
  guest_name text NOT NULL,
  guest_email text NOT NULL,
  guest_timezone text NOT NULL,
  answers jsonb NOT NULL DEFAULT '{}', -- { questionId: resposta }
  status booking_status NOT NULL DEFAULT 'confirmed',
  manage_token text NOT NULL UNIQUE, -- reagendar/cancelar sem login
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz
);

CREATE INDEX idx_scheduling_pages_user_id ON scheduling_pages(user_id);
CREATE INDEX idx_scheduling_availability_page_id ON scheduling_availability_rules(scheduling_page_id);
CREATE INDEX idx_scheduling_questions_page_id ON scheduling_questions(scheduling_page_id);
CREATE INDEX idx_bookings_scheduling_page_id ON bookings(scheduling_page_id);
CREATE INDEX idx_bookings_event_id ON bookings(event_id);

-- RLS: leitura/escrita normal restrita ao dono (user_id = auth.uid(), ou via
-- join até scheduling_pages para as tabelas filhas) — os endpoints públicos
-- (seção 5) usam o client de service role, mesmo padrão já usado em
-- server/api/share/[token].get.ts para notas públicas.
```

> Por que não reaproveitar `event_reminders`/`event_exceptions` para isso? Uma reserva não é uma exceção de recorrência nem um lembrete — é uma entidade própria com convidado, respostas de formulário e um token de gerenciamento individual. Misturar os conceitos obrigaria a forçar campos irrelevantes (convidado, e-mail) dentro de tabelas pensadas para outra coisa.

---

## 4. Fase 1 — Configuração da página de agendamento (lado do anfitrião)

### 4.1 Endpoints

Namespace novo, análogo ao já existente `server/api/appointments/`:

| Método e rota | Função |
| --- | --- |
| `GET /api/appointments/scheduling-pages` | Lista as páginas de agendamento do usuário |
| `POST /api/appointments/scheduling-pages` | Cria página (título, duração, `calendarId`, buffers, incremento, antecedência mín/máx, limite/dia, regras de disponibilidade, perguntas) — gera `share_token` via `createShareToken()` |
| `GET /api/appointments/scheduling-pages/[id]` | Detalhe (com regras de disponibilidade e perguntas aninhadas) |
| `PATCH /api/appointments/scheduling-pages/[id]` | Atualiza qualquer campo, incluindo substituir regras de disponibilidade e perguntas |
| `POST /api/appointments/scheduling-pages/[id]/archive` | Soft-delete — desativa o link público (a página deixa de aceitar novas reservas; reservas já feitas continuam válidas) |
| `POST /api/appointments/scheduling-pages/[id]/regenerate-token` | Gera um novo `share_token`, invalidando o link antigo (mesmo padrão já usado no link público de notas) |
| `GET /api/appointments/scheduling-pages/[id]/bookings` | Lista as reservas feitas nessa página (visão do anfitrião) |

### 4.2 Fuso horário do anfitrião

`scheduling_pages.timezone` grava o fuso horário do anfitrião **no momento da criação** (detectado no cliente via `Intl.DateTimeFormat().resolvedOptions().timeZone`, igual ao que já acontece implicitamente em outras partes do app). Esse valor é a referência para interpretar as janelas de `scheduling_availability_rules` (que são só `time`, sem data) como horário de parede local do anfitrião — a conversão para UTC/fuso do convidado acontece no cálculo de disponibilidade (Fase 2), reaproveitando as mesmas funções de matemática de fuso horário já usadas em `habit-event-sync.ts`.

> ⚠️ Pré-requisito recomendado: essas funções (`getTimeZoneParts`, `getTimeZoneOffsetMilliseconds`, `zonedDateTimeToUtcIso`) hoje vivem só dentro de `habit-event-sync.ts`, não exportadas para reaproveitamento. Antes da Fase 2, mover para um util compartilhado (`server/utils/timezone.ts`) e importar nos dois lugares — evita escrever uma terceira cópia da mesma matemática de fuso horário no projeto.

### 4.3 UI — nova seção "Agendamento" na Agenda

Uma nova aba/seção na página `/app/appointments` (ou uma sub-rota `/app/appointments/scheduling`, mais simples de isolar) com: lista de páginas de agendamento existentes, botão "Criar página de agendamento", e um formulário (modal ou página cheia, no padrão já usado por `EventCreateModal.vue`) cobrindo:
- Título, descrição, calendário-alvo (`USelect` dos calendários do usuário — reaproveita o mesmo padrão de `EventCreateModal.vue`).
- Duração (minutos), tipo de local (link de vídeo/telefone/presencial/customizado) + campo de detalhe.
- Grade de disponibilidade semanal: um `UCheckbox` por dia da semana + campos de horário de início/fim, com um botão "+ adicionar outro horário" por dia (para suportar múltiplas janelas, ex.: manhã e tarde, como Calendly/Cal.com).
- Buffer antes/depois, incremento de horário, antecedência mínima/máxima, limite de reservas por dia.
- Lista de perguntas customizadas (texto/texto longo/seleção), reordenável.

### Critérios de aceite — Fase 1

- É possível criar uma página de agendamento completa e obter um link público funcional.
- Editar a página (ex.: mudar duração) não afeta reservas já confirmadas.
- Arquivar a página desativa o link sem apagar histórico de reservas.

---

## 5. Fase 2 — Página pública e cálculo de disponibilidade

### 5.1 Rota pública

`app/pages/agendar/[token].vue` (`ssr: true`, `layout: false` — mesmo padrão já usado pela página pública de nota compartilhada, `app/pages/share/[token].vue`). Sem autenticação.

### 5.2 Endpoints públicos (sem login)

Namespace novo `server/api/schedule/`, espelhando o padrão já estabelecido em `server/api/share/[token].get.ts`:

| Método e rota | Função |
| --- | --- |
| `GET /api/schedule/[token]` | Dados da página pública: título, descrição, duração, tipo/local, nome do anfitrião, perguntas — **sem** expor `calendarId`/dados internos do anfitrião. 404 se `is_active=false` ou `archived_at` preenchido. |
| `GET /api/schedule/[token]/availability?from&to&guestTimezone` | Calcula os slots livres no intervalo pedido (algoritmo detalhado abaixo), já convertidos para `guestTimezone`. |
| `POST /api/schedule/[token]/book` | Cria a reserva (seção 6). |

### 5.3 Algoritmo de disponibilidade

Para cada dia do intervalo `[from, to]` pedido:

1. **Janelas brutas**: buscar `scheduling_availability_rules` do dia da semana correspondente, convertidas de horário-de-parede-no-fuso-do-anfitrião para instantes UTC (reaproveitando o util de fuso horário compartilhado, seção 4.2).
2. **Ocupação existente**: buscar todos os eventos não arquivados de **todos os calendários do anfitrião** (não só o calendário-alvo da página — um compromisso pessoal em outro calendário também deve bloquear o horário) que se sobrepõem ao dia, **expandindo recorrência** via `expandRecurrence()` (já existente em `server/utils/recurrence.ts`).
   > ⚠️ Pré-requisito: `expandRecurrence`/o filtro SQL de `events.get.ts` tem um bug já documentado (`1.APPOINTMENTS.md`, seção 6) em que séries antigas somem de intervalos distantes no tempo. Como o cálculo de disponibilidade depende inteiramente de "quais horários já estão ocupados", esse bug **precisa ser corrigido antes desta fase**, ou o link de agendamento vai oferecer como "livre" um horário que na verdade já tem um compromisso recorrente antigo não detectado.
3. **Buffers**: expandir cada bloco ocupado por `buffer_before_minutes`/`buffer_after_minutes` da página antes de subtrair das janelas brutas.
4. **Fatiar em slots**: dividir o que sobrou das janelas em blocos de `duration_minutes`, avançando de `slot_increment_minutes` em `slot_increment_minutes`.
5. **Aplicar limites**: descartar slots antes de `min_notice_hours` a partir de agora, e depois de `max_advance_days`; se `max_bookings_per_day` estiver definido, descartar o dia inteiro assim que o limite for atingido (contagem via `bookings` com `status='confirmed'` naquele dia).
6. **Converter para o fuso do convidado** (`guestTimezone`, vindo do parâmetro da requisição — detectado automaticamente no cliente) só na resposta final — todo o cálculo interno permanece em UTC.

### 5.4 UI da página pública

- Cabeçalho: título/descrição da página, nome do anfitrião, duração, tipo de local.
- Seletor de dia (mini-calendário mensal, reaproveitando visualmente o mesmo grid de `MonthView.vue` numa versão somente-leitura/simplificada) — dias sem nenhum slot disponível aparecem desabilitados.
- Lista de horários do dia selecionado, já no fuso horário detectado do navegador do convidado (com um seletor manual de fuso, para o caso de o convidado estar agendando em nome de outro fuso).
- Ao escolher um horário: formulário (nome, e-mail, perguntas customizadas) + botão "Confirmar".

### Critérios de aceite — Fase 2

- Um horário com um evento existente (inclusive recorrente, inclusive num calendário diferente do calendário-alvo da página) nunca aparece como disponível.
- Buffers são respeitados — dois eventos separados só por buffer aparecem indisponíveis na margem correta.
- O convidado vê os horários corretamente convertidos para o próprio fuso, independente do fuso do anfitrião.

---

## 6. Fase 3 — Fluxo de reserva

`POST /api/schedule/[token]/book` recebe `{ startAt, guestName, guestEmail, guestTimezone, answers }` e:

1. **Revalida a disponibilidade daquele slot específico** (repete um recorte estreito do algoritmo da seção 5.3 só para o horário pedido) — necessário porque o cálculo de disponibilidade exibido ao convidado pode estar desatualizado por alguns segundos (outra pessoa reservando o mesmo horário entre o carregamento da página e o clique em "Confirmar"). Se o slot não estiver mais livre, retorna 409 com uma mensagem clara ("Esse horário acabou de ser reservado por outra pessoa") e a UI recarrega a disponibilidade automaticamente.
2. Cria o evento real em `events` (via a mesma lógica de `POST /api/appointments/events`, reaproveitada como função interna, não duplicada) — `title` = título da página + nome do convidado (ex.: "Reunião com Maria Silva"), `calendar_id` = `scheduling_pages.calendar_id`, horários = o slot escolhido, `event_timezone` = fuso do anfitrião.
3. Cria a linha em `bookings`, com `manage_token` novo (`createShareToken()`), vinculando `event_id`.
4. Dispara e-mail de confirmação para o convidado (Fase 5) e, opcionalmente, notificação para o anfitrião.
5. Retorna ao convidado os dados da reserva + o link de gerenciamento (`/agendar/gerenciar/[manageToken]`).

> ⚠️ **Risco de corrida aceito conscientemente**: o passo 1 reduz a janela de corrida, mas não a elimina 100% (dois `POST /book` simultâneos no mesmíssimo instante ainda podem, em teoria, passar os dois pela revalidação antes de qualquer um gravar). Uma blindagem mais forte é possível no banco via `EXCLUDE USING gist` sobre um `tstzrange` de `events` por calendário (impede overlap a nível de constraint) — registrada como endurecimento futuro (seção 8), não como bloqueio da entrega inicial, já que a janela de corrida real é da ordem de milissegundos e o produto já teria, nesse cenário raro, uma forma clara de o anfitrião perceber e resolver manualmente (dois eventos no mesmo horário, visíveis na Agenda).

### Critérios de aceite — Fase 3

- Reservar um horário cria um evento real e visível na Agenda do anfitrião imediatamente.
- Tentar reservar um horário que acabou de ser ocupado por outra pessoa falha com uma mensagem clara, não com um erro genérico.

---

## 7. Fase 4 — Gerenciamento pós-reserva (reagendar/cancelar)

`app/pages/agendar/gerenciar/[manageToken].vue` — página pública (sem login) mostrando os detalhes da reserva e duas ações:

- **Cancelar**: `POST /api/schedule/manage/[manageToken]/cancel` — marca `bookings.status='cancelled'`, `cancelled_at=agora`, e arquiva o evento correspondente (reaproveitando a mesma lógica de `POST /api/appointments/events/[id]/archive`, incluindo o snapshot em `event_history`). Dispara e-mail de confirmação de cancelamento.
- **Reagendar**: `POST /api/schedule/manage/[manageToken]/reschedule` com `{ newStartAt }` — repete a validação de disponibilidade da Fase 2/3 para o novo horário, atualiza o evento existente (`PATCH` interno, não cria um evento novo) e marca `bookings.status='rescheduled'` só transitoriamente durante a operação, voltando a `confirmed` com os novos horários ao final (o registro de reserva é o mesmo, só os horários mudam — não há necessidade de um histórico de reagendamentos na v1).

### Critérios de aceite — Fase 4

- Cancelar pelo link de gerenciamento remove o evento da Agenda do anfitrião (arquivado, não perdido).
- Reagendar reflete o novo horário tanto na Agenda do anfitrião quanto na confirmação do convidado, sem duplicar o evento.

---

## 8. Fase 5 — Notificações (a primeira infraestrutura de e-mail real do projeto)

Como identificado na introdução deste documento, **o Kortex hoje não tem nenhum provedor de e-mail transacional integrado** — isso não é uma lacuna deste recurso especificamente, é uma lacuna de infraestrutura do projeto inteiro (a mesma ausência já explica por que os lembretes de evento comuns nunca são entregues, `1.APPOINTMENTS.md`, seção 7). Esta fase constrói o mínimo necessário:

1. **Escolher e integrar um provedor de e-mail transacional** (ex.: Resend, Postmark — qualquer um com API simples e um plano gratuito generoso o suficiente para o volume inicial) — `server/utils/email.ts` novo, no mesmo espírito de `server/utils/supabase.ts` (client singleton, lazy).
2. **Três e-mails no fluxo mínimo**:
   - Confirmação para o convidado, ao reservar (data/hora no fuso dele, local, link de gerenciar).
   - Confirmação de cancelamento/reagendamento para o convidado.
   - Um lembrete, disparado por um cron (endpoint protegido por segredo, no mesmo padrão de `POST /api/habits/cron-skip`) rodando periodicamente e buscando reservas `confirmed` cujo horário está a menos de N horas de distância (configurável, padrão 24h) e que ainda não tiveram lembrete enviado (nova coluna `bookings.reminder_sent_at`).
3. **Notificação opcional ao anfitrião** — e-mail avisando de uma nova reserva, reaproveitando o mesmo `server/utils/email.ts`.

> Esta infraestrutura, uma vez construída, é o caminho mais direto para finalmente também resolver a entrega de lembretes de eventos comuns (`1.APPOINTMENTS.md`, seção 7, item já registrado como P0 na análise de mercado geral da Agenda) — vale desenhar `server/utils/email.ts` de forma genérica o suficiente para servir aos dois casos, não só a agendamentos.

### Critérios de aceite — Fase 5

- Uma reserva sempre gera um e-mail de confirmação para o convidado, com informação correta no fuso horário dele.
- O lembrete é enviado uma única vez por reserva (idempotência via `reminder_sent_at`).

---

## 9. Fora de escopo (deste plano)

- **Pagamento integrado** (cobrar pela reserva, ao estilo Calendly/Cal.com com Stripe) — recurso relevante para casos de uso de negócio, mas não essencial para a primeira versão de um app de produtividade pessoal.
- **Round-robin entre múltiplos anfitriões** — o Kortex hoje não tem conceito de "time"/conta compartilhada; esse recurso pressupõe uma camada de organização que não existe.
- **Overlay de agenda do convidado** (diferencial do SavvyCal) — exigiria o convidado conectar a própria agenda externa, um projeto de integração à parte.
- **URLs legíveis/vaidosas** (`/agendar/usuario/30min`) — depende de um sistema de nome de usuário público único, hoje inexistente; a Fase 1 usa token opaco (seção 1) deliberadamente para não bloquear a entrega nisso.
- **Constraint de exclusão a nível de banco** (`EXCLUDE USING gist`) contra corrida de reserva — mitigação mais forte, registrada como endurecimento futuro (seção 6), não bloqueante.

## 10. Riscos

- **Bug de recorrência antiga precisa ser corrigido antes da Fase 2** (seção 5.3) — sem isso, o cálculo de disponibilidade pode oferecer como livre um horário na verdade ocupado por uma série antiga, gerando conflito real na Agenda do anfitrião.
- **Nenhuma infraestrutura de e-mail existe hoje** — a Fase 5 é, na prática, um projeto de infraestrutura novo dentro do plano, com uma decisão de fornecedor externo que precisa de aprovação (custo, mesmo que baixo em um plano gratuito inicial).
- **Cálculo de disponibilidade cruzando todos os calendários do anfitrião** (seção 5.3, passo 2) pode ficar lento para contas com muitos eventos/calendários — vale medir o tempo de resposta de `GET /api/schedule/[token]/availability` cedo, e considerar cache de curta duração (poucos minutos) se necessário.

## 11. Checklist de rollout

- [ ] Correção do bug de recorrência antiga (`1.APPOINTMENTS.md`, seção 6) — pré-requisito bloqueante da Fase 2
- [ ] Util de fuso horário compartilhado (`server/utils/timezone.ts`) extraído de `habit-event-sync.ts`
- [ ] Migration `scheduling_pages_module.sql` (4 tabelas + RLS)
- [ ] Fase 1 — endpoints + UI de configuração da página de agendamento
- [ ] Fase 2 — página pública + algoritmo de disponibilidade
- [ ] Fase 3 — fluxo de reserva com revalidação anti-corrida
- [ ] Fase 4 — página de gerenciamento (reagendar/cancelar)
- [ ] Fase 5 — provedor de e-mail integrado + 3 e-mails do fluxo mínimo + cron de lembrete
