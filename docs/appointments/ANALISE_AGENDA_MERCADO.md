# Análise de mercado — Agenda

Este documento compara o módulo Agenda do Kortex (`app/pages/app/appointments.vue`, `useAppointments.ts`, documentado em [`1.APPOINTMENTS.md`](./1.APPOINTMENTS.md)) com o mercado de calendários — **Google Calendar** em primeiro lugar, já que foi a referência de design usada na construção do módulo (o modelo de dados atual — calendários com cor/visibilidade, eventos com RRULE, convite por horário vazio — segue de perto a mesma filosofia), além de **Outlook Calendar**, **Apple Calendar**/**Fantastical** (o padrão de polimento no ecossistema Apple) e **Notion Calendar** (antigo Cron — a referência mais próxima de "calendário dentro de uma ferramenta de produtividade geral com blocos de tempo e integração de tarefas", categoria mais parecida com o próprio Kortex do que um calendário standalone).

> Mesmo formato dos demais documentos de análise de mercado do projeto: todo item "❌ Faltando"/"⚠️ Parcial" foi conferido no código (via `1.APPOINTMENTS.md`, levantado com pesquisa direta de todos os endpoints e componentes) — não é suposição. A pesquisa de mercado (seção 6) usa fontes públicas de 2026, listadas ao final.

**Escopo**: este documento cobre o módulo Agenda como um todo. A funcionalidade de **link de agendamento público** (o recurso que Calendly/Cal.com fazem de melhor) é tratada em separado, com fluxo completo e análise de concorrência dedicada, em [`docs/appointments/PLANO_LINK_AGENDAMENTO.md`](./PLANO_LINK_AGENDAMENTO.md) — aqui ela aparece só como um item de roadmap (P3), cross-referenciando o plano detalhado.

---

## 1. O que já existe (baseline)

Múltiplos calendários coloridos por usuário, eventos com recorrência (RRULE, motor próprio sem biblioteca externa), três visões (dia/semana/mês) com arrastar-e-soltar, criação rápida por clique num horário vazio, cancelamento de ocorrência única, e a sincronização automática de hábitos com horário agendado como eventos de calendário.

É uma base tecnicamente sólida no que diz respeito à modelagem de recorrência (o motor de expansão de RRULE, mesmo hand-rolled, cobre `DAILY`/`WEEKLY`/`MONTHLY` com `INTERVAL`/`COUNT`/`UNTIL`/`BYDAY` — mais do que muitos apps caseiros tentam construir). Mas, como `1.APPOINTMENTS.md` documenta, o módulo tem uma limitação estrutural que nenhum concorrente pesquisado compartilha: **é um calendário de um usuário só** — sem convidados, sem convite, sem compartilhamento de disponibilidade, sem sincronização com nenhum calendário externo. Todo o resto do mercado de calendários existe, em grande parte, para resolver exatamente o problema que o Kortex hoje não tenta resolver: coordenar tempo entre pessoas.

---

## 2. Lacunas por categoria

### 2.1 Colaboração e convites (a lacuna estrutural nº1)

| Recurso | Status | Nota |
| --- | --- | --- |
| **Convidar participantes num evento** | ❌ Faltando | Não existe campo de convidados/participantes em `events` — nenhum concorrente pesquisado (Google, Outlook, Apple, Fantastical, Notion Calendar) trata isso como opcional; é o caso de uso central de "calendário", não um extra. |
| **RSVP** (aceitar/recusar/talvez) | ❌ Faltando | Consequência direta do item acima — sem convidados, não há o que confirmar. |
| **Compartilhar um calendário com outra pessoa** | ❌ Faltando | O campo `visibility` (`private`/`shared`/`public`) existe no schema, mas é sempre `private` na prática — sem UI, sem lógica de acesso compartilhado implementada (`1.APPOINTMENTS.md`, seção 5). Google Calendar trata "compartilhar calendário" como recurso central desde sempre. |
| **Ver disponibilidade de outra pessoa (free/busy)** | ❌ Faltando | Base de qualquer agendamento colaborativo em Google/Outlook ("Encontrar um horário"). Sem conceito de múltiplos usuários visualizando o mesmo calendário, essa pergunta nem faz sentido hoje no Kortex. |

### 2.2 Sincronização externa

| Recurso | Status | Nota |
| --- | --- | --- |
| **Importar/sincronizar calendários externos** (Google, Outlook, iCloud) | ❌ Faltando | Todo concorrente pesquisado — inclusive o Notion Calendar, que é o mais "de nicho" dos quatro — trata isso como recurso básico ("integra profundamente com contas do Google Calendar, sincronizando todos os eventos"). O Kortex hoje é uma ilha: nada que acontece em outro calendário do usuário aparece aqui, e vice-versa. |
| **Exportar/assinar via ICS** | ❌ Faltando | Nem importação nem exportação de arquivos `.ics` existe — inviabiliza até o caso de uso mais simples ("adicionar este evento ao meu Google Calendar"). |

### 2.3 Entrada de dados e produtividade

| Recurso | Status | Nota |
| --- | --- | --- |
| **Entrada por linguagem natural** | ❌ Faltando | O diferencial mais citado do Fantastical: digitar "Café com Ben terça 15h no Verve" e o app preenche local/horário/participante sozinho. O Kortex exige preencher cada campo manualmente no formulário. |
| **Coluna de fuso horário / múltiplos fusos lado a lado** | ❌ Faltando | Recurso citado do Notion Calendar ("arraste a coluna de fuso horário para ver qualquer cidade"). Some-se a isso um problema mais profundo já documentado (`1.APPOINTMENTS.md`, seção 6): a expansão de recorrência do Kortex faz matemática em UTC puro, não em horário de parede por fuso — um risco real de deslocamento em mudanças de horário de verão, não só uma lacuna de recurso. |
| **Integração com tarefas/itens de produtividade no próprio calendário** | ⚠️ Parcial | O Notion Calendar mostra itens de banco de dados do Notion ao lado dos eventos, editáveis no próprio calendário. O Kortex tem uma versão estreita disso — só hábitos com horário sincronizam automaticamente (`1.APPOINTMENTS.md`, seção 12) — mas tarefas de Metas e notas do módulo Notas não aparecem na Agenda de forma alguma. |
| **Bloqueio de tempo (time blocking) como conceito de primeira classe** | ⚠️ Parcial | Tecnicamente possível (criar um evento comum), mas nenhum recurso dedicado — Notion Calendar trata isso como um modo de uso central, com atalhos e integração de tarefa→bloco. |

### 2.4 Confiabilidade e notificações

| Recurso | Status | Nota |
| --- | --- | --- |
| **Lembretes que de fato chegam** (push/e-mail) | ❌ Faltando | Já confirmado como recurso meio-construído em `1.APPOINTMENTS.md` (seção 7): dá pra configurar um lembrete na criação, mas nenhum job jamais o entrega. Todo concorrente pesquisado trata notificação confiável como tabela-stakes absoluta — é literalmente a razão de existir de um lembrete. |
| **Edição por ocorrência** ("esta", "esta e as seguintes", "todas") | ❌ Faltando | Padrão universal em Google/Outlook/Apple ao editar um evento recorrente — três opções claras. O Kortex só tem "cancelar uma ocorrência" ou "editar a série inteira"; não existe a opção intermediária "esta e as seguintes" nem "editar só esta" (`1.APPOINTMENTS.md`, seção 6). |

---

## 3. Roadmap sugerido (por esforço x impacto)

### P0 — Corrigir o que já está confirmado como quebrado antes de competir em recursos
1. ✅ **Concluído em 2026-08-23:** consertado o bug de eventos recorrentes antigos sumindo em visões futuras e a paginação inconsistente para calendários com muita recorrência (`1.APPOINTMENTS.md`, seção 6). `GET /api/appointments/events` agora inclui séries recorrentes iniciadas antes do intervalo visível, expande ocorrências antes de paginar quando há `from`/`to`, e retorna `total` baseado nas ocorrências exibíveis.
2. ✅ **Concluído em 2026-08-23:** edição, arquivamento e restauração de calendários foram conectados na UI. O painel de calendários agora abre o modal de edição, confirma antes de arquivar e exibe calendários arquivados com ação de restaurar.
3. **Entregar lembretes de verdade** (pelo menos um canal — e-mail ou push do navegador) — é a lacuna mais citada como "básico absoluto" em qualquer fonte pesquisada sobre calendários.

### P1 — Fecha o gap estrutural nº1: calendário deixa de ser de uma pessoa só
4. **Convidar participantes num evento + RSVP** — maior mudança estrutural da lista, mas também a que mais separa o Kortex de qualquer concorrente real da categoria.
5. **Edição por ocorrência** ("esta"/"esta e as seguintes"/"todas") — a UX padrão que falta para a recorrência já implementada no servidor ser usável no nível esperado pelo mercado.
6. **Matemática de recorrência ciente de fuso horário** (não mais UTC puro) — corrige o risco de deslocamento em DST antes de expandir o recurso para mais casos de uso.

### P2 — Sincronização e produtividade
7. **Sincronização com Google Calendar** (pelo menos leitura/importação, depois escrita bidirecional) — maior projeto de infraestrutura da lista, mas também o que mais devolveria valor imediato: a maioria dos usuários já tem um Google Calendar com anos de eventos.
8. **Exportar/assinar via ICS** — muito mais barato que sincronização bidirecional completa e cobre boa parte do caso de uso "compartilhar isso com alguém fora do Kortex".
9. **Entrada por linguagem natural** — bom-ter de esforço médio (parsing de texto para campos), alto impacto percebido (é o recurso mais citado como "sensação de produto polido" na categoria).
10. **Mostrar tarefas de Metas e notas relevantes na Agenda** (não só hábitos) — expande o "bloqueio de tempo" real, aproveitando a integração que hábitos já provam ser tecnicamente viável.

### P3 — Diferenciação
11. **Link de agendamento público** — ver [`docs/appointments/PLANO_LINK_AGENDAMENTO.md`](./PLANO_LINK_AGENDAMENTO.md) para o plano completo, com análise de concorrência dedicada (Calendly, Cal.com, SavvyCal, e o próprio recurso de agendamento do Google Calendar).
12. **Compartilhar calendário com outra pessoa** (visibilidade `shared` de fato implementada) — só faz sentido depois do item 4 (convidados) existir; caminho natural de evolução para uma versão simples de colaboração multiusuário.

---

## 4. Fora de escopo (não recomendo perseguir agora)

- **Sincronização bidirecional completa e em tempo real com múltiplos provedores externos** (Google + Outlook + iCloud simultaneamente, com resolução de conflito) — é o tipo de projeto que provedores dedicados (Calendly, SavvyCal) construíram ao longo de anos; começar por importação/leitura de um provedor (item 7, escopo reduzido) é o caminho realista.
- **Videochamada nativa integrada** (gerar e hospedar a própria chamada de vídeo, como o Google Meet embutido no Google Calendar) — fora de escopo; a alternativa realista é permitir colar um link externo (Zoom/Meet/Teams) no campo de local, que já é tecnicamente possível hoje sem nenhuma mudança.

---

## 5. Relação com os outros roadmaps do Kortex

- **Mostrar tarefas/metas na Agenda** (P2, item 10) conecta diretamente com o roadmap de Metas (`docs/goals/ANALISE_METAS_MERCADO.md`) — uma "revisão periódica de meta" (já proposta lá) ganharia força se pudesse aparecer como bloco de tempo reservado no calendário.
- **Lembretes de verdade** (P0, item 3) resolve, de brinde, uma infraestrutura que o **link de agendamento público** (P3, `PLANO_LINK_AGENDAMENTO.md`) também precisa — confirmação por e-mail de uma reserva é, tecnicamente, o mesmo tipo de "notificação que precisa realmente ser entregue" que os lembretes de evento comuns.
- **Sincronização com hábitos** já prova que o Kortex consegue materializar dado de outro módulo como evento de calendário — o mesmo padrão (unidirecional, por enquanto) é o caminho mais barato para o item 10 (tarefas de metas), antes de qualquer projeto maior de bloqueio de tempo bidirecional.

---

## 6. O que a comunidade/mercado pede (pesquisa)

Levantamento em comparativos de 2026 dos calendários mais usados — Google Calendar, Outlook, Apple Calendar, Fantastical e Notion Calendar.

### 6.1 Google Calendar — a referência que o Kortex já seguiu, e o que ainda falta copiar

Google Calendar é citado como líder do ranking de 2026 "para a maioria das pessoas" justamente pelos motivos que são a maior lacuna do Kortex hoje: "lida com múltiplos calendários, agendamento compartilhado e eventos recorrentes sem fricção" — **compartilhado** é a palavra-chave que falta. O Kortex já seguiu o Google no modelo de dados (calendários com cor, eventos com RRULE) — o próximo passo natural, segundo essa mesma referência, é seguir também no que faz o Google Calendar ser usado por equipes inteiras: convite, RSVP e disponibilidade compartilhada (itens 4–5 do roadmap, P1). Vale notar que o próprio Google Calendar despriorizou funcionalidades de tarefas ("recursos básicos de planejamento de tarefas") em favor de agendamento robusto — uma pista de que replicar o foco do Google em colaboração tende a valer mais a pena do que competir em gerenciamento de tarefas dentro do calendário.

### 6.2 Fantastical — o padrão de "sensação de produto polido"

O recurso mais citado do Fantastical não é estrutural, é de entrada de dados: "digitar 'Café com Ben terça 15h no Verve' e o app preenche local, horário e participante sozinho" — processamento de linguagem natural. Isso reforça a priorização do item 9 (P2): é um recurso relativamente barato de construir (parsing de texto, sem mudança de arquitetura) com efeito desproporcional na percepção de qualidade do produto.

### 6.3 Notion Calendar — a referência mais próxima da filosofia do Kortex

Notion Calendar é o concorrente mais parecido em espírito com o Kortex (calendário como parte de uma ferramenta de produtividade maior, não um produto isolado) — e é citado especificamente por "mostrar itens de banco de dados do Notion ao lado dos eventos" e por "bloqueio de tempo como recurso de primeira classe, não um acessório". É a validação de mercado mais direta para os itens 10 (mostrar tarefas de Metas na Agenda) e para a ideia geral de que o calendário do Kortex deveria refletir o resto do produto, não só existir paralelamente a ele — o mesmo raciocínio já aplicado com sucesso técnico (mesmo que com bugs de sincronização) na integração de Hábitos.

### 6.4 O que todo mundo trata como básico e o Kortex ainda não entrega

Nenhuma fonte pesquisada trata "lembrete que realmente chega" ou "editar só esta ocorrência de uma série" como diferencial — são tratados como piso mínimo de qualquer calendário sério. Vale o mesmo alerta já feito na análise de mercado de Metas: esses dois itens (P0/P1) deveriam vir antes de qualquer investimento em recursos novos, porque não são uma questão de competir melhor — são uma questão de o produto atual ainda não fazer, de forma confiável, o que um calendário promete fazer por definição.

### Fontes consultadas

- [Fantastical vs Google Calendar: 2026 Side-by-Side Comparison — Morgen](https://www.morgen.so/blog-posts/fantastical-vs-google-calendar)
- [10 best calendar apps in 2026 — 2sync](https://2sync.com/blog/best-calendar-apps)
- [9 Best Calendar Apps in 2026 — TechEngage](https://techengage.com/best-calendar-apps/)
- [9 Best Calendar Apps in 2026 (Free & Paid, Compared) — AgendaCraft](https://www.agendacraft.ai/blog/best-calendar-apps-2026/)
- [Best iPhone Calendar Apps Compared: Fantastical, Google, and Apple (2026) — ClipboardAI](https://clipboardai.app/blog/articles/best-iphone-calendar-apps-compared)
- [How to Use Notion Calendar (2026 Guide)](https://itsourcecode.com/notion/how-to-use-notion-calendar/)
- [Notion Calendar Review 2026 — Efficient App](https://efficient.app/apps/notion-calendar)
- [Notion Calendar - Features, pricing & reviews (2026) — Toolguide](https://toolguide.io/en/tool/notion-calendar/)
