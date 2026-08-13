import { useDebounceFn } from '@vueuse/core'
import type {
  CreateNotePayload,
  CreateNoteSharePayload,
  CreateTagPayload,
  GraphData,
  Note,
  NoteShare,
  NoteTag,
  NoteFolder,
  CreateFolderPayload,
  UpdateFolderPayload,
  LinkNotesPayload,
  NoteDetail,
  NoteListResponse,
  NoteSearchResult,
  SharedNote,
  TrashItem,
  UpdateNotePayload,
  UpdateNoteSharePayload,
  UpdateTagPayload
} from '~/types/notes'
import { MAX_FOLDER_DEPTH, NoteType, NoteVisibility, NOTE_TYPE_META } from '~/types/notes'

export function useNotes() {
  const toast = useToast()
  const { runOptimisticAction } = useOptimisticAction()
  const { loadCachedNotes, saveCachedNotes, loadCachedFolders, saveCachedFolders } = useOfflineCache()

  // ─── Local reactive store ───────────────────────────────────────────────────
  // Single source of truth for the UI. Fetch results are merged (upserted) into
  // these maps instead of replacing them wholesale, so mutations applied here
  // (optimistic or reconciled) show up instantly, and a background refetch never
  // flashes the list back to empty/loading.
  const notesById = reactive(new Map<string, Note>())
  const foldersById = reactive(new Map<string, NoteFolder>())
  const tagsById = reactive(new Map<string, NoteTag>())

  function upsertNote(note: Note) {
    notesById.set(note.id, { ...notesById.get(note.id), ...note })
  }
  function upsertFolder(folder: NoteFolder) {
    foldersById.set(folder.id, { ...foldersById.get(folder.id), ...folder })
  }
  function upsertTag(tag: NoteTag) {
    tagsById.set(tag.id, { ...tagsById.get(tag.id), ...tag })
  }

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
    data: notesFetchResult,
    status: notesStatus,
    error: notesFetchError,
    refresh: refreshNotes
  } = useFetch<NoteListResponse>('/api/notes', {
    query: computed(() => ({
      page: notesPage.value,
      pageSize: notesPageSize.value,
      search: notesSearch.value || undefined,
      type: notesType.value || undefined,
      tagId: notesTagId.value || undefined,
      pinned: notesPinned.value || undefined
    })),
    lazy: true,
    key: 'notes',
    watch: [notesPage, notesPageSize, notesType, notesTagId, notesPinned]
  })

  // The listing had no error handling at all before this — a failure here
  // (bad connection, server error) used to fail completely silently, with
  // nothing in the console and no feedback for the user.
  watch(notesFetchError, (err) => {
    if (!err) return
    console.error('[useNotes] failed to load notes list', err)
    toast.add({ title: 'Erro', description: 'Falha ao carregar as notas.', color: 'error' })
  })

  const paginatedNoteIds = ref<string[]>([])
  const notesLoadedOnce = ref(false)
  const lastKnownTotal = ref(0)
  const lastKnownPage = ref(1)
  const lastKnownPageSize = ref(notesPageSize.value)

  watch(notesFetchResult, (res) => {
    if (!res) return
    for (const n of res.data) upsertNote(n)
    paginatedNoteIds.value = res.data.map(n => n.id)
    lastKnownTotal.value = res.total
    lastKnownPage.value = res.page
    lastKnownPageSize.value = res.pageSize
    notesLoadedOnce.value = true
  }, { immediate: true })

  const paginatedNotes = computed(() =>
    paginatedNoteIds.value.map(id => notesById.get(id)).filter((n): n is Note => !!n)
  )

  const notesData = computed<NoteListResponse | null>(() => {
    if (!notesLoadedOnce.value) return null
    return {
      data: paginatedNotes.value,
      total: lastKnownTotal.value,
      page: lastKnownPage.value,
      pageSize: lastKnownPageSize.value
    }
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
    data: tagsFetchResult,
    status: tagsStatus,
    refresh: refreshTags
  } = useFetch<NoteTag[]>('/api/notes/tags', {
    lazy: true,
    key: 'notes-tags'
  })

  const tagIds = ref<string[]>([])
  const tagsLoadedOnce = ref(false)

  watch(tagsFetchResult, (list) => {
    if (!Array.isArray(list)) return
    for (const t of list) upsertTag(t)
    tagIds.value = list.map(t => t.id)
    tagsLoadedOnce.value = true
  }, { immediate: true })

  const tags = computed<NoteTag[] | null>(() =>
    tagsLoadedOnce.value ? tagIds.value.map(id => tagsById.get(id)).filter((t): t is NoteTag => !!t) : null
  )

  // ─── Graph ──────────────────────────────────────────────────────────────────
  const {
    data: graphData,
    status: graphStatus,
    refresh: refreshGraph
  } = useFetch<GraphData>('/api/notes/graph', {
    lazy: true,
    key: 'notes-graph'
  })

  // ─── Folders ────────────────────────────────────────────────────────────────
  const {
    data: foldersFetchResult,
    status: foldersStatus,
    refresh: refreshFolders
  } = useFetch<NoteFolder[]>('/api/notes/folders', {
    lazy: true,
    key: 'notes-folders'
  })

  const folderIds = ref<string[]>([])
  const foldersLoadedOnce = ref(false)

  watch(foldersFetchResult, (list) => {
    if (!Array.isArray(list)) return
    for (const f of list) upsertFolder(f)
    folderIds.value = list.map(f => f.id)
    foldersLoadedOnce.value = true
    void saveCachedFolders(list)
  }, { immediate: true })

  // Offline boot fallback — the live fetch above never resolved (no
  // connection), so hydrate the tree from the last-known IndexedDB snapshot
  // instead of leaving the sidebar empty.
  watch(foldersStatus, async (status) => {
    if (status !== 'error' || foldersLoadedOnce.value) return
    const cached = await loadCachedFolders()
    if (cached.length === 0) return
    for (const f of cached) upsertFolder(f)
    folderIds.value = cached.map(f => f.id)
    foldersLoadedOnce.value = true
  })

  const folders = computed<NoteFolder[] | null>(() =>
    foldersLoadedOnce.value ? folderIds.value.map(id => foldersById.get(id)).filter((f): f is NoteFolder => !!f) : null
  )

  // ─── Shared with me ─────────────────────────────────────────────────────────
  const {
    data: sharedWithMeFetchResult,
    status: sharedWithMeStatus,
    refresh: refreshSharedWithMe
  } = useFetch<SharedNote[]>('/api/notes/shared-with-me', {
    lazy: true,
    key: 'notes-shared-with-me'
  })

  const sharedWithMe = computed<SharedNote[] | null>(() => sharedWithMeFetchResult.value ?? null)

  // ─── All notes (used by the folder tree + editor wikilink suggestions) ──────
  // No `transform` option here — Nuxt's useFetch overload resolution for
  // transform's return type has proven unstable across versions, so the raw
  // response is fetched as-is and reshaped in a plain computed instead.
  const {
    data: allNotesRawResult,
    status: allNotesStatus,
    refresh: refreshAllNotes
  } = useFetch<NoteListResponse>('/api/notes', {
    query: computed(() => ({ page: 1, pageSize: 500 })),
    lazy: true,
    key: 'notes-all'
  })

  const allNotesFetchResult = computed(() => allNotesRawResult.value?.data ?? null)

  const allNoteIds = ref<string[]>([])
  const allNotesLoadedOnce = ref(false)

  watch(allNotesFetchResult, (list) => {
    if (!Array.isArray(list)) return
    for (const n of list) upsertNote(n)
    allNoteIds.value = list.map(n => n.id)
    allNotesLoadedOnce.value = true
    void saveCachedNotes(list)
  }, { immediate: true })

  // Offline boot fallback — see the matching folders watcher above.
  watch(allNotesStatus, async (status) => {
    if (status !== 'error' || allNotesLoadedOnce.value) return
    const cached = await loadCachedNotes()
    if (cached.length === 0) return
    for (const n of cached) upsertNote(n)
    allNoteIds.value = cached.map(n => n.id)
    allNotesLoadedOnce.value = true
  })

  const allNotes = computed<Note[] | null>(() =>
    allNotesLoadedOnce.value ? allNoteIds.value.map(id => notesById.get(id)).filter((n): n is Note => !!n) : null
  )

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
      searchResults.value = await $fetch<NoteSearchResult[]>('/api/notes/search', {
        query: { q: searchQuery.value }
      })
    } catch (err) {
      console.error('[useNotes] search failed', err)
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)

  watch(searchQuery, () => {
    debouncedSearch()
  })

  // ─── Note CRUD ──────────────────────────────────────────────────────────────

  async function createNote(payload: CreateNotePayload): Promise<Note | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const allPositions = Array.from(notesById.values()).map(n => n.position)
    const position = allPositions.length > 0 ? Math.min(...allPositions) - 1000 : 0

    const optimisticNote: Note = {
      id: tempId,
      userId: '',
      title: payload.title,
      content: payload.content ?? null,
      type: payload.type ?? NoteType.Note,
      pinned: false,
      pinnedAt: null,
      icon: payload.icon ?? null,
      position,
      folderId: payload.folderId ?? null,
      visibility: NoteVisibility.Private,
      shareToken: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      tags: [],
      linkCount: 0,
      backlinkCount: 0
    }

    const result = await runOptimisticAction({
      apply: () => {
        notesById.set(tempId, optimisticNote)
        allNoteIds.value = [tempId, ...allNoteIds.value]
        paginatedNoteIds.value = [tempId, ...paginatedNoteIds.value]
      },
      rollback: () => {
        notesById.delete(tempId)
        allNoteIds.value = allNoteIds.value.filter(id => id !== tempId)
        paginatedNoteIds.value = paginatedNoteIds.value.filter(id => id !== tempId)
      },
      request: () => $fetch<Note>('/api/notes', { method: 'POST', body: payload }),
      reconcile: (serverNote) => {
        notesById.delete(tempId)
        notesById.set(serverNote.id, serverNote)
        allNoteIds.value = allNoteIds.value.map(id => id === tempId ? serverNote.id : id)
        paginatedNoteIds.value = paginatedNoteIds.value.map(id => id === tempId ? serverNote.id : id)
      },
      errorMessage: 'Falha ao criar nota.',
      offline: {
        entity: 'note',
        action: 'create',
        method: 'POST',
        url: '/api/notes',
        body: payload,
        tempId,
        optimisticResult: optimisticNote
      }
    })

    if (result) {
      toast.add({ title: 'Nota criada', description: `"${result.title}" foi criada com sucesso.`, color: 'success' })
      refreshGraph()
      // Corrects the paginated view's `total` (and server ordering) in the background —
      // the optimistic apply() above already placed the note where the user expects it.
      refreshNotes()
    }
    return result
  }

  /** Creates a copy of a note (title, content, type, icon, tags, folder) — reuses the
   * optimistic createNote() above rather than introducing a separate code path. */
  async function duplicateNote(note: Note): Promise<Note | null> {
    // List rows don't carry `content` (only the detail endpoint does) — fetch it if missing.
    const detail = note.content != null ? note : await fetchNoteDetail(note.id)
    if (!detail) return null

    return createNote({
      title: `${detail.title} (cópia)`,
      content: detail.content ?? undefined,
      type: detail.type,
      icon: detail.icon,
      tagIds: detail.tags?.map(t => t.id),
      folderId: detail.folderId
    })
  }

  async function updateNote(id: string, payload: UpdateNotePayload, options?: { silent?: boolean }): Promise<Note | null> {
    const previous = notesById.get(id)
    if (!previous) return null

    const optimisticNote: Note = {
      ...previous,
      ...(payload.title !== undefined ? { title: payload.title } : {}),
      ...(payload.content !== undefined ? { content: payload.content } : {}),
      ...(payload.type !== undefined ? { type: payload.type } : {}),
      ...(payload.pinned !== undefined ? { pinned: payload.pinned, pinnedAt: payload.pinned ? new Date().toISOString() : null } : {}),
      ...(payload.icon !== undefined ? { icon: payload.icon } : {}),
      ...(payload.folderId !== undefined ? { folderId: payload.folderId } : {}),
      ...(payload.position !== undefined ? { position: payload.position } : {}),
      updatedAt: new Date().toISOString()
    }

    const result = await runOptimisticAction({
      apply: () => notesById.set(id, optimisticNote),
      rollback: () => notesById.set(id, previous),
      request: () => $fetch<Note>(`/api/notes/${id}`, { method: 'PUT', body: payload }),
      reconcile: updated => notesById.set(id, { ...notesById.get(id), ...updated }),
      errorMessage: 'Falha ao atualizar nota.',
      silent: options?.silent,
      offline: {
        entity: 'note',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/${id}`,
        body: payload,
        tempId: id.startsWith('temp-') ? id : undefined,
        optimisticResult: optimisticNote
      }
    })

    if (result && !options?.silent) {
      toast.add({ title: 'Nota atualizada', description: 'Alterações salvas.', color: 'success' })
    }
    return result
  }

  async function deleteNote(id: string): Promise<boolean> {
    const previous = notesById.get(id)
    if (!previous) return false

    const result = await runOptimisticAction({
      apply: () => {
        notesById.delete(id)
        allNoteIds.value = allNoteIds.value.filter(nid => nid !== id)
        paginatedNoteIds.value = paginatedNoteIds.value.filter(nid => nid !== id)
      },
      rollback: () => {
        notesById.set(id, previous)
        if (!allNoteIds.value.includes(id)) allNoteIds.value = [...allNoteIds.value, id]
        if (!paginatedNoteIds.value.includes(id)) paginatedNoteIds.value = [...paginatedNoteIds.value, id]
      },
      request: () => $fetch<{ success: boolean }>(`/api/notes/${id}`, { method: 'DELETE' }),
      errorMessage: 'Falha ao excluir nota. A nota foi restaurada.',
      offline: {
        entity: 'note',
        action: 'delete',
        method: 'DELETE',
        url: `/api/notes/${id}`,
        tempId: id.startsWith('temp-') ? id : undefined,
        optimisticResult: { success: true }
      }
    })

    if (result !== null) {
      toast.add({ title: 'Nota movida para a lixeira', description: 'Você pode restaurá-la na Lixeira.', color: 'success' })
      refreshGraph()
      refreshNotes()
    }
    return result !== null
  }

  async function fetchNoteDetail(id: string): Promise<NoteDetail | null> {
    // One silent retry before surfacing an error — a cold page load (e.g.
    // opening a "copiar link do bloco" link in a fresh browser/tab) can race
    // the very first request against session/cookie setup; without this, that
    // transient failure both shows a spurious error toast and leaves the
    // deep-link scroll with nothing to scroll to, even though a follow-up
    // request would have succeeded a moment later.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const detail = await $fetch<NoteDetail>(`/api/notes/${id}`)
        notesById.set(id, { ...notesById.get(id), ...detail })
        return detail
      } catch (err) {
        if (attempt === 0) {
          await new Promise(resolve => setTimeout(resolve, 400))
          continue
        }
        console.error('[useNotes] fetchNoteDetail failed', id, err)
        toast.add({ title: 'Erro', description: 'Falha ao carregar nota.', color: 'error' })
        return null
      }
    }
    return null
  }

  async function togglePin(note: Note): Promise<boolean> {
    const previous = notesById.get(note.id)
    if (!previous) return false
    const nextPinned = !previous.pinned
    // Optimistic guess — reconcile() below overwrites it with the server's
    // clock once the request resolves, which is what sub-ordering pinned notes
    // in custom sort mode actually relies on.
    const nextPinnedAt = nextPinned ? new Date().toISOString() : null

    const optimisticNote = { ...previous, pinned: nextPinned, pinnedAt: nextPinnedAt }

    const result = await runOptimisticAction({
      apply: () => notesById.set(note.id, optimisticNote),
      rollback: () => notesById.set(note.id, previous),
      request: () => $fetch<Note>(`/api/notes/${note.id}`, { method: 'PUT', body: { pinned: nextPinned } }),
      reconcile: updated => notesById.set(note.id, { ...notesById.get(note.id), ...updated }),
      errorMessage: 'Falha ao alterar fixação.',
      offline: {
        entity: 'note',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/${note.id}`,
        body: { pinned: nextPinned },
        tempId: note.id.startsWith('temp-') ? note.id : undefined,
        optimisticResult: optimisticNote
      }
    })

    if (result) {
      toast.add({ title: nextPinned ? 'Nota fixada' : 'Nota desafixada', color: 'success' })
    }
    return !!result
  }

  // ─── Sharing ────────────────────────────────────────────────────────────────

  async function setNoteVisibility(noteId: string, visibility: NoteVisibility): Promise<Note | null> {
    const previous = notesById.get(noteId)
    if (!previous) return null

    // Returns the full updated note (not just a boolean) — going public for the
    // first time generates a share_token server-side, and callers need that
    // token back immediately instead of waiting for a separate refetch.
    return runOptimisticAction({
      apply: () => notesById.set(noteId, { ...previous, visibility }),
      rollback: () => notesById.set(noteId, previous),
      request: () => $fetch<Note>(`/api/notes/${noteId}/visibility`, { method: 'PUT', body: { visibility } }),
      reconcile: updated => notesById.set(noteId, { ...notesById.get(noteId), ...updated }),
      errorMessage: 'Falha ao alterar a visibilidade da nota.'
    })
  }

  async function regenerateShareLink(noteId: string): Promise<Note | null> {
    try {
      const updated = await $fetch<Note>(`/api/notes/${noteId}/share-link/regenerate`, { method: 'POST' })
      notesById.set(noteId, { ...notesById.get(noteId), ...updated })
      toast.add({ title: 'Novo link gerado', description: 'O link anterior deixou de funcionar.', color: 'success' })
      return updated
    } catch (err) {
      console.error('[useNotes] regenerateShareLink failed', noteId, err)
      toast.add({ title: 'Erro', description: 'Falha ao gerar novo link.', color: 'error' })
      return null
    }
  }

  async function fetchNoteShares(noteId: string): Promise<NoteShare[]> {
    try {
      return await $fetch<NoteShare[]>(`/api/notes/${noteId}/shares`)
    } catch (err) {
      console.error('[useNotes] fetchNoteShares failed', noteId, err)
      toast.add({ title: 'Erro', description: 'Falha ao carregar lista de acesso.', color: 'error' })
      return []
    }
  }

  async function addNoteShare(noteId: string, payload: CreateNoteSharePayload): Promise<NoteShare | null> {
    try {
      const share = await $fetch<NoteShare>(`/api/notes/${noteId}/shares`, { method: 'POST', body: payload })
      toast.add({ title: 'Acesso concedido', description: `${payload.email} agora tem acesso a esta nota.`, color: 'success' })
      return share
    } catch (err: unknown) {
      console.error('[useNotes] addNoteShare failed', noteId, err)
      const message = (err as { data?: { statusMessage?: string } })?.data?.statusMessage
      toast.add({ title: 'Erro', description: message ?? 'Falha ao compartilhar nota.', color: 'error' })
      return null
    }
  }

  async function updateNoteShare(noteId: string, shareId: string, payload: UpdateNoteSharePayload): Promise<NoteShare | null> {
    try {
      return await $fetch<NoteShare>(`/api/notes/${noteId}/shares/${shareId}`, { method: 'PUT', body: payload })
    } catch (err) {
      console.error('[useNotes] updateNoteShare failed', noteId, shareId, err)
      toast.add({ title: 'Erro', description: 'Falha ao atualizar permissão.', color: 'error' })
      return null
    }
  }

  async function removeNoteShare(noteId: string, shareId: string): Promise<boolean> {
    try {
      await $fetch(`/api/notes/${noteId}/shares/${shareId}`, { method: 'DELETE' })
      return true
    } catch (err) {
      console.error('[useNotes] removeNoteShare failed', noteId, shareId, err)
      toast.add({ title: 'Erro', description: 'Falha ao remover acesso.', color: 'error' })
      return false
    }
  }

  // ─── Links ──────────────────────────────────────────────────────────────────

  async function linkNotes(sourceId: string, payload: LinkNotesPayload): Promise<boolean> {
    try {
      await $fetch(`/api/notes/${sourceId}/link`, {
        method: 'POST',
        body: payload
      })
      refreshGraph()
      return true
    } catch (err: unknown) {
      console.error('[linkNotes]', err)
      return false
    }
  }

  async function unlinkNotes(linkId: string): Promise<boolean> {
    try {
      await $fetch(`/api/notes/links/${linkId}`, { method: 'DELETE' })
      refreshGraph()
      return true
    } catch (err: unknown) {
      console.error('[unlinkNotes]', err)
      return false
    }
  }

  // ─── Tags CRUD ──────────────────────────────────────────────────────────────

  async function createTag(payload: CreateTagPayload): Promise<NoteTag | null> {
    const tempId = `temp-${crypto.randomUUID()}`
    const optimisticTag: NoteTag = {
      id: tempId,
      userId: '',
      name: payload.name,
      color: payload.color ?? null,
      createdAt: new Date().toISOString()
    }

    const result = await runOptimisticAction({
      apply: () => {
        tagsById.set(tempId, optimisticTag)
        tagIds.value = [...tagIds.value, tempId]
      },
      rollback: () => {
        tagsById.delete(tempId)
        tagIds.value = tagIds.value.filter(id => id !== tempId)
      },
      request: () => $fetch<NoteTag>('/api/notes/tags', { method: 'POST', body: payload }),
      reconcile: (serverTag) => {
        tagsById.delete(tempId)
        tagsById.set(serverTag.id, serverTag)
        tagIds.value = tagIds.value.map(id => id === tempId ? serverTag.id : id)
      },
      errorMessage: 'Falha ao criar tag.'
    })

    if (result) {
      toast.add({ title: 'Tag criada', description: `"${result.name}" criada.`, color: 'success' })
    }
    return result
  }

  async function updateTag(id: string, payload: UpdateTagPayload): Promise<NoteTag | null> {
    const previous = tagsById.get(id)
    if (!previous) return null

    const optimisticTag: NoteTag = {
      ...previous,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.color !== undefined ? { color: payload.color } : {})
    }

    const result = await runOptimisticAction({
      apply: () => tagsById.set(id, optimisticTag),
      rollback: () => tagsById.set(id, previous),
      request: () => $fetch<NoteTag>(`/api/notes/tags/${id}`, { method: 'PUT', body: payload }),
      reconcile: updated => tagsById.set(id, { ...tagsById.get(id), ...updated }),
      errorMessage: 'Falha ao atualizar tag.'
    })

    if (result) {
      toast.add({ title: 'Tag atualizada', color: 'success' })
    }
    return result
  }

  async function deleteTag(id: string): Promise<boolean> {
    const previous = tagsById.get(id)
    if (!previous) return false

    const result = await runOptimisticAction({
      apply: () => {
        tagsById.delete(id)
        tagIds.value = tagIds.value.filter(tid => tid !== id)
      },
      rollback: () => {
        tagsById.set(id, previous)
        if (!tagIds.value.includes(id)) tagIds.value = [...tagIds.value, id]
      },
      request: () => $fetch(`/api/notes/tags/${id}`, { method: 'DELETE' }),
      errorMessage: 'Falha ao excluir tag.'
    })

    if (result !== null) {
      toast.add({ title: 'Tag excluída', color: 'success' })
    }
    return result !== null
  }

  // ─── Folders CRUD ───────────────────────────────────────────────────────────

  /** Depth of an existing folder — a root-level folder (no parent) is depth 1.
   * `seen` guards against corrupted/cyclical parent_id data looping forever. */
  function getFolderDepth(folderId: string): number {
    let depth = 1
    let current = foldersById.get(folderId)
    const seen = new Set<string>()

    while (current?.parentId && !seen.has(current.id)) {
      seen.add(current.id)
      depth++
      current = foldersById.get(current.parentId)
    }

    return depth
  }

  async function createFolder(payload: CreateFolderPayload): Promise<NoteFolder | null> {
    if (payload.parentId && getFolderDepth(payload.parentId) >= MAX_FOLDER_DEPTH) {
      toast.add({
        title: 'Limite de aninhamento atingido',
        description: `Pastas só podem ter até ${MAX_FOLDER_DEPTH} níveis de profundidade.`,
        color: 'warning'
      })
      return null
    }

    const tempId = `temp-${crypto.randomUUID()}`
    const siblingPositions = Array.from(foldersById.values())
      .filter(f => (f.parentId ?? null) === (payload.parentId ?? null))
      .map(f => f.position)
    const position = siblingPositions.length > 0 ? Math.min(...siblingPositions) - 1000 : 0

    const optimisticFolder: NoteFolder = {
      id: tempId,
      userId: '',
      name: payload.name,
      parentId: payload.parentId ?? null,
      position,
      isExpanded: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const result = await runOptimisticAction({
      apply: () => {
        foldersById.set(tempId, optimisticFolder)
        folderIds.value = [...folderIds.value, tempId]
      },
      rollback: () => {
        foldersById.delete(tempId)
        folderIds.value = folderIds.value.filter(id => id !== tempId)
      },
      request: () => $fetch<NoteFolder>('/api/notes/folders', { method: 'POST', body: payload }),
      reconcile: (serverFolder) => {
        foldersById.delete(tempId)
        foldersById.set(serverFolder.id, serverFolder)
        folderIds.value = folderIds.value.map(id => id === tempId ? serverFolder.id : id)
      },
      errorMessage: 'Falha ao criar pasta.',
      offline: {
        entity: 'folder',
        action: 'create',
        method: 'POST',
        url: '/api/notes/folders',
        body: payload,
        tempId,
        optimisticResult: optimisticFolder
      }
    })

    if (result) {
      toast.add({ title: 'Pasta criada', description: `"${result.name}" criada.`, color: 'success' })
    }
    return result
  }

  async function updateFolder(id: string, payload: UpdateFolderPayload): Promise<NoteFolder | null> {
    const previous = foldersById.get(id)
    if (!previous) return null

    const optimisticFolder: NoteFolder = {
      ...previous,
      ...(payload.name !== undefined ? { name: payload.name } : {}),
      ...(payload.parentId !== undefined ? { parentId: payload.parentId } : {}),
      ...(payload.position !== undefined ? { position: payload.position } : {}),
      ...(payload.isExpanded !== undefined ? { isExpanded: payload.isExpanded } : {}),
      updatedAt: new Date().toISOString()
    }

    return runOptimisticAction({
      apply: () => foldersById.set(id, optimisticFolder),
      rollback: () => foldersById.set(id, previous),
      request: () => $fetch<NoteFolder>(`/api/notes/folders/${id}`, { method: 'PUT', body: payload }),
      reconcile: updated => foldersById.set(id, { ...foldersById.get(id), ...updated }),
      errorMessage: 'Falha ao renomear pasta.',
      offline: {
        entity: 'folder',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/folders/${id}`,
        body: payload,
        tempId: id.startsWith('temp-') ? id : undefined,
        optimisticResult: optimisticFolder
      }
    })
  }

  function getDescendantFolderIds(folderId: string): string[] {
    const result: string[] = []
    const stack = [folderId]
    while (stack.length > 0) {
      const current = stack.pop() as string
      for (const folder of foldersById.values()) {
        if (folder.parentId === current) {
          result.push(folder.id)
          stack.push(folder.id)
        }
      }
    }
    return result
  }

  function getAffectedNoteIds(folderIdsToCheck: string[]): string[] {
    const idSet = new Set(folderIdsToCheck)
    return Array.from(notesById.values())
      .filter(n => n.folderId && idSet.has(n.folderId))
      .map(n => n.id)
  }

  /** Notes/subfolders that would be permanently removed if this folder is deleted — used to confirm before deleting. */
  function getFolderDeletionImpact(folderId: string): { noteCount: number, subfolderCount: number } {
    const descendantFolderIds = getDescendantFolderIds(folderId)
    const affectedNoteIds = getAffectedNoteIds([folderId, ...descendantFolderIds])
    return { noteCount: affectedNoteIds.length, subfolderCount: descendantFolderIds.length }
  }

  async function deleteFolder(id: string): Promise<boolean> {
    const targetFolder = foldersById.get(id)
    if (!targetFolder) return false

    const descendantFolderIds = getDescendantFolderIds(id)
    const removedFolderIds = [id, ...descendantFolderIds]
    const affectedNoteIds = getAffectedNoteIds(removedFolderIds)

    const folderSnapshots = removedFolderIds
      .map(fid => foldersById.get(fid))
      .filter((f): f is NoteFolder => !!f)
    const noteSnapshots = affectedNoteIds
      .map(nid => notesById.get(nid))
      .filter((n): n is Note => !!n)

    const result = await runOptimisticAction({
      apply: () => {
        for (const fid of removedFolderIds) foldersById.delete(fid)
        for (const nid of affectedNoteIds) notesById.delete(nid)
        folderIds.value = folderIds.value.filter(fid => !removedFolderIds.includes(fid))
        allNoteIds.value = allNoteIds.value.filter(nid => !affectedNoteIds.includes(nid))
        paginatedNoteIds.value = paginatedNoteIds.value.filter(nid => !affectedNoteIds.includes(nid))
      },
      rollback: () => {
        for (const f of folderSnapshots) foldersById.set(f.id, f)
        for (const n of noteSnapshots) notesById.set(n.id, n)
        folderIds.value = [...folderIds.value, ...removedFolderIds]
        allNoteIds.value = [...allNoteIds.value, ...affectedNoteIds]
        paginatedNoteIds.value = [...paginatedNoteIds.value, ...affectedNoteIds]
      },
      request: () => $fetch(`/api/notes/folders/${id}`, { method: 'DELETE' }),
      errorMessage: 'Falha ao excluir pasta. A pasta foi restaurada.',
      offline: {
        entity: 'folder',
        action: 'delete',
        method: 'DELETE',
        url: `/api/notes/folders/${id}`,
        tempId: id.startsWith('temp-') ? id : undefined,
        optimisticResult: { success: true }
      }
    })

    if (result !== null) {
      const extra = affectedNoteIds.length > 0 || descendantFolderIds.length > 0
        ? ` ${affectedNoteIds.length} nota(s) e ${descendantFolderIds.length} subpasta(s) também foram movidas.`
        : undefined
      toast.add({ title: 'Pasta movida para a lixeira', description: extra ?? 'Você pode restaurá-la na Lixeira.', color: 'success' })
      refreshGraph()
      if (affectedNoteIds.length > 0) refreshNotes()
    }
    return result !== null
  }

  async function moveNoteToFolder(noteId: string, folderId: string | null): Promise<boolean> {
    const previous = notesById.get(noteId)
    if (!previous) return false

    const optimisticNote = { ...previous, folderId }

    const result = await runOptimisticAction({
      apply: () => notesById.set(noteId, optimisticNote),
      rollback: () => notesById.set(noteId, previous),
      request: () => $fetch<Note>(`/api/notes/${noteId}`, { method: 'PUT', body: { folderId } }),
      reconcile: updated => notesById.set(noteId, { ...notesById.get(noteId), ...updated }),
      errorMessage: 'Falha ao mover nota.',
      offline: {
        entity: 'note',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/${noteId}`,
        body: { folderId },
        tempId: noteId.startsWith('temp-') ? noteId : undefined,
        optimisticResult: optimisticNote
      }
    })
    return !!result
  }

  // ─── Trash (soft delete) ────────────────────────────────────────────────────

  const trashItems = ref<TrashItem[]>([])
  const trashStatus = ref<'idle' | 'pending' | 'success' | 'error'>('idle')

  async function fetchTrash(): Promise<void> {
    trashStatus.value = 'pending'
    try {
      trashItems.value = await $fetch<TrashItem[]>('/api/notes/trash')
      trashStatus.value = 'success'
    } catch (err) {
      console.error('[useNotes] fetchTrash failed', err)
      trashStatus.value = 'error'
      toast.add({ title: 'Erro', description: 'Falha ao carregar a lixeira.', color: 'error' })
    }
  }

  async function restoreNote(id: string): Promise<boolean> {
    try {
      const restored = await $fetch<Note>(`/api/notes/${id}/restore`, { method: 'POST' })
      trashItems.value = trashItems.value.filter(item => !(item.kind === 'note' && item.id === id))
      notesById.set(restored.id, restored)
      allNoteIds.value = [restored.id, ...allNoteIds.value.filter(nid => nid !== restored.id)]
      paginatedNoteIds.value = [restored.id, ...paginatedNoteIds.value.filter(nid => nid !== restored.id)]
      toast.add({ title: 'Nota restaurada', color: 'success' })
      refreshGraph()
      refreshNotes()
      return true
    } catch (err) {
      console.error('[useNotes] restoreNote failed', id, err)
      toast.add({ title: 'Erro', description: 'Falha ao restaurar nota.', color: 'error' })
      return false
    }
  }

  // Cascading — restoring a folder brings back an unknown-in-advance set of
  // descendant subfolders/notes, so a full refetch is simpler and safer than
  // trying to patch the local store item by item.
  async function restoreFolder(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/notes/folders/${id}/restore`, { method: 'POST' })
      toast.add({ title: 'Pasta restaurada', color: 'success' })
      await Promise.all([refreshFolders(), refreshAllNotes(), refreshNotes(), fetchTrash()])
      refreshGraph()
      return true
    } catch (err) {
      console.error('[useNotes] restoreFolder failed', id, err)
      toast.add({ title: 'Erro', description: 'Falha ao restaurar pasta.', color: 'error' })
      return false
    }
  }

  async function permanentlyDeleteNote(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/notes/${id}/permanent`, { method: 'DELETE' })
      trashItems.value = trashItems.value.filter(item => !(item.kind === 'note' && item.id === id))
      toast.add({ title: 'Nota excluída permanentemente', color: 'success' })
      return true
    } catch (err) {
      console.error('[useNotes] permanentlyDeleteNote failed', id, err)
      toast.add({ title: 'Erro', description: 'Falha ao excluir nota permanentemente.', color: 'error' })
      return false
    }
  }

  // Cascading — see restoreFolder() above for why this refetches instead of
  // patching local state.
  async function permanentlyDeleteFolder(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/notes/folders/${id}/permanent`, { method: 'DELETE' })
      toast.add({ title: 'Pasta excluída permanentemente', color: 'success' })
      await fetchTrash()
      return true
    } catch (err) {
      console.error('[useNotes] permanentlyDeleteFolder failed', id, err)
      toast.add({ title: 'Erro', description: 'Falha ao excluir pasta permanentemente.', color: 'error' })
      return false
    }
  }

  // ─── Custom (drag-and-drop) ordering ────────────────────────────────────────

  /** Fractional position between two siblings; pass null for "at the start/end". */
  function computePositionBetween(before: number | null, after: number | null): number {
    if (before === null && after === null) return 0
    if (before === null) return (after as number) - 1000
    if (after === null) return before + 1000
    return (before + after) / 2
  }

  /**
   * Repositions a note, optionally also moving it into a different folder in the
   * same operation — dragging a note onto a row inside another folder must move
   * *and* position it atomically, in a single optimistic update and a single
   * request, rather than two separate steps that could disagree with each other.
   */
  async function reorderNote(noteId: string, position: number, folderId?: string | null): Promise<boolean> {
    const previous = notesById.get(noteId)
    if (!previous) return false

    const changingFolder = folderId !== undefined && folderId !== previous.folderId
    const optimisticNote: Note = {
      ...previous,
      position,
      ...(changingFolder ? { folderId } : {})
    }

    const reorderBody = changingFolder ? { position, folderId } : { position }

    const result = await runOptimisticAction({
      apply: () => notesById.set(noteId, optimisticNote),
      rollback: () => notesById.set(noteId, previous),
      request: () => $fetch<Note>(`/api/notes/${noteId}`, { method: 'PUT', body: reorderBody }),
      reconcile: updated => notesById.set(noteId, { ...notesById.get(noteId), ...updated }),
      errorMessage: 'Falha ao reordenar nota.',
      offline: {
        entity: 'note',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/${noteId}`,
        body: reorderBody,
        tempId: noteId.startsWith('temp-') ? noteId : undefined,
        optimisticResult: optimisticNote
      }
    })
    return !!result
  }

  async function reorderFolder(folderId: string, position: number): Promise<boolean> {
    const previous = foldersById.get(folderId)
    if (!previous) return false

    const optimisticFolder = { ...previous, position }

    const result = await runOptimisticAction({
      apply: () => foldersById.set(folderId, optimisticFolder),
      rollback: () => foldersById.set(folderId, previous),
      request: () => $fetch<NoteFolder>(`/api/notes/folders/${folderId}`, { method: 'PUT', body: { position } }),
      reconcile: updated => foldersById.set(folderId, { ...foldersById.get(folderId), ...updated }),
      errorMessage: 'Falha ao reordenar pasta.',
      offline: {
        entity: 'folder',
        action: 'update',
        method: 'PUT',
        url: `/api/notes/folders/${folderId}`,
        body: { position },
        tempId: folderId.startsWith('temp-') ? folderId : undefined,
        optimisticResult: optimisticFolder
      }
    })
    return !!result
  }

  // ─── Expand/collapse persistence (debounced write, instant local reflection) ─

  const expandDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function setFolderExpanded(folderId: string, isExpanded: boolean): void {
    const folder = foldersById.get(folderId)
    if (!folder || folder.isExpanded === isExpanded) return
    const previousExpanded = folder.isExpanded

    foldersById.set(folderId, { ...folder, isExpanded })

    const pending = expandDebounceTimers.get(folderId)
    if (pending) clearTimeout(pending)

    expandDebounceTimers.set(folderId, setTimeout(() => {
      expandDebounceTimers.delete(folderId)
      runOptimisticAction({
        apply: () => {},
        rollback: () => {
          const current = foldersById.get(folderId)
          if (current) foldersById.set(folderId, { ...current, isExpanded: previousExpanded })
        },
        request: () => $fetch<NoteFolder>(`/api/notes/folders/${folderId}`, { method: 'PUT', body: { isExpanded } }),
        reconcile: updated => foldersById.set(folderId, { ...foldersById.get(folderId), ...updated }),
        errorMessage: 'Falha ao salvar estado da pasta.',
        offline: {
          entity: 'folder',
          action: 'update',
          method: 'PUT',
          url: `/api/notes/folders/${folderId}`,
          body: { isExpanded },
          tempId: folderId.startsWith('temp-') ? folderId : undefined,
          optimisticResult: { ...folder, isExpanded }
        }
      })
    }, 400))
  }

  // ─── Offline sync engine ─────────────────────────────────────────────────────
  // Drains the mutation queue in insertion order once the connection comes
  // back. There's no live closure to reconcile individual results with here —
  // the mutations being replayed may well have been queued in a previous
  // session (page reload, app restart) — so instead of fine-grained
  // reconciliation, a full refetch after the drain is what converges the UI
  // with the server. See docs/PLANO_COMPARTILHAMENTO_E_OFFLINE.md (Fase B5).
  const { pendingMutations, pendingCount, dequeue: dequeueMutation, markRetry, ensureLoaded: ensureQueueLoaded } = useMutationQueue()
  const { isOnline, onReconnect } = useConnectionStatus()
  const syncingOffline = ref(false)

  /** tempId -> real server id, populated as queued 'create' mutations replay —
   * lets the page redirect a still-selected offline-created note to its real id. */
  const tempIdReconciliations = reactive(new Map<string, string>())

  async function drainMutationQueue(): Promise<void> {
    if (syncingOffline.value) return
    await ensureQueueLoaded()
    if (pendingMutations.value.length === 0) return

    syncingOffline.value = true
    let replayedAny = false

    try {
      const queue = [...pendingMutations.value]

      for (const mutation of queue) {
        // Coalesced/cancelled by a later action since the snapshot was taken.
        if (!pendingMutations.value.some(m => m.id === mutation.id)) continue
        if (!isOnline.value) break

        try {
          const response = await $fetch<Record<string, unknown>>(mutation.url, {
            method: mutation.method,
            body: mutation.body as Record<string, unknown> | undefined
          })
          if (mutation.action === 'create' && mutation.tempId && typeof response?.id === 'string') {
            tempIdReconciliations.set(mutation.tempId, response.id)
          }
          await dequeueMutation(mutation.id)
          replayedAny = true
        } catch (err) {
          if (!isOnline.value) break // connection dropped mid-replay, not a real rejection
          console.error('[offline-sync] mutation failed', mutation, err)
          await markRetry(mutation.id)
        }
      }
    } finally {
      syncingOffline.value = false
      if (replayedAny) {
        refreshAllNotes()
        refreshFolders()
        refreshNotes()
        refreshGraph()
        toast.add({ title: 'Sincronizado', description: 'Suas alterações offline foram salvas.', color: 'success' })
      }
    }
  }

  onReconnect(() => {
    void drainMutationQueue()
  })
  onMounted(() => {
    if (isOnline.value) void drainMutationQueue()
  })

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

    // Folders
    folders,
    foldersStatus,
    refreshFolders,
    allNotes,
    allNotesStatus,
    refreshAllNotes,
    createFolder,
    updateFolder,
    deleteFolder,
    moveNoteToFolder,
    getFolderDeletionImpact,
    getFolderDepth,
    setFolderExpanded,

    // Trash
    trashItems,
    trashStatus,
    fetchTrash,
    restoreNote,
    restoreFolder,
    permanentlyDeleteNote,
    permanentlyDeleteFolder,

    // Shared with me
    sharedWithMe,
    sharedWithMeStatus,
    refreshSharedWithMe,

    // Offline
    isOnline,
    pendingSyncCount: pendingCount,
    syncingOffline,
    tempIdReconciliations,

    // Search
    searchQuery,
    searchResults,
    searching,

    // Note CRUD
    createNote,
    duplicateNote,
    updateNote,
    deleteNote,
    fetchNoteDetail,
    togglePin,

    // Sharing
    setNoteVisibility,
    regenerateShareLink,
    fetchNoteShares,
    addNoteShare,
    updateNoteShare,
    removeNoteShare,

    // Custom ordering
    computePositionBetween,
    reorderNote,
    reorderFolder,

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
    NoteType,
    NoteVisibility
  }
}
