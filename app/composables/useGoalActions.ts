import type {
  CreateGoalMilestonePayload,
  CreateGoalPayload,
  CreateGoalTaskPayload,
  Goal,
  GoalHabitLink,
  GoalMilestone,
  GoalReflection,
  GoalTask,
  LinkHabitPayload,
  UpdateGoalMilestonePayload,
  UpdateGoalPayload,
  UpdateGoalTaskPayload,
  UpsertGoalReflectionPayload
} from '~/types/goals'
import { GoalLifeCategory, GoalStatus, GoalTimeCategory } from '~/types/goals'
import { detectBrowserTimeZone } from '#shared/utils/dateTime'

type BadgeColor = 'success' | 'error' | 'primary' | 'secondary' | 'info' | 'warning' | 'neutral'

export const timeCategoryOptions = [
  { label: 'Diário', value: GoalTimeCategory.Daily },
  { label: 'Semanal', value: GoalTimeCategory.Weekly },
  { label: 'Mensal', value: GoalTimeCategory.Monthly },
  { label: 'Trimestral', value: GoalTimeCategory.Quarterly },
  { label: 'Anual', value: GoalTimeCategory.Yearly },
  { label: 'Longo prazo', value: GoalTimeCategory.LongTerm }
]

export const lifeCategoryOptions = [
  { label: 'Pessoal', value: GoalLifeCategory.Personal },
  { label: 'Carreira', value: GoalLifeCategory.Career },
  { label: 'Saúde', value: GoalLifeCategory.Health },
  { label: 'Finanças', value: GoalLifeCategory.Finance },
  { label: 'Espiritual', value: GoalLifeCategory.Spiritual },
  { label: 'Aprendizado', value: GoalLifeCategory.Learning },
  { label: 'Relacionamentos', value: GoalLifeCategory.Relationships },
  { label: 'Estilo de vida', value: GoalLifeCategory.Lifestyle }
]

export const statusOptions = [
  { label: 'Ativa', value: GoalStatus.Active },
  { label: 'Concluída', value: GoalStatus.Completed },
  { label: 'Arquivada', value: GoalStatus.Archived }
]

