<script setup lang="ts">
import { motion } from 'motion-v'

const { data: page } = await useAsyncData('changelog', () => queryCollection('changelog').first())
const { data: versions, status, error, refresh } = await useAsyncData('public-changelog-versions', () => queryCollection('versions')
  .where('published', '=', true)
  .order('date', 'DESC')
  .order('stem', 'ASC')
  .all())

const title = page.value?.seo?.title || page.value?.title || 'Novidades do Kortex'
const description = page.value?.seo?.description || page.value?.description || 'Acompanhe as melhorias e correções do Kortex.'
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const selected = ref('all')
const filters = [
  { value: 'all', label: 'Todos os meses' },
  { value: 'updates', label: 'Com novidades' },
  { value: 'empty', label: 'Sem registros' }
]
const filteredVersions = computed(() => (versions.value ?? []).filter(version => selected.value === 'all' || (selected.value === 'updates' ? version.hasUpdates : !version.hasUpdates)))
const latest = computed(() => versions.value?.find(version => version.hasUpdates))
function formatMonth(value: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}
function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(value))
}
function entryId(stem: string) {
  return `atualizacao-${stem.split('/').pop()}`
}

useSeoMeta({
  title,
  ogTitle: title,
  description,
  ogDescription: description
})

defineOgImageComponent('Saas')
</script>

<template>
  <UContainer class="changelog-page">
    <header class="changelog-hero">
      <p class="eyebrow"><span class="status-dot" /> EM CONSTANTE EVOLUÇÃO</p>
      <h1>Pequenas mudanças.<br><span>Uma rotina melhor.</span></h1>
      <p class="hero-description">{{ page?.description || description }}</p>
      <p v-if="latest" class="latest-date"><UIcon name="i-lucide-clock-3" /> Histórico atualizado até {{ formatDate(latest.date) }}</p>
    </header>

    <div class="changelog-layout">
      <div class="min-w-0">
        <div class="filter-bar" role="group" aria-label="Filtrar atualizações">
          <button
            v-for="filter in filters"
            :key="filter.value"
            type="button"
            :aria-pressed="selected === filter.value"
            :class="{ selected: selected === filter.value }"
            @click="selected = filter.value"
          >{{ filter.label }}</button>
        </div>
        <p class="sr-only" aria-live="polite">{{ filteredVersions.length }} meses encontrados.</p>
        <div v-if="status === 'pending'" class="space-y-5 py-8" role="status" aria-label="Carregando novidades">
          <USkeleton class="h-48 rounded-2xl" /><USkeleton class="h-48 rounded-2xl" />
        </div>
        <div v-else-if="error" class="empty-state" role="alert">
          <h2>Não foi possível carregar as novidades.</h2>
          <UButton label="Tentar novamente" variant="outline" class="mt-5" @click="refresh()" />
        </div>
        <div v-else-if="!filteredVersions.length" class="empty-state">
          <UIcon name="i-lucide-clock-3" class="size-7 text-primary" />
          <h2>As próximas novidades aparecem aqui.</h2>
          <p>Enquanto isso, explore os recursos disponíveis no Kortex.</p>
          <UButton to="/blog" label="Explorar o blog" variant="outline" class="mt-5" />
        </div>
        <div v-else class="timeline">
          <motion.article
            v-for="version in filteredVersions"
            :id="entryId(version.stem)"
            :key="version.id"
            class="release"
            :class="{ quiet: !version.hasUpdates }"
            :initial="{ y: reducedMotion ? 0 : 14 }"
            :while-in-view="{ y: 0 }"
            :in-view-options="{ once: true }"
            :transition="{ duration: 0.4 }"
          >
            <div class="release-meta">
              <time :datetime="version.month || new Date(version.date).toISOString().slice(0, 10)">{{ formatMonth(version.date) }}</time>
              <span v-if="version.id === latest?.id" class="latest-badge">Mais recente</span>
            </div>
            <div class="release-card">
              <div class="release-tags">
                <span class="category"><UIcon :name="version.hasUpdates ? 'i-lucide-sparkles' : 'i-lucide-calendar'" />{{ version.hasUpdates ? 'Resumo mensal' : 'Sem registros' }}</span>
                <span v-if="version.partial" class="area">Mês em andamento</span>
                <span v-for="area in version.areas" :key="area" class="area">{{ area }}</span>
              </div>
              <h2><a :href="`#${entryId(version.stem)}`">{{ version.title }}</a></h2>
              <p class="release-description">{{ version.description }}</p>
              <div class="release-body"><ContentRenderer :value="version" /></div>
              <UButton
                v-if="version.action"
                :to="version.action.to"
                :label="version.action.label"
                trailing-icon="i-lucide-arrow-up-right"
                color="neutral"
                variant="outline"
                class="mt-6 min-h-11 rounded-lg"
              />
            </div>
          </motion.article>
        </div>
      </div>

      <aside class="changelog-aside">
        <div class="aside-card">
          <UIcon name="i-lucide-message-circle" class="size-6 text-primary" />
          <h2>Sua rotina ajuda<br>a melhorar o Kortex.</h2>
          <p>Encontrou algo que pode funcionar melhor? Conte para nós pelo espaço de feedback dentro do app.</p>
          <UButton to="/app/feedback" label="Enviar uma sugestão" trailing-icon="i-lucide-arrow-right" variant="link" class="min-h-11 px-0" />
        </div>
        <div class="aside-help">
          <h2>Chegando agora?</h2>
          <p>Encontre ideias práticas para organizar suas notas, seus hábitos e sua rotina.</p>
          <NuxtLink to="/blog" class="help-link">Explorar o blog <UIcon name="i-lucide-arrow-up-right" /></NuxtLink>
        </div>
      </aside>
    </div>
  </UContainer>
