import { useDebounceFn } from '@vueuse/core'
import type {
  CreateSubtaskPayload,
  CreateTaskListPayload,
  CreateTaskPayload,
  CreateTaskTagPayload,
  Task,
  TaskInsights,
  TaskList,
  TaskListResponse,
  TaskSubtask,
  TaskTag,
  UpdateSubtaskPayload,
  UpdateTaskPayload
} from '~/types/tasks'
import { TaskPriority, TaskStatus } from '~/types/tasks'
import { detectBrowserTimeZone } from '#shared/utils/dateTime'

type BadgeColor = 'success' | 'error' | 'primary' | 'secondary' | 'info' | 'warning' | 'neutral'

export function useTasks() {
  const toast = useToast()

  // Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): sent so the server can
  // resolve "today" (overdue filter, insights) against the browser's zone
  // instead of its stored fallback — undefined during SSR (no browser there).
  const clientTimezone = detectBrowserTimeZone()

  // ─── Tasks list (paginated) ─────────────────────────────────────────────────
  const listPage = ref(1)
  const listPageSize = ref(20)
  const listSearch = ref('')
  const listStatus = ref<string>('')
  const listPriority = ref<string>('')
  const listListId = ref<string>('')

  const {
    data: listData,
    status: listFetchStatus,
    refresh: refreshList
  } = useFetch<TaskListResponse>('/api/tasks', {
    query: computed(() => ({
      page: listPage.value,
      pageSize: listPageSize.value,
      search: listSearch.value || undefined,
      status: listStatus.value || undefined,
      priority: listPriority.value || undefined,
      listId: listListId.value || undefined,
      tz: clientTimezone
    })),
    lazy: true,
    key: 'tasks-list',
    watch: [listPage, listPageSize, listStatus, listPriority, listListId]
  })

  const debouncedRefreshList = useDebounceFn(() => {
    refreshList()
  }, 300)

  watch(listSearch, () => {
    listPage.value = 1
    debouncedRefreshList()
  })

  // ─── Task Lists ─────────────────────────────────────────────────────────────
  const {
    data: taskLists,
    status: taskListsStatus,
    refresh: refreshTaskLists
  } = useFetch<TaskList[]>('/api/tasks/lists', {
    lazy: true,
    key: 'task-lists'
  })

  // ─── Task Tags ──────────────────────────────────────────────────────────────
  const {
    data: taskTags,
    status: taskTagsStatus,
    refresh: refreshTaskTags
  } = useFetch<TaskTag[]>('/api/tasks/tags', {
    lazy: true,
    key: 'task-tags'
  })

  // ─── Insights ───────────────────────────────────────────────────────────────
  const {
    data: insights,
    status: insightsStatus,
    refresh: refreshInsights
  } = useFetch<TaskInsights>('/api/tasks/insights', {
    query: { tz: clientTimezone },
    lazy: true,
    key: 'tasks-insights'
  })

  // ─── Task Actions ──────────────────────────────────────────────────────────

  async function createTask(payload: CreateTaskPayload): Promise<Task | null> {
    try {
      const task = await $fetch<Task>('/api/tasks', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Tarefa criada', description: `"${task.title}" adicionada com sucesso.`, color: 'success' })
      await refreshList()
      return task
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a tarefa.', color: 'error' })
      return null
    }
  }

  async function updateTask(id: string, payload: UpdateTaskPayload): Promise<Task | null> {
    try {
      const task = await $fetch<Task>(`/api/tasks/${id}`, {
        method: 'PUT',
        body: payload
      })
      toast.add({ title: 'Tarefa atualizada', description: `"${task.title}" salva com sucesso.`, color: 'success' })
      await refreshList()
      return task
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a tarefa.', color: 'error' })
      return null
    }
  }

  async function archiveTask(id: string, title: string): Promise<boolean> {
    try {
      const endpoint: string = `/api/tasks/${id}`
      await $fetch(endpoint, { method: 'DELETE' })
      toast.add({ title: 'Tarefa arquivada', description: `"${title}" foi arquivada.`, color: 'success' })
      await refreshList()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar a tarefa.', color: 'error' })
      return false
    }
  }

  async function completeTask(id: string, title: string): Promise<boolean> {
    try {
      const endpoint: string = `/api/tasks/${id}`
      await $fetch(endpoint, {
        method: 'PUT',
        body: { status: TaskStatus.Completed }
      })
      toast.add({ title: 'Tarefa concluída!', description: `"${title}" foi marcada como concluída.`, color: 'success' })
      await refreshList()
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível concluir a tarefa.', color: 'error' })
      return false
    }
  }

  async function fetchTask(id: string): Promise<Task | null> {
    try {
      return await $fetch<Task>(`/api/tasks/${id}`)
    } catch {
      toast.add({ title: 'Erro', description: 'Tarefa não encontrada.', color: 'error' })
      return null
    }
  }

  // ─── Subtask Actions ──────────────────────────────────────────────────────

  async function createSubtask(taskId: string, payload: CreateSubtaskPayload): Promise<TaskSubtask | null> {
    try {
      const subtask = await $fetch<TaskSubtask>(`/api/tasks/${taskId}/subtasks`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Subtarefa criada', description: `"${subtask.title}" adicionada.`, color: 'success' })
      return subtask
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a subtarefa.', color: 'error' })
      return null
    }
  }

  async function updateSubtask(subtaskId: string, payload: UpdateSubtaskPayload): Promise<TaskSubtask | null> {
    try {
      return await $fetch<TaskSubtask>(`/api/tasks/subtasks/${subtaskId}`, {
        method: 'PUT',
        body: payload
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a subtarefa.', color: 'error' })
      return null
    }
  }

  async function deleteSubtask(subtaskId: string): Promise<boolean> {
    try {
      const endpoint: string = `/api/tasks/subtasks/${subtaskId}`
      await $fetch(endpoint, { method: 'DELETE' })
      toast.add({ title: 'Subtarefa removida', description: 'A subtarefa foi excluída.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível excluir a subtarefa.', color: 'error' })
      return false
    }
  }

  // ─── List Actions ──────────────────────────────────────────────────────────

  async function createTaskList(payload: CreateTaskListPayload): Promise<TaskList | null> {
    try {
      const list = await $fetch<TaskList>('/api/tasks/lists', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Lista criada', description: `"${list.name}" criada com sucesso.`, color: 'success' })
      await refreshTaskLists()
      return list
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a lista.', color: 'error' })
      return null
    }
  }

  // ─── Tag Actions ──────────────────────────────────────────────────────────

  async function createTag(payload: CreateTaskTagPayload): Promise<TaskTag | null> {
    try {
      const tag = await $fetch<TaskTag>('/api/tasks/tags', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Tag criada', description: `"${tag.name}" criada com sucesso.`, color: 'success' })
      await refreshTaskTags()
      return tag
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a tag.', color: 'error' })
      return null
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const priorityOptions = [
    { label: 'Baixa', value: TaskPriority.Low },
    { label: 'Média', value: TaskPriority.Medium },
    { label: 'Alta', value: TaskPriority.High },
    { label: 'Crítica', value: TaskPriority.Critical }
  ]

  const statusOptions = [
    { label: 'Pendente', value: TaskStatus.Pending },
    { label: 'Em progresso', value: TaskStatus.InProgress },
    { label: 'Concluída', value: TaskStatus.Completed },
    { label: 'Arquivada', value: TaskStatus.Archived }
  ]

  function getPriorityLabel(value: string): string {
    return priorityOptions.find(o => o.value === value)?.label ?? value
  }

  function getPriorityColor(priority: string): BadgeColor {
    switch (priority) {
      case TaskPriority.Low: return 'neutral'
      case TaskPriority.Medium: return 'info'
      case TaskPriority.High: return 'warning'
      case TaskPriority.Critical: return 'error'
      default: return 'neutral'
    }
  }

  function getStatusLabel(value: string): string {
    return statusOptions.find(o => o.value === value)?.label ?? value
  }

  function getStatusColor(status: string): BadgeColor {
    switch (status) {
      case TaskStatus.Pending: return 'neutral'
      case TaskStatus.InProgress: return 'info'
      case TaskStatus.Completed: return 'success'
      case TaskStatus.Archived: return 'neutral'
      default: return 'neutral'
    }
  }

  function isOverdue(task: Task): boolean {
    if (!task.dueDate || task.status === TaskStatus.Completed) return false
    const today = new Date().toISOString().split('T')[0] || ''
    return task.dueDate < today
  }

  return {
    // List
    listData,
    listFetchStatus,
    listPage,
    listPageSize,
    listSearch,
    listStatus,
    listPriority,
    listListId,
    refreshList,
    // Task Lists
    taskLists,
    taskListsStatus,
    refreshTaskLists,
    // Task Tags
    taskTags,
    taskTagsStatus,
    refreshTaskTags,
    // Insights
    insights,
    insightsStatus,
    refreshInsights,
    // Task Actions
    createTask,
    updateTask,
    archiveTask,
    completeTask,
    fetchTask,
    // Subtask Actions
    createSubtask,
    updateSubtask,
    deleteSubtask,
    // List Actions
    createTaskList,
    // Tag Actions
    createTag,
    // Helpers
    priorityOptions,
    statusOptions,
    getPriorityLabel,
    getPriorityColor,
    getStatusLabel,
    getStatusColor,
    isOverdue
  }
}
