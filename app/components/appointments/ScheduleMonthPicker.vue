<script setup lang="ts">
import { formatDisplay, getZonedDateParts, todayInZone } from "#shared/utils/dateTime";

const props = defineProps<{
  modelValue: string | null;
  availableDates: Set<string>;
  loading?: boolean;
  embedded?: boolean;
  // "Hoje"/"passado" e o mês inicial precisam ser calculados no fuso do
  // convidado (livremente escolhido no dropdown da página pública, não
  // necessariamente o fuso real do navegador) — do contrário este grid e o
  // `availableDates` do pai (calculado em guestTimezone) falam "linguagens"
  // de fuso diferentes perto de virada de dia/mês. Ver AUDITORIA_TIMEZONE_
  // CAPA_AGENDAMENTO.md §1.3, achado 3.
  timeZone: string;
}>();

const emit = defineEmits<{
  "update:modelValue": [date: string];
  "month-change": [year: number, month: number];
}>();

const initialParts = getZonedDateParts(new Date(), props.timeZone);
const viewYear = ref(initialParts.year);
const viewMonth = ref(initialParts.month - 1);

const dayHeaders = ["SEG.", "TER.", "QUA.", "QUI.", "SEX.", "SÁB.", "DOM."];

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

const todayStr = computed(() => todayInZone(props.timeZone));

interface DayCell {
  dateStr: string;
  day: number;
  isCurrentMonth: boolean;
  isPast: boolean;
  hasAvailability: boolean;
}

const grid = computed((): DayCell[][] => {
  const first = new Date(viewYear.value, viewMonth.value, 1);
  const last = new Date(viewYear.value, viewMonth.value + 1, 0);
  const startDay = (first.getDay() + 6) % 7;

  const weeks: DayCell[][] = [];
  const cursor = new Date(first);
  cursor.setDate(cursor.getDate() - startDay);

  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const dateStr = formatDate(cursor);
      week.push({
        dateStr,
        day: cursor.getDate(),
        isCurrentMonth: cursor.getMonth() === viewMonth.value,
        isPast: dateStr < todayStr.value,
        hasAvailability: props.availableDates.has(dateStr),
      });
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
    if (cursor > last && cursor.getDay() === 1) break;
  }

  return weeks;
});

const monthLabel = computed(() =>
  formatDisplay(new Date(viewYear.value, viewMonth.value, 1), "MMMM yyyy"),
);
const canGoPrev = computed(() => {
  const today = todayStr.value.slice(0, 7);
  return `${viewYear.value}-${String(viewMonth.value + 1).padStart(2, '0')}` > today;
});

function emitMonthChange() {
  emit("month-change", viewYear.value, viewMonth.value);
}

function goPrevMonth() {
  if (!canGoPrev.value) return;
  if (viewMonth.value === 0) {
    viewMonth.value = 11;
    viewYear.value -= 1;
  } else {
    viewMonth.value -= 1;
  }
  emitMonthChange();
}

function goNextMonth() {
  if (viewMonth.value === 11) {
    viewMonth.value = 0;
    viewYear.value += 1;
  } else {
    viewMonth.value += 1;
  }
  emitMonthChange();
}

function selectDay(cell: DayCell) {
  if (cell.isPast || !cell.hasAvailability) return;
  emit("update:modelValue", cell.dateStr);
}

onMounted(() => emitMonthChange());

defineExpose({ goNextMonth });
</script>

<template>
  <div :class="embedded ? 'scheduling-calendar' : 'scheduling-calendar rounded-xl border border-default p-3'">
    <div
      class="mb-5 flex min-h-8 items-center justify-between gap-2"
    >
      <span class="text-base font-medium text-highlighted">{{ monthLabel }}</span>
      <div class="flex items-center gap-1">
      <UButton
        icon="i-lucide-chevron-left"
        aria-label="Mês anterior"
        size="xs"
        color="neutral"
        variant="ghost"
        :disabled="!canGoPrev"
        @click="goPrevMonth"
      />
      <UButton
        icon="i-lucide-chevron-right"
        aria-label="Próximo mês"
        size="xs"
        color="neutral"
        variant="ghost"
        @click="goNextMonth"
      />
      </div>
    </div>

    <div class="grid grid-cols-7 gap-1">
      <div
        v-for="(h, i) in dayHeaders"
        :key="i"
        class="pb-3 text-center text-[10px] font-medium tracking-wide text-toned"
      >
        {{ h }}
      </div>

      <template v-for="(week, wi) in grid" :key="wi">
        <button
          v-for="cell in week"
          :key="cell.dateStr"
          type="button"
          class="calendar-day relative aspect-square rounded-lg text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          :class="{
            'calendar-day--available': cell.hasAvailability && !cell.isPast,
            'calendar-day--selected': modelValue === cell.dateStr,
            'calendar-day--outside': !cell.isCurrentMonth,
          }"
          :disabled="loading || cell.isPast || !cell.hasAvailability"
          :aria-label="cell.dateStr"
          :aria-pressed="modelValue === cell.dateStr"
          @click="selectDay(cell)"
        >
          {{ cell.day }}
          <span v-if="cell.dateStr === todayStr" class="absolute bottom-1.5 left-1/2 size-1 -translate-x-1/2 rounded-full bg-current" aria-label="Hoje" />
        </button>
      </template>
    </div>

    <div
      v-if="loading"
      class="border-t border-default px-3 py-2 text-center text-xs text-muted"
    >
      Carregando disponibilidade...
    </div>
  </div>
</template>

<style scoped>
.calendar-day { color: var(--ui-text-muted); }
.calendar-day:disabled { cursor: default; }
.calendar-day--outside { opacity: 0.35; }
.calendar-day--available { background: #e5e7eb; color: #18181b; font-weight: 500; cursor: pointer; }
.calendar-day--available:hover { background: #d4d4d8; }
.calendar-day--selected, .calendar-day--selected:hover { background: #292929; color: #fff; }
:global(.dark) .calendar-day--available { background: #27272a; color: #fafafa; }
:global(.dark) .calendar-day--available:hover { background: #3f3f46; }
:global(.dark) .calendar-day--selected, :global(.dark) .calendar-day--selected:hover { background: #fafafa; color: #18181b; }
</style>
