# Plano de implementação — Ajustes de UX mobile: Agenda e Agendamento

Este documento especifica como implementar 7 ajustes pontuais de UX mobile levantados a partir de prints da Agenda (`/app/appointments`) e da página de Agendamento (`/app/scheduling`). Os itens são independentes entre si — podem ser implementados e entregues separadamente, na ordem que fizer sentido. Cada seção traz: o problema, onde o comportamento atual está implementado (arquivo:linha), e o passo a passo de como mudar.

> Nenhuma mudança de código foi feita ao gerar este documento — é só o plano. Ver [`1.APPOINTMENTS.md`](./1.APPOINTMENTS.md) para o contexto geral do módulo de Agenda.

## Resumo dos arquivos envolvidos

| # | Ajuste | Arquivo(s) principal(is) |
| --- | --- | --- |
| 1 | Navegação por swipe no mobile | `app/pages/app/appointments.vue` |
| 2 | Título sem capitalize incorreto | `app/pages/app/appointments.vue` |
| 3 | Ícone do botão "+" centralizado | `app/pages/app/appointments.vue` |
| 4 | Formatação de hora `00:00` | `app/composables/useCalendarLayout.ts` |
| 5 | Paridade de navegação em `/app/scheduling` | `app/pages/app/scheduling.vue`, `app/composables/useMobileContextNav.ts`, `app/components/MobileBottomNav.vue` |
| 6 | Chips do menu inferior preenchendo o espaço | `app/components/MobileBottomNav.vue` |
| 7 | Botão "ir para hoje" com ícone centralizado no mobile | `app/pages/app/appointments.vue` |

---

## 1. Navegação por swipe no mobile (remover setas `<` `>`)

**Problema:** no mobile, as setas de navegação (`<` `>`) ocupam espaço no header; a navegação entre dias/semanas/meses deveria acontecer por gesto de arrastar (swipe) no conteúdo do calendário.

**Estado atual:**
- Setas: `app/pages/app/appointments.vue:454-465` (dois `UButton` com `icon="i-lucide-chevron-left"` / `chevron-right`, chamando `goPrev()` / `goNext()`).
- `goPrev()` / `goNext()`: `app/pages/app/appointments.vue:93-129` — já tratam os 3 modos (`month`/`week`/`day`), reutilizáveis como estão.
- Não existe nenhum tratamento de toque/swipe no projeto hoje (busca por `touchstart`, `touchend`, `swipe`, `useSwipe` no diretório `app/` não retorna nenhum resultado) — não há padrão existente a seguir.
- `@vueuse/core` (`^14.2.1`, `package.json:65`) já é dependência do projeto e traz `useSwipe` pronto — não precisa adicionar biblioteca nova.

**Implementação:**

1. Esconder as duas setas abaixo do breakpoint `sm` (mesmo padrão já usado no botão "Hoje", linha 451: `class="hidden sm:flex"`). Adicionar essa classe aos dois `UButton` de `chevron-left`/`chevron-right` (linhas 454-465).
2. Colocar uma `ref` no elemento que envolve a view atual (`DayView`/`WeekView`/`MonthView`) dentro do slot `#body` de `appointments.vue`, e ligar `useSwipe`:

   ```ts
   import { useSwipe } from '@vueuse/core'

   const calendarBodyRef = ref<HTMLElement | null>(null)

   useSwipe(calendarBodyRef, {
     threshold: 50,
     onSwipeEnd(_event, direction) {
       if (direction === 'left') goNext()
       else if (direction === 'right') goPrev()
     }
   })
   ```

   ```vue
   <div ref="calendarBodyRef" class="flex-1 overflow-y-auto">
     <DayView v-if="activeView === 'day'" ... />
     <WeekView v-else-if="activeView === 'week'" ... />
     <MonthView v-else ... />
   </div>
   ```

