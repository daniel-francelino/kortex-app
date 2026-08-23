import { GoalLifeCategory, GoalTimeCategory } from '~/types/goals'

export interface GoalTemplate {
  id: string
  title: string
  description: string
  emoji: string
  lifeCategory: GoalLifeCategory
  timeCategory: GoalTimeCategory
  tasks: string[]
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: 'read-books',
    title: 'Ler mais livros',
    description: 'Criar o hábito de leitura e terminar mais livros ao longo do ano.',
    emoji: '📚',
    lifeCategory: GoalLifeCategory.Learning,
    timeCategory: GoalTimeCategory.Quarterly,
    tasks: ['Escolher o primeiro livro', 'Definir um horário fixo de leitura', 'Terminar o primeiro livro']
  },
  {
    id: 'learn-language',
    title: 'Aprender um novo idioma',
    description: 'Chegar a um nível conversacional em um novo idioma.',
    emoji: '🗣️',
    lifeCategory: GoalLifeCategory.Learning,
    timeCategory: GoalTimeCategory.Yearly,
    tasks: ['Escolher o método de estudo', 'Praticar 15 minutos por dia', 'Ter a primeira conversa no idioma']
  },
  {
    id: 'run-5k',
    title: 'Correr 5km sem parar',
    description: 'Construir uma base de resistência através da corrida.',
    emoji: '🏃',
    lifeCategory: GoalLifeCategory.Health,
    timeCategory: GoalTimeCategory.Quarterly,
    tasks: ['Definir o plano de treino', 'Correr 3x por semana', 'Completar os 5km sem parar']
  },
  {
    id: 'sleep-routine',
    title: 'Melhorar a rotina de sono',
    description: 'Dormir e acordar em horários consistentes.',
    emoji: '😴',
    lifeCategory: GoalLifeCategory.Health,
    timeCategory: GoalTimeCategory.Monthly,
    tasks: ['Definir horário fixo para dormir', 'Reduzir telas antes de dormir', 'Manter a rotina por 30 dias']
  },
  {
    id: 'emergency-fund',
    title: 'Criar reserva de emergência',
    description: 'Guardar um valor equivalente a alguns meses de despesas.',
    emoji: '💰',
    lifeCategory: GoalLifeCategory.Finance,
    timeCategory: GoalTimeCategory.Yearly,
    tasks: ['Calcular o valor da reserva', 'Definir quanto guardar por mês', 'Abrir uma conta separada']
  },
  {
    id: 'reduce-debt',
    title: 'Quitar uma dívida',
    description: 'Organizar e eliminar uma dívida específica.',
    emoji: '📉',
    lifeCategory: GoalLifeCategory.Finance,
    timeCategory: GoalTimeCategory.Quarterly,
    tasks: ['Listar o valor total da dívida', 'Definir um plano de pagamento', 'Quitar a dívida']
  },
  {
    id: 'promotion',
    title: 'Buscar uma promoção',
    description: 'Desenvolver as habilidades e visibilidade necessárias para crescer na carreira.',
    emoji: '📈',
    lifeCategory: GoalLifeCategory.Career,
    timeCategory: GoalTimeCategory.Yearly,
    tasks: ['Conversar com o gestor sobre expectativas', 'Identificar habilidades a desenvolver', 'Documentar conquistas do período']
  },
  {
    id: 'side-project',
    title: 'Lançar um projeto pessoal',
    description: 'Tirar do papel um projeto que estava só na ideia.',
    emoji: '🚀',
    lifeCategory: GoalLifeCategory.Career,
    timeCategory: GoalTimeCategory.Quarterly,
    tasks: ['Definir o escopo mínimo viável', 'Reservar tempo semanal para o projeto', 'Lançar a primeira versão']
  },
  {
    id: 'reconnect',
    title: 'Reconectar com amigos',
    description: 'Fortalecer relações que ficaram distantes.',
    emoji: '🤝',
    lifeCategory: GoalLifeCategory.Relationships,
    timeCategory: GoalTimeCategory.Monthly,
    tasks: ['Listar pessoas para reconectar', 'Marcar um encontro ou ligação', 'Criar um hábito de contato recorrente']
  },
  {
    id: 'meditation',
    title: 'Criar prática de meditação',
    description: 'Desenvolver um momento diário de quietude e presença.',
    emoji: '🧘',
    lifeCategory: GoalLifeCategory.Spiritual,
    timeCategory: GoalTimeCategory.Monthly,
    tasks: ['Escolher um horário fixo', 'Meditar 5 minutos por dia', 'Aumentar gradualmente o tempo']
  }
]
