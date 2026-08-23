import type { PeriodicNoteResponse, UpsertPeriodicNotePayload } from '~/types/journal'
import { periodKeyFor, periodRangeFor, shiftPeriodKey, type PeriodType } from '~/utils/journal-periods'

// Baixa frequência de uso (não é o "loop diário" como useJournal.ts) — sem
// store otimista, só fetch direto e um toast em erro, mesmo espírito de
// useJournalLock.ts.
export function useJournalPeriods() {
  const toast = useToast()

  const periodType = ref<PeriodType>('week')
  const periodKey = ref(periodKeyFor('week', new Date()))
  const loading = ref(false)
  const saving = ref(false)
  const data = ref<PeriodicNoteResponse | null>(null)

  const periodRange = computed(() => periodRangeFor(periodType.value, periodKey.value))

  async function load() {
    loading.value = true
    try {
      const { start, end } = periodRange.value
      data.value = await $fetch<PeriodicNoteResponse>(
        `/api/journal/periods/${periodType.value}/${periodKey.value}`,
        { query: { start, end } }
      )
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível carregar o período.', color: 'error' })
      data.value = null
    } finally {
      loading.value = false
    }
  }

  async function save(content: string, title?: string | null): Promise<boolean> {
    saving.value = true
    try {
      const { start, end } = periodRange.value
      const payload: UpsertPeriodicNotePayload = {
        periodType: periodType.value,
        periodKey: periodKey.value,
        periodStart: start,
        periodEnd: end,
        title: title ?? null,
        content
      }
      const note = await $fetch(`/api/journal/periods/${periodType.value}/${periodKey.value}`, {
        method: 'POST',
        body: payload
      })
      if (data.value) data.value = { ...data.value, note }
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar a nota do período.', color: 'error' })
      return false
    } finally {
      saving.value = false
    }
  }

  function setType(type: PeriodType) {
    periodType.value = type
    periodKey.value = periodKeyFor(type, new Date())
  }

  function shift(delta: number) {
    periodKey.value = shiftPeriodKey(periodType.value, periodKey.value, delta)
  }

  function goToToday() {
    periodKey.value = periodKeyFor(periodType.value, new Date())
  }

  watch([periodType, periodKey], () => { load() }, { immediate: true })

  return {
    periodType,
    periodKey,
    periodRange,
    loading,
    saving,
    data,
    setType,
    shift,
    goToToday,
    save
  }
}