</template>

<style scoped>
.changelog-page { padding-bottom: 88px; }
.changelog-hero { padding: 88px 0 56px; }
.eyebrow { display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 600; letter-spacing: .14em; color: var(--ui-text-muted); }
.status-dot { width: 7px; height: 7px; background: var(--ui-primary); border-radius: 50%; box-shadow: 0 0 0 5px color-mix(in srgb, var(--ui-primary) 10%, transparent); }
h1 { margin-top: 28px; font-size: clamp(2.6rem, 5.8vw, 4.8rem); line-height: 1.06; letter-spacing: -.055em; font-weight: 650; color: var(--ui-text-highlighted); }
h1 span { color: var(--ui-primary); }
.hero-description { max-width: 590px; margin-top: 24px; font-size: 17px; line-height: 1.8; color: var(--ui-text-muted); }
.latest-date { display: flex; align-items: center; gap: 8px; margin-top: 26px; font-size: 12px; color: var(--ui-text-dimmed); }
.changelog-layout { display: grid; grid-template-columns: minmax(0, 1fr) 270px; gap: 64px; }
.filter-bar { display: flex; flex-wrap: wrap; gap: 8px; padding: 18px 0; border-block: 1px solid var(--ui-border); }
.filter-bar button { min-height: 44px; padding: 8px 14px; border: 1px solid transparent; border-radius: 8px; font-size: 12px; color: var(--ui-text-muted); cursor: pointer; }
.filter-bar button:hover { background: var(--ui-bg-elevated); }
.filter-bar button.selected { background: color-mix(in srgb, var(--ui-primary) 9%, transparent); border-color: color-mix(in srgb, var(--ui-primary) 25%, transparent); color: var(--ui-text-highlighted); }
.release { position: relative; margin: 32px 0 0 8px; padding: 0 0 8px 28px; border-left: 1px solid var(--ui-border); scroll-margin-top: 100px; }
.release::before { content: ''; position: absolute; top: 5px; left: -5px; width: 9px; height: 9px; border-radius: 50%; background: var(--ui-primary); box-shadow: 0 0 0 5px var(--ui-bg); }
.release-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 18px; font-size: 12px; color: var(--ui-text-muted); }
.latest-badge { font-size: 10px; color: var(--ui-text-highlighted); }
.release-card { padding: 28px; border: 1px solid var(--ui-border); border-radius: 18px; }
.release-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
.category { display: inline-flex; align-items: center; gap: 6px; padding: 5px 9px; border-radius: 6px; color: var(--ui-text-highlighted); background: color-mix(in srgb, var(--ui-primary) 10%, transparent); font-size: 11px; }
.quiet::before { background: var(--ui-text-dimmed); }
.quiet .release-card { border-style: dashed; }
.quiet .category { background: var(--ui-bg-elevated); color: var(--ui-text-muted); }
.quiet .release-card h2 { font-size: 20px; }
.release-meta time { text-transform: capitalize; }
.area { font-size: 11px; color: var(--ui-text-dimmed); }
.release-card h2 { margin-top: 18px; font-size: 25px; line-height: 1.25; letter-spacing: -.035em; font-weight: 600; color: var(--ui-text-highlighted); }
.release-card h2 a:hover { color: var(--ui-primary); }
.release-description { margin-top: 12px; color: var(--ui-text-muted); font-size: 15px; line-height: 1.75; }
.release-body { margin-top: 24px; padding-top: 8px; border-top: 1px solid var(--ui-border); font-size: 14px; line-height: 1.8; color: var(--ui-text-muted); }
.release-body :deep(p), .release-body :deep(ul) { margin-block: 16px; font-size: inherit; line-height: inherit; }
.release-body :deep(ul) { padding-left: 20px; list-style: disc; }
.release-body :deep(li) { margin-block: 10px; }
.release-body :deep(strong) { color: var(--ui-text-highlighted); font-weight: 600; }
.changelog-aside { align-self: start; position: sticky; top: 100px; padding-top: 18px; }
.aside-card { border-radius: 16px; padding: 24px; border: 1px solid color-mix(in srgb, var(--ui-primary) 20%, var(--ui-border)); background: color-mix(in srgb, var(--ui-primary) 4%, var(--ui-bg)); }
.aside-card h2 { margin-top: 18px; font-size: 20px; line-height: 1.35; letter-spacing: -.03em; font-weight: 600; color: var(--ui-text-highlighted); }
.aside-card p, .aside-help p { font-size: 13px; line-height: 1.8; color: var(--ui-text-muted); margin: 14px 0; }
.aside-help { padding: 28px 8px; }
.aside-help h2 { font-size: 14px; font-weight: 600; color: var(--ui-text-highlighted); }
.help-link { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; font-size: 12px; color: var(--ui-text-highlighted); }
.empty-state { padding: 48px 24px; text-align: center; }
.empty-state h2 { font-size: 18px; margin-top: 16px; color: var(--ui-text-highlighted); }
.empty-state p { margin-top: 12px; color: var(--ui-text-muted); font-size: 14px; }
@media (max-width: 1023px) { .changelog-layout { grid-template-columns: minmax(0, 1fr); gap: 36px; } .changelog-aside { position: static; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; } }
@media (max-width: 639px) { .changelog-hero { padding: 56px 0 36px; } .release { padding-left: 18px; } .release-card { padding: 22px 18px; } .release-card h2 { font-size: 22px; } .changelog-aside { grid-template-columns: minmax(0, 1fr); } .changelog-page { padding-bottom: 48px; } }
@media (prefers-reduced-motion: reduce) { .release { transform: none !important; } }
</style>
