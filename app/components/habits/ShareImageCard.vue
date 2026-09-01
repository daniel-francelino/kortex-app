<script setup lang="ts">
import { DIFFICULTY_META, FREQUENCY_META, HABIT_TYPE_META } from '~/types/habits'
import type { SharedHabitCardData } from '~/types/habits'
import { formatDisplay } from '#shared/utils/dateTime'

export type ShareFormat = 'square'

const props = defineProps<{
  format?: ShareFormat
  userName?: string
  userHandle?: string
  userInitials?: string
  data: SharedHabitCardData
  date: string
}>()

const habit = computed(() => props.data.habit)

const difficultyLabel = computed(() =>
  DIFFICULTY_META[habit.value.difficulty as keyof typeof DIFFICULTY_META]?.label ?? habit.value.difficulty
)

const difficultyColor = computed(() => {
  const tone = DIFFICULTY_META[habit.value.difficulty as keyof typeof DIFFICULTY_META]?.color
  if (tone === 'success') return '#34d399'
  if (tone === 'warning') return '#f59e0b'
  return '#fb7185'
})

const frequencyLabel = computed(() =>
  FREQUENCY_META[habit.value.frequency as keyof typeof FREQUENCY_META]?.label ?? habit.value.frequency
)

const habitTypeLabel = computed(() =>
  HABIT_TYPE_META[habit.value.habitType as keyof typeof HABIT_TYPE_META]?.label ?? habit.value.habitType
)

const habitTypeAccent = computed(() => {
  const tone = HABIT_TYPE_META[habit.value.habitType as keyof typeof HABIT_TYPE_META]?.color
  return tone === 'error' ? '#fb7185' : '#2dd4bf'
})

const motivationalQuote = 'Um passo pequeno, repetido com consistência, muda a direção dos próximos meses.'

const createdAtLabel = computed(() => {
  const date = new Date(habit.value.createdAt)
  return Number.isNaN(date.getTime())
    ? ''
    : formatDisplay(date, "dd 'de' MMM'.' 'de' yyyy")
})

const shareDateLabel = computed(() => {
  const date = new Date(`${props.date}T12:00:00`)
  return formatDisplay(date, "d 'de' MMMM 'de' yyyy")
})

const completionTone = computed(() => {
  const rate = props.data.completionRate30d
  if (rate >= 80) return '#e7f76a'
  if (rate >= 50) return '#f6c95d'
  return '#ff8d8d'
})

const displayInitials = computed(() => props.userInitials || 'SB')
</script>

<template>
  <div class="share-card">
    <div class="share-card__pattern" />
    <div class="share-card__beam share-card__beam--left" />
    <div class="share-card__beam share-card__beam--right" />

    <div class="share-card__content">
      <header class="share-card__header">
        <div class="share-card__profile">
          <div class="share-card__avatar">
            {{ habit.avatarEmoji || displayInitials }}
          </div>
          <div class="share-card__profile-copy">
            <p class="share-card__eyebrow">
              {{ props.userName || 'Kortex' }}
            </p>
            <strong class="share-card__profile-name">Meu ciclo atual</strong>
          </div>
        </div>

        <div class="share-card__header-meta">
          <p class="share-card__date">
            {{ shareDateLabel }}
          </p>
        </div>
      </header>

      <section class="share-card__hero">
        <div class="share-card__hero-copy">
          <p class="share-card__hero-label">
            o hábito que está movendo sua fase
          </p>
          <h1 class="share-card__habit-name">
            {{ habit.name }}
          </h1>
          <p class="share-card__description">
            {{ motivationalQuote }}
          </p>
        </div>

        <div class="share-card__meter">
          <span class="share-card__meter-kicker">ritmo premium</span>
          <div class="share-card__meter-ring">
            <span class="share-card__meter-value" :style="{ color: completionTone }">{{ data.completionRate30d }}%</span>
          </div>
          <span class="share-card__meter-label">consistência 30d</span>
        </div>
      </section>

      <section class="share-card__metrics">
        <div class="share-card__metric">
          <span class="share-card__metric-kicker">Streak</span>
          <strong class="share-card__metric-value">{{ habit.streakCurrent }} dias</strong>
          <span class="share-card__metric-caption">sequência atual</span>
        </div>
        <div class="share-card__metric">
          <span class="share-card__metric-kicker">Últimos 7 dias</span>
          <strong class="share-card__metric-value">{{ data.completionRate7d }}%</strong>
          <span class="share-card__metric-caption">ritmo recente</span>
        </div>
        <div class="share-card__metric">
          <span class="share-card__metric-kicker">Check-ins 30d</span>
          <strong class="share-card__metric-value">{{ data.totalCompletions30d }}</strong>
          <span class="share-card__metric-caption">marcas concluídas</span>
        </div>
      </section>

      <section class="share-card__tags">
        <span class="share-card__tag">{{ frequencyLabel }}</span>
        <span class="share-card__tag" :style="{ borderColor: difficultyColor, color: difficultyColor }">{{ difficultyLabel }}</span>
        <span class="share-card__tag" :style="{ borderColor: habitTypeAccent, color: habitTypeAccent }">{{ habitTypeLabel }}</span>
        <span v-if="habit.identityName" class="share-card__tag">{{ habit.identityName }}</span>
        <span v-if="habit.scheduledTime" class="share-card__tag">{{ habit.scheduledTime }}</span>
      </section>

      <footer class="share-card__footer">
        <div class="share-card__footer-line">
          <span class="share-card__footer-copy">Começou em {{ createdAtLabel || 'um novo ciclo' }}</span>
          <span class="share-card__footer-copy">Kortex</span>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.share-card {
  position: relative;
  width: 1080px;
  height: 1080px;
  overflow: hidden;
  color: #fbfbf8;
  background:
    radial-gradient(circle at top left, rgba(231, 247, 106, 0.1) 0%, rgba(231, 247, 106, 0) 26%),
    radial-gradient(circle at bottom right, rgba(103, 175, 255, 0.12) 0%, rgba(103, 175, 255, 0) 28%),
    linear-gradient(135deg, #06080c 0%, #0f1218 52%, #191d24 100%);
  font-family: 'Space Grotesk', 'Inter', 'Segoe UI', sans-serif;
}

.share-card__pattern {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.035) 1px, transparent 1px),
    radial-gradient(circle at center, rgba(255, 255, 255, 0.08) 0, rgba(255, 255, 255, 0) 54%);
  background-size: 44px 44px, 44px 44px, 100% 100%;
  background-position: center;
  mask-image: linear-gradient(180deg, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0.22));
  opacity: 0.42;
}