export function useGoalActions() {
  const toast = useToast()

  async function createGoal(payload: CreateGoalPayload): Promise<Goal | null> {
    try {
      const goal = await $fetch<Goal>('/api/goals', {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Meta criada', description: `"${goal.title}" adicionada com sucesso.`, color: 'success' })
      return goal
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a meta.', color: 'error' })
      return null
    }
  }

  async function updateGoal(id: string, payload: UpdateGoalPayload): Promise<Goal | null> {
    try {
      const goal = await $fetch<Goal>(`/api/goals/${id}`, {
        method: 'PUT',
        body: payload
      })
      toast.add({ title: 'Meta atualizada', description: `"${goal.title}" salva com sucesso.`, color: 'success' })
      return goal
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a meta.', color: 'error' })
      return null
    }
  }

  async function archiveGoal(id: string, title: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/${id}`, { method: 'DELETE' })
      toast.add({ title: 'Meta arquivada', description: `"${title}" foi arquivada.`, color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível arquivar a meta.', color: 'error' })
      return false
    }
  }

  async function restoreGoal(id: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/${id}/restore`, { method: 'POST' })
      toast.add({ title: 'Meta restaurada', description: 'A meta foi restaurada com sucesso.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível restaurar a meta.', color: 'error' })
      return false
    }
  }

  async function completeGoal(id: string, title: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/${id}`, {
        method: 'PUT',
        body: { status: GoalStatus.Completed }
      })
      toast.add({ title: 'Meta concluída!', description: `"${title}" foi marcada como concluída.`, color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível concluir a meta.', color: 'error' })
      return false
    }
  }

  async function fetchGoal(id: string): Promise<Goal | null> {
    try {
      // Regra 1 (docs/timezone/ANALISE_TIMEZONE.md): lets the server resolve
      // habit-consistency progress against the browser's zone instead of the
      // stored fallback.
      return await $fetch<Goal>(`/api/goals/${id}`, { query: { tz: detectBrowserTimeZone() } })
    } catch {
      toast.add({ title: 'Erro', description: 'Meta não encontrada.', color: 'error' })
      return null
    }
  }

  async function createTask(goalId: string, payload: CreateGoalTaskPayload): Promise<GoalTask | null> {
    try {
      const task = await $fetch<GoalTask>(`/api/goals/${goalId}/tasks`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Tarefa criada', description: `"${task.title}" adicionada.`, color: 'success' })
      return task
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar a tarefa.', color: 'error' })
      return null
    }
  }

  async function updateTask(taskId: string, payload: UpdateGoalTaskPayload): Promise<GoalTask | null> {
    try {
      return await $fetch<GoalTask>(`/api/goals/tasks/${taskId}`, {
        method: 'PUT',
        body: payload
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar a tarefa.', color: 'error' })
      return null
    }
  }

  async function deleteTask(taskId: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/tasks/${taskId}`, { method: 'DELETE' })
      toast.add({ title: 'Tarefa removida', description: 'A tarefa foi excluída.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível excluir a tarefa.', color: 'error' })
      return false
    }
  }

  async function createMilestone(goalId: string, payload: CreateGoalMilestonePayload): Promise<GoalMilestone | null> {
    try {
      const milestone = await $fetch<GoalMilestone>(`/api/goals/${goalId}/milestones`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Marco criado', description: `"${milestone.title}" adicionado.`, color: 'success' })
      return milestone
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível criar o marco.', color: 'error' })
      return null
    }
  }

  async function updateMilestone(milestoneId: string, payload: UpdateGoalMilestonePayload): Promise<GoalMilestone | null> {
    try {
      return await $fetch<GoalMilestone>(`/api/goals/milestones/${milestoneId}`, {
        method: 'PUT',
        body: payload
      })
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível atualizar o marco.', color: 'error' })
      return null
    }
  }

  async function deleteMilestone(milestoneId: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/milestones/${milestoneId}`, { method: 'DELETE' })
      toast.add({ title: 'Marco removido', description: 'O marco foi excluído.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível excluir o marco.', color: 'error' })
      return false
    }
  }

  async function linkHabit(goalId: string, payload: LinkHabitPayload): Promise<GoalHabitLink | null> {
    try {
      const link = await $fetch<GoalHabitLink>(`/api/goals/${goalId}/habits`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Hábito vinculado', description: 'Hábito associado à meta.', color: 'success' })
      return link
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível vincular o hábito.', color: 'error' })
      return null
    }
  }

  async function unlinkHabit(linkId: string): Promise<boolean> {
    try {
      await $fetch(`/api/goals/habits/${linkId}`, { method: 'DELETE' })
      toast.add({ title: 'Vínculo removido', description: 'O hábito foi desvinculado da meta.', color: 'success' })
      return true
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível remover o vínculo.', color: 'error' })
      return false
    }
  }

  async function fetchReflection(goalId: string, weekKey: string): Promise<GoalReflection | null> {
    try {
      return await $fetch<GoalReflection | null>(`/api/goals/${goalId}/reflections`, {
        query: { weekKey }
      })
    } catch {
      return null
    }
  }

  async function saveReflection(goalId: string, payload: UpsertGoalReflectionPayload): Promise<GoalReflection | null> {
    try {
      const reflection = await $fetch<GoalReflection>(`/api/goals/${goalId}/reflections`, {
        method: 'POST',
        body: payload
      })
      toast.add({ title: 'Revisão salva', description: 'Sua reflexão semanal foi registrada.', color: 'success' })
      return reflection
    } catch {
      toast.add({ title: 'Erro', description: 'Não foi possível salvar a revisão.', color: 'error' })
      return null
    }
  }

  function getLifeCategoryLabel(value: string): string {
    return lifeCategoryOptions.find(o => o.value === value)?.label ?? value
  }

  function getTimeCategoryLabel(value: string): string {
    return timeCategoryOptions.find(o => o.value === value)?.label ?? value
  }

  function getStatusColor(status: string): BadgeColor {
    switch (status) {
      case GoalStatus.Active: return 'primary'
      case GoalStatus.Completed: return 'success'
      case GoalStatus.Archived: return 'neutral'
      default: return 'neutral'
    }
  }

  function getStatusLabel(status: string): string {
    return statusOptions.find(o => o.value === status)?.label ?? status
  }

  return {
    createGoal,
    updateGoal,
    archiveGoal,
    restoreGoal,
    completeGoal,
    fetchGoal,
    createTask,
    updateTask,
    deleteTask,
    createMilestone,
    updateMilestone,
    deleteMilestone,
    linkHabit,
    unlinkHabit,
    fetchReflection,
    saveReflection,
    timeCategoryOptions,
    lifeCategoryOptions,
    statusOptions,
    getLifeCategoryLabel,
    getTimeCategoryLabel,
    getStatusColor,
    getStatusLabel
  }
}
