import { HabitDifficulty, HabitFrequency, HabitType } from '~/types/habits'

export interface HabitTemplate {
  id: string
  name: string
  description: string
  emoji: string
  category: string
  frequency: HabitFrequency
  customDays?: number[]
  difficulty: HabitDifficulty
  habitType?: HabitType
  obviousStrategy?: string
  attractiveStrategy?: string
  easyStrategy?: string
  satisfyingStrategy?: string
}

export const HABIT_TEMPLATES: HabitTemplate[] = [
  {
    id: 'drink-water',
    name: 'Beber mais água',
    description: 'Manter-se hidratado ao longo do dia.',
    emoji: '💧',
    category: 'Saúde',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Tiny,
    easyStrategy: 'Deixe uma garrafa de água sempre visível na mesa.'
  },
  {
    id: 'read-daily',
    name: 'Ler todos os dias',
    description: 'Criar o hábito de leitura, mesmo que poucas páginas.',
    emoji: '📚',
    category: 'Mente',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Normal,
    obviousStrategy: 'Deixe o livro sobre o travesseiro ou na mesa de cabeceira.'
  },
  {
    id: 'morning-exercise',
    name: 'Exercício matinal',
    description: 'Movimentar o corpo logo no início do dia.',
    emoji: '🏃',
    category: 'Saúde',
    frequency: HabitFrequency.Custom,
    customDays: [1, 2, 3, 4, 5],
    difficulty: HabitDifficulty.Hard,
    easyStrategy: 'Separe a roupa de treino na noite anterior.'
  },
  {
    id: 'meditate',
    name: 'Meditar',
    description: 'Um momento diário de quietude e presença.',
    emoji: '🧘',
    category: 'Mente',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Tiny,
    attractiveStrategy: 'Associe a um horário que já é rotina, como logo após acordar.'
  },
  {
    id: 'sleep-early',
    name: 'Dormir cedo',
    description: 'Manter um horário consistente para dormir.',
    emoji: '😴',
    category: 'Saúde',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Normal,
    easyStrategy: 'Reduza telas 30 minutos antes do horário definido.'
  },
  {
    id: 'no-sugar',
    name: 'Evitar açúcar',
    description: 'Reduzir o consumo de açúcar refinado.',
    emoji: '🍬',
    category: 'Saúde',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Hard,
    habitType: HabitType.Negative
  },
  {
    id: 'gratitude-journal',
    name: 'Diário de gratidão',
    description: 'Anotar algo pelo qual é grato todos os dias.',
    emoji: '🙏',
    category: 'Mente',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Tiny,
    satisfyingStrategy: 'Releia entradas antigas de vez em quando para reforçar o hábito.'
  },
  {
    id: 'plan-day',
    name: 'Planejar o dia',
    description: 'Revisar prioridades antes de começar a trabalhar.',
    emoji: '📝',
    category: 'Produtividade',
    frequency: HabitFrequency.Custom,
    customDays: [1, 2, 3, 4, 5],
    difficulty: HabitDifficulty.Tiny,
    obviousStrategy: 'Faça isso logo ao abrir o computador, antes de qualquer outra aba.'
  },
  {
    id: 'inbox-zero',
    name: 'Zerar caixa de entrada',
    description: 'Revisar e organizar e-mails pendentes.',
    emoji: '📧',
    category: 'Produtividade',
    frequency: HabitFrequency.Weekly,
    difficulty: HabitDifficulty.Normal
  },
  {
    id: 'call-family',
    name: 'Ligar para a família',
    description: 'Manter contato regular com pessoas queridas.',
    emoji: '📞',
    category: 'Relacionamentos',
    frequency: HabitFrequency.Weekly,
    difficulty: HabitDifficulty.Tiny
  },
  {
    id: 'walk-outside',
    name: 'Caminhar ao ar livre',
    description: 'Sair para uma caminhada curta.',
    emoji: '🚶',
    category: 'Saúde',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Tiny,
    easyStrategy: 'Comece com apenas 10 minutos — o objetivo é criar o hábito, não a distância.'
  },
  {
    id: 'learn-language',
    name: 'Praticar um idioma',
    description: 'Dedicar alguns minutos ao estudo de um novo idioma.',
    emoji: '🗣️',
    category: 'Mente',
    frequency: HabitFrequency.Daily,
    difficulty: HabitDifficulty.Normal,
    attractiveStrategy: 'Use um app com gamificação para tornar a prática mais recompensadora.'
  }
]
