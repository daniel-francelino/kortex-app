<script setup lang="ts">
import { motion } from 'motion-v'
import { PostHogEvent } from '~/types/analytics'

const { data: page } = await useAsyncData('index', () => queryCollection('index').first())
const { capture } = usePostHog()
const runtimeConfig = useRuntimeConfig()
const route = useRoute()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

const title = page.value?.seo?.title || page.value?.title
const description = page.value?.seo?.description || page.value?.description
const siteUrl = runtimeConfig.public.siteUrl?.replace(/\/$/, '') || 'https://kortex.app'
const canonicalUrl = `${siteUrl}${route.path}`
const ogImage = `${siteUrl}/icons/icon-512x512.png`

const jsonLd = computed(() => ({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  'name': 'Kortex',
  'applicationCategory': 'ProductivityApplication',
  'operatingSystem': 'Web',
  'inLanguage': 'pt-BR',
  'description': description,
  'url': canonicalUrl
}))

useSeoMeta({
  titleTemplate: '',
  title,
  ogTitle: title,
  description,
  ogDescription: description,
  keywords: 'sistema pessoal, produtividade pessoal, segundo cérebro, gestão de tarefas, hábitos, metas, notas conectadas',
  robots: 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1',
  ogType: 'website',
  ogUrl: canonicalUrl,
  ogLocale: 'pt_BR',
  ogImage,
  twitterTitle: title,
  twitterDescription: description,
  twitterImage: ogImage
})

useHead({
  link: [
    {
      rel: 'canonical',
      href: canonicalUrl
    }
  ],
  script: [
    {
      type: 'application/ld+json',
      innerHTML: JSON.stringify(jsonLd.value)
    }
  ]
})

const heroLinks = computed(() => (page.value?.hero?.links ?? []).map((link: Record<string, unknown>, index: number) => ({
  ...link,
  onClick: () => {
    capture(PostHogEvent.PublicHeroCtaClicked, {
      cta_index: index,
      location: 'hero',
      target: typeof link.to === 'string' ? link.to : undefined,
      target_label: typeof link.label === 'string' ? link.label : undefined
    })
  }
})))

const ctaProps = computed(() => {
  if (!page.value?.cta)
    return undefined

  return {
    ...page.value.cta,
    links: (page.value.cta.links ?? []).map((link: Record<string, unknown>, index: number) => ({
      ...link,
      onClick: () => {
        capture(PostHogEvent.PublicFinalCtaClicked, {
          cta_index: index,
          location: 'page-bottom',
          target: typeof link.to === 'string' ? link.to : undefined,
          target_label: typeof link.label === 'string' ? link.label : undefined
        })
      }
    }))
  }
})
</script>