3. **Cuidado com o scroll vertical:** `DayView`/`WeekView` têm scroll vertical na grade de horas (0h–23h). O `useSwipe` do VueUse já calcula a `direction` pelo ângulo do gesto (prioriza horizontal vs. vertical), então um scroll vertical normal não deve disparar `onSwipeEnd` com `direction: 'left'/'right'` — ainda assim, testar em dispositivo real (ou emulação touch do DevTools) para confirmar que arrastar verticalmente na grade de horas continua rolando normalmente e não é interpretado como swipe lateral.
4. **Cuidado com interações existentes na grade:** antes de ligar o `useSwipe` em toda a área do calendário, confirmar em `DayView.vue`/`WeekView.vue` se já existe alguma interação de arrastar para criar evento (drag-to-create) na grade — se existir, restringir o alvo do swipe para não conflitar (ex.: só ativar o listener de swipe quando `activeView !== 'day'`/`'week'` estiver em modo de leitura, ou aplicar o `useSwipe` num elemento wrapper que fique "atrás" dos blocos de evento).
5. Ativar isso só abaixo do breakpoint `lg` (onde o `MobileBottomNav` também passa a existir — ver `MobileBottomNav.vue:72`, `class="mobile-bottom-nav lg:hidden"`), para não alterar o comportamento de mouse no desktop. Pode usar `useMediaQuery('(max-width: 1023px)')` do próprio `@vueuse/core` para condicionar o `onSwipeEnd`.

---

## 2. Título sem capitalize incorreto

**Problema:** o título do período ("Segunda-Feira, 24 De Agosto De 2026") está com todas as palavras maiúsculas, incluindo preposições ("De"). O correto é só a primeira letra maiúscula: "Segunda-feira, 24 de agosto de 2026".

**Estado atual:**
- `headerLabel` (computed): `app/pages/app/appointments.vue:72-91` — usa `Date.toLocaleDateString('pt-BR', ...)`, que já retorna a string **toda em minúsculas** (`"segunda-feira, 24 de agosto de 2026"`).
- A classe CSS `capitalize` é aplicada no `<h2>` que renderiza esse valor, `app/pages/app/appointments.vue:466`:
  ```vue
  <h2 class="ml-1 min-w-36 text-sm font-semibold capitalize text-highlighted">
  ```
  `text-transform: capitalize` deixa **cada palavra** com a primeira letra maiúscula — daí "De" e "Agosto" ficarem capitalizados incorretamente.
- **O projeto já tem o padrão de correção certo em outro lugar**, com o motivo documentado em comentário: `app/components/journal/TodayEditor.vue:330-341`:
  ```ts
  // pt-BR gives this back fully lowercase ("sábado, 22 de agosto de 2026") — a
  // CSS `capitalize` class would title-case every word ("De Agosto De 2026"),
  // so this only uppercases the leading letter instead.
  function formatToday(): string {
    const raw = new Date(today + 'T12:00:00').toLocaleDateString('pt-BR', { ... })
    return raw.charAt(0).toUpperCase() + raw.slice(1)
  }
  ```

**Implementação:**

1. Remover a classe `capitalize` do `<h2>` em `appointments.vue:466`.
2. Adicionar um helper local (ou compartilhado — ver nota abaixo) e aplicá-lo nos 3 branches de `headerLabel` (linhas 72-91):
   ```ts
   function capitalizeFirst(s: string): string {
     return s.charAt(0).toUpperCase() + s.slice(1)
   }

   const headerLabel = computed(() => {
     if (activeView.value === 'month') {
       const d = new Date(viewYear.value, viewMonth.value, 1)
       return capitalizeFirst(d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }))
     }
     if (activeView.value === 'week') {
       const start = viewWeekStart.value
       const end = new Date(start)
       end.setDate(end.getDate() + 6)
       const sStr = capitalizeFirst(start.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }))
       const eStr = end.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
       return `${sStr} — ${eStr}`
     }
     return capitalizeFirst(viewDayDate.value.toLocaleDateString('pt-BR', {
       weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
     }))
   })
   ```
   No branch `week`, só a primeira data (`sStr`) precisa de maiúscula inicial — `eStr` fica no meio da frase ("24 ago — 30 ago de 2026") e deve permanecer em minúsculas.