.share-card__beam {
  position: absolute;
  width: 420px;
  height: 1200px;
  transform: rotate(22deg);
  filter: blur(40px);
  opacity: 0.16;
}

.share-card__beam--left {
  top: -120px;
  left: -120px;
  background: linear-gradient(180deg, rgba(231, 247, 106, 0.6), rgba(231, 247, 106, 0));
}

.share-card__beam--right {
  top: -160px;
  right: -120px;
  background: linear-gradient(180deg, rgba(103, 175, 255, 0.45), rgba(103, 175, 255, 0));
}

.share-card__content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 48px;
  box-sizing: border-box;
}

.share-card__header,
.share-card__footer-line {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}

.share-card__profile {
  display: flex;
  align-items: center;
  gap: 20px;
}

.share-card__avatar {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 88px;
  height: 88px;
  border-radius: 999px;
  background: linear-gradient(135deg, #edf26b, #9cd4ff);
  color: #0b0f16;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -0.05em;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.32);
}

.share-card__profile-copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.share-card__eyebrow,
.share-card__hero-label,
.share-card__meter-kicker,
.share-card__metric-kicker,
.share-card__footer-copy,
.share-card__date {
  margin: 0;
  font-size: 16px;
  line-height: 1.2;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(244, 244, 238, 0.62);
}

.share-card__profile-name {
  font-size: 34px;
  line-height: 1;
  letter-spacing: -0.05em;
}

.share-card__handle {
  margin: 0;
  font-size: 24px;
  color: rgba(244, 244, 238, 0.76);
  letter-spacing: -0.03em;
}

.share-card__header-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.share-card__hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 240px;
  gap: 28px;
  align-items: end;
  margin-top: 36px;
}

.share-card__habit-name {
  margin: 12px 0 14px;
  font-size: 96px;
  line-height: 0.9;
  letter-spacing: -0.09em;
  max-width: 8ch;
  text-wrap: balance;
}

.share-card__description {
  margin: 0;
  max-width: 580px;
  font-size: 28px;
  line-height: 1.24;
  color: rgba(251, 251, 248, 0.84);
}

.share-card__meter {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
}

.share-card__meter-ring {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 220px;
  height: 220px;
  border-radius: 999px;
  border: 14px solid rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 20px rgba(6, 8, 12, 0.9);
  background: radial-gradient(circle at center, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0));
}

.share-card__meter-value {
  font-size: 70px;
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.06em;
}

.share-card__meter-label {
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: rgba(244, 244, 238, 0.7);
}

.share-card__metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  margin-top: 36px;
}

.share-card__metric {
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 170px;
  padding: 26px;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 28px;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.015));
}

.share-card__metric-value {
  font-size: 60px;
  line-height: 0.9;
  letter-spacing: -0.05em;
}

.share-card__metric-caption {
  font-size: 21px;
  color: rgba(251, 251, 248, 0.86);
}

.share-card__tags {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 20px;
}

.share-card__tag {
  display: inline-flex;
  align-items: center;
  min-height: 56px;
  padding: 0 22px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.04);
  font-size: 24px;
  letter-spacing: -0.02em;
}

.share-card__cta {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 20px;
  margin-top: 20px;
  padding: 22px 26px;
  border-radius: 28px;
  background: linear-gradient(135deg, rgba(231, 247, 106, 0.11), rgba(255, 255, 255, 0.03));
  border: 1px solid rgba(231, 247, 106, 0.18);
}

.share-card__cta-title {
  margin: 0;
  font-size: 33px;
  line-height: 1.02;
  letter-spacing: -0.05em;
}

.share-card__cta-copy {
  margin: 10px 0 0;
  max-width: 510px;
  font-size: 22px;
  color: rgba(251, 251, 248, 0.78);
}

.share-card__cta-pill {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  min-height: 62px;
  padding: 0 22px;
  border-radius: 999px;
  background: #edf26b;
  color: #0b0f16;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.03em;
  white-space: nowrap;
}

.share-card__cta-dot {
  width: 14px;
  height: 14px;
  border-radius: 999px;
  background: #0b0f16;
}

.share-card__footer {
  margin-top: auto;
  padding-top: 28px;
}
</style>
