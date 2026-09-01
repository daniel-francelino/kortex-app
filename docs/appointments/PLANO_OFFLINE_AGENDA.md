# Modo offline e UI otimista — Agendamento

Este documento descreve a arquitetura de otimismo/offline aplicada ao módulo
de Agendamento (eventos, calendários e páginas de agendamento), reproduzindo
o padrão já usado em Notas e Diário de Bordo. Ver
[`docs/notes/PLANO_COMPARTILHAMENTO_E_OFFLINE.md`](../notes/PLANO_COMPARTILHAMENTO_E_OFFLINE.md)
(Parte B) para a especificação original desse padrão — este documento cobre
apenas o que é específico da extensão para Agendamento, incluindo os pontos
em que ela diverge deliberadamente do precedente de Notas/Diário.

## Escopo

Otimista + offline (fila de mutações, sincronização ao reconectar):

- **Eventos**: criar, editar, arquivar (`useAppointments.ts`).
- **Calendários**: criar, editar, arquivar, restaurar (`useAppointments.ts`).
- **Páginas de agendamento**: criar, editar, arquivar (`useSchedulingPages.ts`).

Fora de escopo (permanecem chamadas online simples, sem otimismo):

- Edição de ocorrências recorrentes (`cancelOccurrence`, `modifyOccurrence`,
  `splitSeries`), lembretes, participantes/RSVP e compartilhamento de
  calendário — ações complexas e pouco frequentes, mesmo tratamento que
  Notas dá a ações não-essenciais (ex.: `setNoteVisibility`).
- `regenerateShareToken` (o token é gerado no servidor, não há como prever o
  valor no cliente) e `duplicateSchedulingPage` (lê-então-cria, depende de
  round-trip).
- Fluxo público de agendamento (`server/api/schedule/**`) — é acessado por
  visitantes sem sessão, não pelo usuário autenticado do app.
- Cache de leitura para boot offline (Notas tem um para a árvore de pastas;
  Diário não tem nenhum). A visão de eventos é uma janela de datas deslizante,
  não uma lista fixa — "o que cachear para abrir offline" é uma decisão de
  design separada, não coberta aqui. Offline aqui significa: o app já estava
  carregado e a conexão caiu durante o uso — as mutações continuam
  aplicando-se localmente e entram na fila.

## Reuso da infraestrutura de Notas/Diário

Sem alterações: `useOptimisticAction` (apply/rollback/request/reconcile),
`useConnectionStatus` (estado online singleton + evento de reconexão).

Com extensão: `useMutationQueue` — `PendingMutationEntity` ganhou
`'calendar' | 'event' | 'scheduling_page'` (a fila em si já era
entidade-agnóstica; só o union de tipos precisava crescer).

`useAppointments.ts` e `useSchedulingPages.ts` seguem a mesma receita de
`useJournal.ts`: um `reactive(Map)` como fonte de verdade local, populado por
upsert (nunca substituição total) tanto pelos resultados de fetch quanto
pelas mutações otimistas, e um `drainMutationQueue()` próprio por composable
— filtrado às próprias entidades, já que a fila é compartilhada entre todos
os módulos — que repete as mutações pendentes em ordem e converge com um
refetch completo ao final (não tenta reaplicar os closures de `reconcile()`
originais, que não sobrevivem a um reload).

## Diferença deliberada: id real desde a criação

Notas/Diário criam um id temporário (`temp-${uuid}`) na criação otimista e
trocam pelo id real do servidor na reconciliação — isso exige rastrear e
substituir esse id em todo array/estrutura que o referencie.

Agendamento gera o id real (`crypto.randomUUID()`) no cliente, no momento da
criação, e o envia já no `POST`. Isso elimina a necessidade de
reconciliação de id (o id nunca muda entre o estado otimista e o confirmado)
e é o que viabiliza a idempotência abaixo. Como efeito colateral, o
`tempId` usado para dobrar uma atualização/exclusão subsequente dentro de um
`create` ainda pendente (ver `useMutationQueue.enqueue`) pode ser passado
incondicionalmente em `updateEvent`/`archiveEvent`/etc. — ao contrário do
`id.startsWith('temp-') ? id : undefined` que Notas precisa fazer, aqui não
há necessidade de saber se a entidade "ainda pode estar pendente": se não
houver um `create` pendente com aquele id, a fila simplesmente ignora o
`tempId` e segue o fluxo normal de update/delete.

## Idempotência nos endpoints de criação

Notas e Diário aceitam o risco de duplicar um registro se uma mutação de
criação enfileirada offline for repetida (ex.: resposta chegou mas o
`dequeue` local falhou antes de persistir). Para Agendamento, os três
endpoints de criação (`POST /api/appointments/events`,
`POST /api/appointments/calendars`,
`POST /api/appointments/scheduling-pages`) agora aceitam um `id` opcional
gerado pelo cliente e tratam um conflito de chave primária (Postgres
`23505`) como "já foi criado, devolver o registro existente" em vez de
erro — mesma ideia do padrão já usado em
`server/utils/habit-event-sync.ts` (`upsertHabitEventLink`), estendida um
passo além: em vez de engolir o erro, busca e devolve a linha existente.
Uma segunda tentativa de criar o mesmo registro (mesmo `id`) é, portanto,
um no-op seguro, não uma duplicata.

Para páginas de agendamento — que além da linha principal gravam regras de
disponibilidade e perguntas em tabelas filhas, em inserts separados — a
idempotência da criação inteira vem de sempre fazer *delete-then-reinsert*
dessas linhas filhas (o mesmo idioma que o endpoint de `PATCH` já usa),
independente de a linha principal ter acabado de ser criada ou já existir.

## Resolução de conflito

A mesma política de Notas/Diário: **last-write-wins por `updatedAt`**, sem
CRDT/OT. Não há tentativa de mesclar edições concorrentes campo a campo.

## Indicador de UI

`/app/appointments` e `/app/scheduling` mostram a mesma barra de status que
o Diário de Bordo usa (`app/pages/app/journal/index.vue`): ícone + texto
alternando entre "offline", "sincronizando" e "N alteração(ões) pendente(s)",
alimentado por `isOnline`/`pendingSyncCount`/`syncingOffline`, expostos por
`useAppointments()` e `useSchedulingPages()`.