3. **Nota de consistência (fora do escopo estrito do pedido, mas mesmo bug repetido):** o mesmo padrão `capitalize` + string em minúsculas do `toLocaleDateString` aparece em outros componentes de Agenda/Diário: `app/components/appointments/AgendaView.vue:132`, `app/components/appointments/ScheduleMonthPicker.vue:108`, `app/components/appointments/QuickCreatePopover.vue:129`, `app/components/journal/CalendarView.vue:148`, `app/components/journal/PeriodicNotesView.vue:68` e `:139`. Se a ideia for consistência visual no produto todo, vale extrair `capitalizeFirst` para um util compartilhado (ex.: `app/utils/date.ts`) e aplicar o mesmo fix nesses pontos — mas isso é um item à parte, não necessário para resolver o que foi pedido (o título da Agenda).

---

## 3. Ícone do botão "+" (novo evento) centralizado

**Problema:** o ícone "+" não fica centralizado dentro do botão quadrado.

**Estado atual:** `app/pages/app/appointments.vue:518-526`:
```vue
<UTooltip text="Novo evento">
  <UButton
    square
    @click="eventCreateOpen = true; eventCreatePrefill = null"
  >
    <UIcon name="i-lucide-plus" class="size-5 shrink-0" />
  </UButton>
</UTooltip>
```
O ícone é passado manualmente pelo slot padrão do `UButton`, em vez da prop `icon`. Comparando com os botões de seta (linhas 454-465), que usam `icon="i-lucide-chevron-left"` como prop e ficam corretamente centralizados: o Nuxt UI aplica o padding/alinhamento de "botão ícone" automaticamente quando o ícone vem pela prop `icon`; quando o conteúdo vem por slot manual, esse tratamento não é aplicado da mesma forma, e o desalinhamento fica mais visível ainda por causa da regra de `app/assets/css/main.css:137-144`, que força caixa mínima de 40×40px em botões quadrados no mobile:
```css
@media (max-width: 768px) {
  button[data-square],
  button:has(> svg:only-child) {
    min-height: 40px;
    min-width: 40px;
  }
}
```

**Implementação:**

```vue
<UTooltip text="Novo evento">
  <UButton
    square
    icon="i-lucide-plus"
    @click="eventCreateOpen = true; eventCreatePrefill = null"
  />
</UTooltip>
```
Trocar o slot manual `<UIcon name="i-lucide-plus" ... />` pela prop `icon`, removendo o `<UIcon>` interno.

**Nota de consistência:** os outros dois botões quadrados do mesmo header — o seletor de modo de visualização (linhas 480-488) e o toggle de calendários (linhas 503-513) — têm exatamente o mesmo padrão de slot manual e sofrem do mesmo problema de centralização. O pedido do usuário foi específico ao botão de "+", mas se o objetivo for consistência visual em todo o header, vale aplicar a mesma troca (`icon` como prop) nesses dois também.

Validar visualmente em viewport < 768px, que é onde a regra de 40×40px do `main.css` entra em ação.

---

## 4. Formatação de hora `00:00` (24h, com zero à esquerda)

**Problema:** os rótulos de hora na grade lateral (ex.: "9 AM", "10 AM") usam formato 12h com AM/PM; o esperado é formato 24h tipo `"09:00"`, `"14:00"`.

**Estado atual:** `app/composables/useCalendarLayout.ts:99-104`:
```ts
export function formatHourLabel(hour: number): string {
  if (hour === 0) return ''
  const suffix = hour < 12 ? 'AM' : 'PM'
  const h = hour % 12 === 0 ? 12 : hour % 12
  return `${h} ${suffix}`
}
```
Usada em `app/components/appointments/DayView.vue` (import na linha 8, renderizado na linha 310) e `app/components/appointments/WeekView.vue` (import na linha 8, renderizado na linha 401).