<template>
  <div v-if="page" class="landing">
    <UContainer>
      <section class="landing-hero" aria-labelledby="hero-title">
        <div class="hero-orbit" aria-hidden="true" />
        <div class="eyebrow"><span class="status-dot" /> UM LUGAR PARA O SEU PRÓXIMO PASSO</div>
        <motion.div
          class="hero-content"
          :initial="{ y: reducedMotion ? 0 : 18 }"
          :animate="{ y: 0 }"
          :transition="{ duration: 0.65 }"
        >
          <h1 id="hero-title">{{ page.title }}<br><span>Mais espaço para você.</span></h1>
          <p class="hero-description">{{ page.description }}</p>
          <div class="hero-actions">
            <UButton
              v-for="(link, index) in heroLinks"
              :key="index"
              v-bind="link"
              class="landing-button"
            />
          </div>
          <p class="hero-note">Notas, tarefas e rotina. Finalmente no mesmo lugar.</p>
        </motion.div>
        <div class="hero-bottom">
          <span>SEU SISTEMA PESSOAL DE ORGANIZAÇÃO</span>
          <a href="#recursos" class="explore-link">Conheça o Kortex <UIcon name="i-lucide-arrow-down" /></a>
        </div>
      </section>

      <section id="recursos" class="landing-section" aria-labelledby="features-title">
        <div class="section-heading">
          <div><p class="eyebrow">01 / TUDO SE CONECTA</p><h2 id="features-title">{{ page.features.title }}</h2></div>
          <p>{{ page.features.description }}</p>
        </div>
        <div class="feature-grid">
          <motion.article
            v-for="(feature, index) in page.features.items"
            :key="feature.title"
            class="feature-card"
            :class="{ 'feature-card-wide': index === 0 || index === 5, 'feature-card-accent': index === 0 }"
            :initial="{ y: reducedMotion ? 0 : 20 }"
            :while-in-view="{ y: 0 }"
            :in-view-options="{ once: true, amount: 0.15 }"
            :transition="{ duration: 0.45, delay: reducedMotion ? 0 : (index % 3) * 0.05 }"
          >
            <div class="card-top"><UIcon :name="feature.icon" class="feature-icon" /><span>0{{ index + 1 }}</span></div>
            <div><h3>{{ feature.title }}</h3><p>{{ feature.description }}</p></div>
            <div v-if="index === 0" class="topic-tags" aria-label="Organize suas notas"><span>Ideias</span><span>Referências</span><span>Aprendizados</span></div>
            <div v-if="index === 5" class="reflection-line"><span>Capturar</span><UIcon name="i-lucide-arrow-right" /><span>Refletir</span><UIcon name="i-lucide-arrow-right" /><span>Evoluir</span></div>
          </motion.article>
        </div>
      </section>

      <section id="como-funciona" class="landing-section workflow-section" aria-labelledby="workflow-title">
        <div class="section-heading">
          <div><p class="eyebrow">02 / DA IDEIA À AÇÃO</p><h2 id="workflow-title">Organização que acompanha<br>a vida acontecendo.</h2></div>
          <p>Não precisa organizar tudo de uma vez. Comece com o que está na sua cabeça agora.</p>
        </div>
        <div class="workflow-grid">
          <article v-for="(section, index) in page.sections" :key="section.id" class="workflow-step">
            <span class="step-number">0{{ index + 1 }}</span>
            <h3>{{ section.title }}</h3>
            <p>{{ section.description }}</p>
            <span class="step-detail"><UIcon :name="section.features[0]?.icon || 'i-lucide-check'" />{{ section.features[0]?.title }}</span>
          </article>
        </div>
      </section>

      <section class="manifesto" aria-labelledby="manifesto-title">
        <p class="eyebrow">FEITO PARA A SUA VIDA REAL</p>
        <h2 id="manifesto-title">Você não precisa fazer mais.<br><span>Precisa de espaço para o que importa.</span></h2>
        <p>Um pensamento anotado. Uma prioridade definida. Um hábito retomado.<br class="hidden sm:block"> Pequenos passos também são progresso.</p>
        <div class="manifesto-values"><span><UIcon name="i-lucide-focus" /> Menos dispersão</span><span><UIcon name="i-lucide-route" /> Mais direção</span><span><UIcon name="i-lucide-repeat-2" /> No seu ritmo</span></div>
      </section>

      <section v-if="ctaProps" class="final-cta" aria-labelledby="cta-title">
        <div><p class="eyebrow">SEU PRÓXIMO PASSO COMEÇA AQUI</p><h2 id="cta-title">{{ ctaProps.title }}</h2><p>{{ ctaProps.description }}</p></div>
        <div class="final-actions">
          <UButton
            v-for="(link, index) in ctaProps.links"
            :key="index"
            v-bind="link"
            size="xl"
            class="landing-button"
          />
        </div>
      </section>
    </UContainer>
  </div>
</template>

