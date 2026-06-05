import { useDebounceFn } from '@vueuse/core'
import type {
  CreateNotePayload,
  CreateTagPayload,
  GraphData,
  KnowledgeNote,
  KnowledgeTag,
  LinkNotesPayload,
  NoteDetail,
  NoteListResponse,
  NoteSearchResult,
  UpdateNotePayload,
  UpdateTagPayload
} from '~/types/knowledge'
import { NoteType, NOTE_TYPE_META } from '~/types/knowledge'

export function useKnowledge() {
  const toast = useToast()

  // ─── Notes list (paginated) ─────────────────────────────────────────────────
  const notesPage = ref(1)
  const notesPageSize = ref(20)
  const notesSearch = ref('')
  const notesType = ref<string>('')
  const notesTagId = ref<string>('')
  const notesPinned = ref<string>('')
  const page = notesPage
  const pageSize = notesPageSize
  const filters = reactive({
    type: notesType.value,
    tagId: notesTagId.value,
    pinned: notesPinned.value
  })

  const {
    data: notesData,
    status: notesStatus,
    refresh: refreshNotes
  } = useFetch<NoteListResponse>('/api/knowledge/notes', {
    query: computed(() => ({
      page: notesPage.value,
      pageSize: notesPageSize.value,
      search: notesSearch.value || undefined,
      type: notesType.value || undefined,
      tagId: notesTagId.value || undefined,
      pinned: notesPinned.value || undefined
    })),
    lazy: true,
    key: 'knowledge-notes',
    watch: [notesPage, notesPageSize, notesType, notesTagId, notesPinned]
  })

  const debouncedRefreshNotes = useDebounceFn(() => {
    refreshNotes()
  }, 300)

  watch(notesSearch, () => {
    notesPage.value = 1
    debouncedRefreshNotes()
  })

  watch(() => filters.type, (value: string) => {
    notesType.value = value
    notesPage.value = 1
  })

  watch(() => filters.tagId, (value: string) => {
    notesTagId.value = value
    notesPage.value = 1
  })

  watch(() => filters.pinned, (value: string) => {
    notesPinned.value = value
    notesPage.value = 1
  })

  // ─── Tags ───────────────────────────────────────────────────────────────────
  const {
    data: tags,
    status: tagsStatus,
    refresh: refreshTags
  } = useFetch<KnowledgeTag[]>('/api/knowledge/tags', {
    lazy: true,
    key: 'knowledge-tags'
  })

  // ─── Graph ──────────────────────────────────────────────────────────────────
  const {
    data: graphData,
    status: graphStatus,
    refresh: refreshGraph
  } = useFetch<GraphData>('/api/knowledge/graph', {
    lazy: true,
    key: 'knowledge-graph'
  })

  // ─── Search ─────────────────────────────────────────────────────────────────
  const searchQuery = ref('')
  const searchResults = ref<NoteSearchResult[]>([])
  const searching = ref(false)

  const debouncedSearch = useDebounceFn(async () => {
    if (!searchQuery.value.trim()) {
      searchResults.value = []
      return
    }
    searching.value = true
    try {
      searchResults.value = await $fetch<NoteSearchResult[]>('/api/knowledge/notes/search', {
        query: { q: searchQuery.value }
      })
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)

  watch(searchQuery, () => {
    debouncedSearch()
  })

  // ─── Note CRUD ──────────────────────────────────────────────────────────────

  async function createNote(payload: CreateNotePayload): Promise<KnowledgeNote | null> {
    try {
      const note = await $fetch<KnowledgeNote>('/api/knowledge/notes', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Nota criada', description: `"${note.title}" foi criada com sucesso.`, color: 'success' })
      await refreshNotes()
      await refreshGraph()
      return note
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao criar nota.', color: 'error' })
      return null
    }
  }

  async function updateNote(id: string, payload: UpdateNotePayload, options?: { silent?: boolean }): Promise<KnowledgeNote | null> {
    try {
      const note = await $fetch<KnowledgeNote>(`/api/knowledge/notes/${id}`, {
        method: 'PUT',
        body: payload
      })
      if (!options?.silent) {
        toast.add({ title: 'Nota atualizada', description: 'Alterações salvas.', color: 'success' })
        await refreshNotes()
      }
      return note
    } catch {
      if (!options?.silent) {
        toast.add({ title: 'Erro', description: 'Falha ao atualizar nota.', color: 'error' })
      }
      return null
    }
  }

  async function deleteNote(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/knowledge/notes/${id}`, { method: 'DELETE' })
      toast.add({ title: 'Nota excluída', description: 'A nota foi removida.', color: 'success' })
      await refreshNotes()
      await refreshGraph()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao excluir nota.', color: 'error' })
      return false
    }
  }

  async function fetchNoteDetail(id: string): Promise<NoteDetail | null> {
    try {
      return await $fetch<NoteDetail>(`/api/knowledge/notes/${id}`)
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao carregar nota.', color: 'error' })
      return null
    }
  }

  async function togglePin(note: KnowledgeNote): Promise<boolean> {
    try {
      await $fetch(`/api/knowledge/notes/${note.id}`, {
        method: 'PUT',
        body: { pinned: !note.pinned }
      })
      toast.add({
        title: note.pinned ? 'Nota desafixada' : 'Nota fixada',
        color: 'success'
      })
      await refreshNotes()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao alterar fixação.', color: 'error' })
      return false
    }
  }

  // ─── Links ──────────────────────────────────────────────────────────────────

  async function linkNotes(sourceId: string, payload: LinkNotesPayload): Promise<boolean> {
    try {
      await $fetch(`/api/knowledge/notes/${sourceId}/link`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Vínculo criado', description: 'As notas foram vinculadas.', color: 'success' })
      await refreshGraph()
      return true
    } catch (err: unknown) {
      const message = (err as { data?: { message?: string } })?.data?.message ?? 'Falha ao vincular notas.'
      toast.add({ title: 'Erro', description: message, color: 'error' })
      return false
    }
  }

  async function unlinkNotes(linkId: string): Promise<boolean> {
    try {
      await $fetch(`/api/knowledge/links/${linkId}`, { method: 'DELETE' })
      toast.add({ title: 'Vínculo removido', color: 'success' })
      await refreshGraph()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao remover vínculo.', color: 'error' })
      return false
    }
  }

  // ─── Tags CRUD ──────────────────────────────────────────────────────────────

  async function createTag(payload: CreateTagPayload): Promise<KnowledgeTag | null> {
    try {
      const tag = await $fetch<KnowledgeTag>('/api/knowledge/tags', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Tag criada', description: `"${tag.name}" criada.`, color: 'success' })
      await refreshTags()
      return tag
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao criar tag.', color: 'error' })
      return null
    }
  }

  async function updateTag(id: string, payload: UpdateTagPayload): Promise<KnowledgeTag | null> {
    try {
      const tag = await $fetch<KnowledgeTag>(`/api/knowledge/tags/${id}`, {
        method: 'PUT',
        body: payload
      })
      toast.add({ title: 'Tag atualizada', color: 'success' })
      await refreshTags()
      return tag
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao atualizar tag.', color: 'error' })
      return null
    }
  }

  async function deleteTag(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/knowledge/tags/${id}`, { method: 'DELETE' })
      toast.add({ title: 'Tag excluída', color: 'success' })
      await refreshTags()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Falha ao excluir tag.', color: 'error' })
      return false
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const noteTypeOptions = Object.entries(NOTE_TYPE_META).map(([value, meta]) => ({
    label: meta.label,
    value
  }))

  function getNoteMeta(type: NoteType) {
    return NOTE_TYPE_META[type] ?? NOTE_TYPE_META[NoteType.Note]
  }

  // ─── Return ─────────────────────────────────────────────────────────────────

  return {
    // Notes list
    notesData,
    notesStatus,
    page,
    pageSize,
    filters,
    notesPage,
    notesPageSize,
    notesSearch,
    notesType,
    notesTagId,
    notesPinned,
    refreshNotes,

    // Tags
    tags,
    tagsStatus,
    refreshTags,

    // Graph
    graphData,
    graphStatus,
    refreshGraph,

    // Search
    searchQuery,
    searchResults,
    searching,

    // Note CRUD
    createNote,
    updateNote,
    deleteNote,
    fetchNoteDetail,
    togglePin,

    // Links
    linkNotes,
    unlinkNotes,

    // Tags CRUD
    createTag,
    updateTag,
    deleteTag,

    // Helpers
    noteTypeOptions,
    getNoteMeta,
    NoteType
  }
}