**Não precisa mexer:** os rótulos de horário dos próprios eventos (ex.: "08:00" no card do evento, em `DayView.vue:342,344`, `WeekView.vue:451`, `AgendaView.vue:64-71`, `EventPopover.vue:59-69`, `EventDetailSlideover.vue:308,313-314`, `MonthView.vue:101-102`) já usam `toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })`, que no locale `pt-BR` já retorna 24h com zero à esquerda por padrão. O único ponto realmente fora do formato 24h é `formatHourLabel`.

**Implementação:**
```ts
export function formatHourLabel(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00`
}
```

**Decisão a tomar — hora 0 (meia-noite):** hoje `formatHourLabel(0)` retorna string vazia (linha 100 atual), provavelmente para não poluir visualmente o topo da grade (o segundo print de referência mostra "1 AM" como primeira linha visível, não "12 AM"). Recomendação: manter esse comportamento — preservar `if (hour === 0) return ''` — e aplicar o novo formato só a partir de `hour >= 1`, resultando em `"01:00"`, `"02:00"`, ..., `"23:00"`. Se a intenção for mostrar `"00:00"` também na primeira linha, é só remover o early return.

Nenhuma mudança necessária em `DayView.vue`/`WeekView.vue` — eles só consomem a função, o resultado muda automaticamente.

---

## 5. Paridade de navegação em `/app/scheduling`

**Problema:** ao entrar em `/app/scheduling` no mobile, a barra inferior mostra a navegação global (Início/Hábitos/Tarefas/Diário/Mais) em vez de continuar mostrando as abas contextuais da Agenda (Dia/Semana/Mês/Link do 4º print) — quebra a sensação de estar "dentro" da área de Agenda ao ir para a tela de Agendamento.

**Causa raiz:** `app/pages/app/scheduling.vue:54-62` nunca chama `useMobileContextNav().registerMobileContextNav(...)`:
```vue
<UDashboardPanel id="scheduling">
  <template #header>
    <UDashboardNavbar title="Agendamento">
      <template #right>
        <UButton icon="i-lucide-plus" label="Nova página" @click="onCreate" />
      </template>
    </UDashboardNavbar>
  </template>