<style scoped>
.landing { overflow: clip; background: var(--ui-bg); }
.landing-hero { position: relative; padding: 100px 0 0; isolation: isolate; }
.hero-orbit { position: absolute; z-index: -1; width: 650px; height: 650px; top: -140px; right: -300px; border: 1px solid color-mix(in srgb, var(--ui-primary) 15%, transparent); border-radius: 50%; box-shadow: 0 0 0 90px color-mix(in srgb, var(--ui-primary) 3%, transparent), 0 0 0 180px color-mix(in srgb, var(--ui-primary) 2%, transparent); pointer-events: none; }
.eyebrow { display: flex; align-items: center; gap: 10px; font-size: 11px; font-weight: 650; letter-spacing: 0.14em; color: var(--ui-text-muted); }
.status-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ui-primary); box-shadow: 0 0 0 5px color-mix(in srgb, var(--ui-primary) 10%, transparent); }
h1 { max-width: 1000px; margin-top: 30px; font-size: clamp(2.8rem, 6.7vw, 5.7rem); line-height: 1.04; letter-spacing: -0.065em; font-weight: 650; color: var(--ui-text-highlighted); text-wrap: balance; }
h1 span { color: var(--ui-primary); }
.hero-description { max-width: 580px; margin-top: 28px; color: var(--ui-text-muted); font-size: 19px; line-height: 1.75; }
.hero-actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 32px; }
.landing-button { min-height: 48px; padding-inline: 22px; border-radius: 10px; justify-content: center; }
.hero-note { margin-top: 16px; font-size: 12px; color: var(--ui-text-dimmed); }
.hero-bottom { display: flex; justify-content: space-between; gap: 16px; margin-top: 88px; padding: 24px 0; border-top: 1px solid var(--ui-border); border-bottom: 1px solid var(--ui-border); font-size: 10px; letter-spacing: 0.1em; color: var(--ui-text-muted); }
.explore-link { display: flex; align-items: center; gap: 12px; font-size: 12px; letter-spacing: normal; color: var(--ui-text-highlighted); }
.landing-section { padding-top: 104px; scroll-margin-top: 90px; }
.section-heading { display: flex; align-items: flex-end; justify-content: space-between; gap: 36px; margin-bottom: 36px; }
h2 { margin-top: 16px; color: var(--ui-text-highlighted); font-weight: 600; font-size: clamp(1.9rem, 3.6vw, 3rem); line-height: 1.16; letter-spacing: -0.045em; text-wrap: balance; }
.section-heading > p { max-width: 330px; color: var(--ui-text-muted); font-size: 15px; line-height: 1.8; }
.feature-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; }
.feature-card { display: flex; flex-direction: column; justify-content: space-between; gap: 34px; min-height: 248px; padding: 28px; border: 1px solid var(--ui-border); border-radius: 18px; background: color-mix(in srgb, var(--ui-bg-elevated) 30%, var(--ui-bg)); transition: border-color 180ms, background 180ms; }
.feature-card:hover { border-color: color-mix(in srgb, var(--ui-primary) 45%, var(--ui-border)); }
.feature-card-wide { grid-column: span 2; }
.feature-card-accent { background: color-mix(in srgb, var(--ui-primary) 7%, var(--ui-bg)); border-color: color-mix(in srgb, var(--ui-primary) 25%, var(--ui-border)); }
.card-top { display: flex; justify-content: space-between; align-items: center; color: var(--ui-text-dimmed); font-family: monospace; font-size: 11px; }
.feature-icon { width: 24px; height: 24px; color: var(--ui-primary); }
h3 { color: var(--ui-text-highlighted); font-size: 19px; line-height: 1.35; letter-spacing: -0.025em; font-weight: 600; }
.feature-card p, .workflow-step > p { margin-top: 12px; color: var(--ui-text-muted); font-size: 14px; line-height: 1.75; }
.topic-tags { display: flex; flex-wrap: wrap; gap: 8px; }
.topic-tags span { padding: 5px 12px; border-radius: 6px; border: 1px solid color-mix(in srgb, var(--ui-primary) 18%, transparent); font-size: 11px; color: var(--ui-text-muted); }
.reflection-line { display: flex; align-items: center; flex-wrap: wrap; gap: 16px; font-size: 12px; color: var(--ui-text-muted); }
.reflection-line > span:nth-child(even) { color: var(--ui-primary); }
.workflow-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-top: 1px solid var(--ui-border); }
.workflow-step { padding: 32px 32px 0 0; }
.workflow-step + .workflow-step { padding-left: 32px; border-left: 1px solid var(--ui-border); }
.step-number { display: block; margin-bottom: 32px; font-family: monospace; font-size: 13px; color: var(--ui-primary); }
.step-detail { display: flex; align-items: center; gap: 8px; margin-top: 28px; font-size: 12px; color: var(--ui-text-highlighted); }
.manifesto { padding: 110px 0; margin-top: 104px; border-top: 1px solid var(--ui-border); text-align: center; }
.manifesto .eyebrow { justify-content: center; }
.manifesto h2 { margin-top: 24px; }
.manifesto h2 span { color: var(--ui-text-dimmed); }
.manifesto > p:last-of-type { margin-top: 24px; color: var(--ui-text-muted); line-height: 1.8; font-size: 15px; }
.manifesto-values { display: flex; flex-wrap: wrap; justify-content: center; gap: 28px; margin-top: 34px; font-size: 12px; color: var(--ui-text-muted); }
.manifesto-values > span { display: flex; align-items: center; gap: 8px; }
.final-cta { display: flex; align-items: center; justify-content: space-between; gap: 32px; padding: 48px; margin-bottom: 88px; border-radius: 24px; border: 1px solid color-mix(in srgb, var(--ui-primary) 25%, var(--ui-border)); background: color-mix(in srgb, var(--ui-primary) 6%, var(--ui-bg)); }
.final-cta h2 { max-width: 600px; }
.final-cta p:last-child { max-width: 500px; margin-top: 18px; color: var(--ui-text-muted); line-height: 1.7; }
.final-actions { display: flex; flex-direction: column; gap: 12px; flex-shrink: 0; }
@media (max-width: 1023px) {
  .feature-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .feature-card-wide { grid-column: span 1; }
  .section-heading { align-items: flex-start; flex-direction: column; gap: 20px; }
  .section-heading > p { max-width: 560px; }
  .final-cta { align-items: flex-start; flex-direction: column; }
  .final-actions { flex-direction: row; flex-wrap: wrap; }
}
@media (max-width: 639px) {
  .landing-hero { padding-top: 64px; }
  .hero-description { font-size: 16px; }
  .hero-actions { flex-direction: column; }
  .hero-bottom { margin-top: 56px; flex-direction: column; }
  .landing-section { padding-top: 64px; }
  .feature-grid, .workflow-grid { grid-template-columns: minmax(0, 1fr); }
  .feature-card { min-height: 220px; padding: 24px; }
  .workflow-step, .workflow-step + .workflow-step { border-left: 0; border-bottom: 1px solid var(--ui-border); padding: 28px 0; }
  .step-number { margin-bottom: 20px; }
  .manifesto { margin-top: 64px; padding: 64px 0; }
  .manifesto-values { gap: 16px; }
  .final-cta { padding: 28px 24px; margin-bottom: 56px; }
  .final-actions { width: 100%; flex-direction: column; }
}
@media (prefers-reduced-motion: reduce) {
  .feature-card, .hero-content { transition: none; transform: none !important; }
}
</style>
