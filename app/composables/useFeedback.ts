import type {
  Feedback,
  FeedbackListResponse,
  FeedbackResponse,
  CreateFeedbackPayload,
  CreateFeedbackResponsePayload
} from '~/types/feedback'

export function useFeedback() {
  const toast = useToast()

  // ─── User: List own feedbacks ─────────────────────────
  const listPage = ref(1)
  const listPageSize = ref(20)
  const listType = ref('')
  const listStatus = ref('')
  const listSearch = ref('')

  const debouncedListSearch = refDebounced(listSearch, 400)

  watch([listType, listStatus, debouncedListSearch], () => {
    if (listPage.value !== 1) listPage.value = 1
  })

  const listParams = computed(() => {
    const p: Record<string, string | number> = {
      page: listPage.value,
      pageSize: listPageSize.value
    }
    if (listType.value) p.type = listType.value
    if (listStatus.value) p.status = listStatus.value
    if (debouncedListSearch.value) p.search = debouncedListSearch.value
    return p
  })

  const {
    data: listData,
    status: listFetchStatus,
    error: listError,
    refresh: refreshList
  } = useFetch<FeedbackListResponse>('/api/feedback', {
    params: listParams,
    lazy: true,
    server: false,
    watch: [listPage, listPageSize, listType, listStatus, debouncedListSearch]
  })

  // ─── User: Create feedback ───────────────────────────
  async function createFeedback(payload: CreateFeedbackPayload, files: File[] = []) {
    try {
      const body = new FormData()
      body.append('payload', JSON.stringify(payload))
      for (const file of files) body.append('files', file)
      const result = await $fetch<Feedback>('/api/feedback', { method: 'POST', body })
      toast.add({ title: 'Feedback enviado', description: 'Obrigado pelo seu feedback!', color: 'success' })
      await refreshList()
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  // ─── User: Get feedback detail ─────────────────────────
  async function fetchFeedback(id: string) {
    try {
      return await $fetch<Feedback>(`/api/feedback/${id}`)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  // ─── User: Delete feedback ────────────────────────────
  async function deleteFeedback(id: string) {
    try {
      const endpoint: string = `/api/feedback/${id}`
      await $fetch(endpoint, { method: 'DELETE' })
      toast.add({ title: 'Feedback excluído', description: 'Feedback removido com sucesso.', color: 'success' })
      await refreshList()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  // ─── User: Add response ──────────────────────────────
  async function addResponse(feedbackId: string, payload: CreateFeedbackResponsePayload) {
    try {
      const result = await $fetch<FeedbackResponse>(`/api/feedback/${feedbackId}/responses`, { method: 'POST', body: payload })
      toast.add({ title: 'Resposta adicionada', description: 'Sua resposta foi enviada.', color: 'success' })
      return result
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.add({ title: 'Erro', description: msg, color: 'error' })
      throw err
    }
  }

  return {
    // User
    listData,
    listFetchStatus,
    listError,
    listPage,
    listPageSize,
    listType,
    listStatus,
    listSearch,
    refreshList,
    createFeedback,
    fetchFeedback,
    deleteFeedback,
    addResponse,
  }
}