```
Compare com `appointments.vue`, que registra as abas de view em `appointments.vue:50-56`:
```ts
const viewModes: { label: string, value: CalendarViewMode, icon: string }[] = [
  { label: 'Dia', value: 'day', icon: 'i-lucide-square' },
  { label: 'Semana', value: 'week', icon: 'i-lucide-columns-3' },
  { label: 'Mês', value: 'month', icon: 'i-lucide-grid-3x3' }
]
useMobileContextNav().registerMobileContextNav('appointments', viewModes, activeView)
```
O estado das abas contextuais é global por página (`useState('mobile-context-nav', ...)` em `app/composables/useMobileContextNav.ts:16`) e é **limpo automaticamente ao desmontar a página que o registrou** (`onBeforeUnmount(() => clearMobileContextNav(owner))`, `useMobileContextNav.ts:63-65`). Então, ao navegar de `/app/appointments` para `/app/scheduling`, o registro da Agenda é limpo e nada o substitui — `MobileBottomNav.vue` cai no fallback global (`v-else key="global"`, `MobileBottomNav.vue:139`).

**Nota sobre o print de referência:** o mockup mostra uma 4ª aba **"Link"** na barra da Agenda (Dia/Semana/Mês/Link), mas hoje o array `viewModes` só tem 3 itens — não existe uma aba "Link" no código atual. A implementação completa deste ponto tem duas partes: (a) adicionar a aba "Link" à Agenda e (b) fazer `/app/scheduling` registrar as mesmas abas contextuais (com "Link" ativo), permitindo alternar entre Agenda e Agendamento pela própria barra inferior.

**Implementação:**

1. Estender `MobileContextNavItem` (`app/composables/useMobileContextNav.ts:3-7`) com um campo opcional de navegação:
   ```ts
   export interface MobileContextNavItem {
     value: string
     label: string
     icon: string
     to?: string // se presente, o clique navega em vez de trocar o "active"
   }
   ```
2. Em `app/components/MobileBottomNav.vue`, trocar o handler de clique do botão contextual (hoje `@click="selectMobileContextNav(item.value)"`, linha 132) para checar `item.to`:
   ```ts
   function handleContextClick(item: MobileContextNavItem) {
     if (item.to) {
       router.push(item.to)
       return
     }
     selectMobileContextNav(item.value)
   }
   ```
   e trocar o `@click` do botão na linha 132 para `@click="handleContextClick(item)"`. `router` já existe no componente (`const router = useRouter()`, linha 5).
3. Em `appointments.vue`, adicionar a 4ª entrada só na hora de registrar (não no array tipado `viewModes`, já que `activeView` é tipado como `CalendarViewMode = 'day' | 'week' | 'month'` e "Link" não é um modo de view — ele navega):
   ```ts
   const mobileNavItems: MobileContextNavItem[] = [
     ...viewModes,
     { value: 'scheduling-link', label: 'Link', icon: 'i-lucide-calendar-clock', to: '/app/scheduling' }
   ]
   useMobileContextNav().registerMobileContextNav('appointments', mobileNavItems, activeView)
   ```
   Isso funciona porque um item com `to` nunca é passado para `selectMobileContextNav` (o handler dá `return` antes) — não precisa satisfazer o tipo `CalendarViewMode`.
4. Em `scheduling.vue`, registrar o mesmo conjunto de abas, com "Link" marcado como ativo e Dia/Semana/Mês navegando de volta para `/app/appointments`:
   ```ts
   useMobileContextNav().registerMobileContextNav('scheduling', [
     { value: 'day', label: 'Dia', icon: 'i-lucide-square', to: '/app/appointments?view=day' },
     { value: 'week', label: 'Semana', icon: 'i-lucide-columns-3', to: '/app/appointments?view=week' },
     { value: 'month', label: 'Mês', icon: 'i-lucide-grid-3x3', to: '/app/appointments?view=month' },
     { value: 'scheduling-link', label: 'Link', icon: 'i-lucide-calendar-clock' }
   ], ref('scheduling-link'))
   ```
   Isso exige que `appointments.vue` leia um query param `view` opcional ao montar e ajuste `activeView` (hoje só lê de `localStorage`, linhas 41-42):
   ```ts
   const route = useRoute()
   onMounted(() => {
     const q = route.query.view
     if (typeof q === 'string' && ['day', 'week', 'month'].includes(q)) {
       activeView.value = q as CalendarViewMode
     }
   })
   ```

**Alternativa de menor escopo:** se a 4ª aba "Link" não for prioridade agora, o mínimo para resolver a reclamação (barra inferior "some" ao entrar em Agendamento) é só o passo 4 acima com as 3 abas de view (Dia/Semana/Mês) apontando de volta para `/app/appointments`, sem a aba "Link" — já que estar em `/app/scheduling` faz da própria página o "Link" atual. Recomenda-se decidir com o design antes de implementar a variante completa de 4 abas, já que ela introduz um conceito novo (aba que navega em vez de trocar estado) no composable de navegação contextual.

---

## 6. Chips do menu inferior preenchendo o espaço disponível

**Problema:** os chips do menu contextual inferior (Dia/Semana/Mês/Link) não preenchem toda a largura da barra — ficam com espaçamento irregular, diferente de elementos como as colunas de dia no `WeekView`, que já dividem o espaço igualmente entre si.

**Estado atual:** `app/components/MobileBottomNav.vue:106-137`:
```vue
<nav class="px-2 py-1.5">
  ...
  <motion.div
    v-if="hasContextItems"
    class="mobile-context-nav flex items-center justify-around overflow-x-auto"
  >
    <motion.button
      v-for="(item, index) in contextItems"
      ...
      class="flex min-h-14 min-w-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-center transition-colors"
      @click="selectMobileContextNav(item.value)"
    >
```
O container usa `justify-around` (distribui o espaço sobrando *entre* os itens, mas cada item mantém sua largura mínima de conteúdo, `min-w-[4.25rem]`) — diferente do comportamento "cada um ocupa fração igual da largura total", que é o que o `WeekView` já faz para as colunas de dia (`app/components/appointments/WeekView.vue:375`): `class="min-h-6 flex-1 border-l border-default/20 p-0.5"`, usando `flex-1` em vez de largura mínima fixa.

**Implementação:**

1. No container (`MobileBottomNav.vue:111`), remover `justify-around` (deixa de ser necessário se os filhos crescem para preencher o espaço):
   ```vue
   class="mobile-context-nav flex items-center overflow-x-auto"
   ```
2. Em cada botão (linha 121), trocar `min-w-[4.25rem]` por `flex-1` (usar `flex-1 basis-0` para garantir divisão igual independente do conteúdo interno de cada botão):
   ```vue
   class="flex min-h-14 flex-1 basis-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 text-center transition-colors"
   ```
   Isso faz com que, com 3 itens (Dia/Semana/Mês) ou 4 (se a aba "Link" do item 5 for adicionada), cada chip ocupe uma fração igual de 100% da largura da barra — mesmo padrão do `WeekView.vue:375`.
3. O `overflow-x-auto` do container pode ser mantido como salvaguarda (caso o número de itens contextuais cresça no futuro além do que cabe confortavelmente na tela), mesmo que com `flex-1` os itens sempre caibam e não ultrapassem a largura disponível.
4. Testar com 3 e com 4 itens em telas estreitas (~320px) para garantir que o rótulo (`text-[10px]`, com `truncate` já aplicado no `<span>` da linha 135) não quebra de forma feia.

---

## 7. Botão "ir para hoje" com ícone centralizado no mobile

**Problema:** falta um botão para voltar ao dia de hoje, visível e com ícone centralizado, no mobile.

**Estado atual:** `app/pages/app/appointments.vue:447-453`:
```vue
<UButton
  label="Hoje"
  variant="outline"
  size="sm"
  class="hidden sm:flex"
  @click="goToday"
/>
```
O botão "Hoje" existe e a função `goToday()` já funciona (`appointments.vue:131-137`, reseta ano/mês/semana/dia para a data atual) — mas o botão é só texto (sem ícone) e tem `class="hidden sm:flex"`, ou seja, **fica oculto abaixo de 640px**, exatamente a faixa de tela de celular. Não existe hoje nenhum ícone ou botão substituto visível abaixo de 640px — no celular, não há como voltar para "hoje" pela Agenda.

**Implementação:**

Adicionar uma segunda instância do botão, ícone-only, visível só abaixo de `sm` (oposto da instância atual), usando a prop `icon` (não slot manual) para já nascer centralizado — mesma correção do item 3:
```vue
<UTooltip text="Hoje">
  <UButton
    icon="i-lucide-calendar-1"
    variant="outline"
    size="sm"
    square
    class="flex sm:hidden"
    @click="goToday"
  />
</UTooltip>
<UButton
  label="Hoje"
  variant="outline"
  size="sm"
  class="hidden sm:flex"
  @click="goToday"
/>
```
- Ícone sugerido: `i-lucide-calendar-1` (calendário marcando "hoje"); alternativa: `i-lucide-rotate-ccw` (ação de "resetar para hoje") — a decidir visualmente com o design.
- Não dá para resolver com uma única instância do `UButton` (`icon` + `label` juntos) porque o Nuxt UI não tem uma prop nativa para "esconder o label abaixo de um breakpoint" — daí a necessidade das duas instâncias condicionadas por classe, como já é feito hoje com o botão de texto.
- Validar centralização do ícone em viewport < 768px, considerando a regra de caixa mínima 40×40px do `main.css:137-144` (mesmo cuidado do item 3).

---

## Observação geral sobre testes

Não há build local usado para validar essas mudanças neste projeto — validar visualmente em viewport mobile (DevTools ou dispositivo real) em cada item, especialmente os breakpoints `sm` (640px) e `lg` (1024px) citados acima, e os logs do Vercel após o deploy.
