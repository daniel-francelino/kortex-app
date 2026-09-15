<script setup lang="ts">
import { PostHogEvent } from '~/types/analytics'

const { capture } = usePostHog()
const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

function trackLink(label: string, to: string) {
  capture(PostHogEvent.PublicFooterCtaClicked, {
    location: 'footer',
    target: to,
    target_label: label
  })
}

function backToTop() {
  window.scrollTo({ top: 0, behavior: reducedMotion.value ? 'instant' : 'smooth' })
}

const columns = [{
  label: 'Produto',
  children: [
    { label: 'Recursos', to: '/#recursos' },
    { label: 'Como funciona', to: '/#como-funciona' },
    { label: 'Planos mensais', to: '/pricing' },
    { label: 'Novidades', to: '/changelog' }
  ]
}, {
  label: 'Aprenda',
  children: [
    { label: 'Primeiros passos', to: '/docs/getting-started' },
    { label: 'Documentação', to: '/docs' },
    { label: 'Blog', to: '/blog' }
  ]
}, {
  label: 'Sua conta',
  children: [
    { label: 'Abrir meu Kortex', to: '/app' },
    { label: 'Minha assinatura', to: '/app/settings/subscription' },
    { label: 'Enviar feedback', to: '/app/feedback' }
  ]
}]
</script>

<template>
  <footer class="app-footer" aria-label="Rodapé do Kortex">
    <UContainer>
      <div class="footer-grid">
        <div class="footer-brand">
          <NuxtLink
            to="/"
            aria-label="Kortex — início"
            class="brand-link"
            @click="trackLink('Início', '/')"
          >
            <AppLogo />
          </NuxtLink>
          <p class="brand-heading">Sua vida tem contexto.<br>Seu sistema também.</p>
          <p class="brand-description">Reúna ideias, prioridades e rotina em um só lugar. Mais clareza para decidir o próximo passo.</p>
          <p class="product-scope">Notas <span aria-hidden="true">/</span> Tarefas <span aria-hidden="true">/</span> Hábitos <span aria-hidden="true">/</span> Diário</p>
          <div class="brand-actions">
            <UButton
              to="/signup"
              label="Criar minha conta"
              trailing-icon="i-lucide-arrow-right"
              class="min-h-11 rounded-lg px-4"
              @click="trackLink('Criar minha conta', '/signup')"
            />
            <NuxtLink to="/login" class="footer-link login-link" @click="trackLink('Entrar', '/login')">Já tenho conta</NuxtLink>
          </div>
        </div>
        <nav
          v-for="column in columns"
          :key="column.label"
          :aria-label="`${column.label} no rodapé`"
          class="footer-column"
        >
          <h2>{{ column.label }}</h2>
          <ul>
            <li v-for="link in column.children" :key="link.to">
              <NuxtLink
                :to="link.to"
                class="footer-link"
                @click="trackLink(link.label, link.to)"
              >{{ link.label }}</NuxtLink>
            </li>
          </ul>
          <p v-if="column.label === 'Sua conta'" class="account-note">Acesse com sua conta Kortex.</p>
        </nav>
      </div>
      <div class="footer-bottom">
        <p>© {{ new Date().getFullYear() }} Kortex</p>
        <p class="footer-signature">Capturar. Organizar. Agir. Refletir.</p>
        <UButton
          label="Voltar ao topo"
          trailing-icon="i-lucide-arrow-up"
          color="neutral"
          variant="ghost"
          size="sm"
          class="min-h-11"
          @click="backToTop"
        />
      </div>
    </UContainer>
  </footer>
</template>

<style scoped>
.app-footer { position: relative; border-top: 1px solid var(--ui-border); background: color-mix(in srgb, var(--ui-bg-elevated) 20%, var(--ui-bg)); }
.app-footer::before { content: ''; position: absolute; top: -1px; left: 0; width: 100%; height: 1px; background: linear-gradient(90deg, transparent 10%, color-mix(in srgb, var(--ui-primary) 45%, transparent), transparent 90%); pointer-events: none; }
.footer-grid { display: grid; grid-template-columns: minmax(0, 1.8fr) repeat(3, minmax(0, 1fr)); gap: 48px; padding-block: 64px 56px; }
.brand-link { display: inline-flex; min-height: 44px; align-items: center; border-radius: 8px; }
.brand-heading { margin-top: 22px; color: var(--ui-text-highlighted); font-size: 24px; line-height: 1.3; letter-spacing: -.035em; font-weight: 600; }
.brand-description { max-width: 320px; margin-top: 14px; color: var(--ui-text-muted); font-size: 13px; line-height: 1.8; }
.product-scope { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; font-size: 10px; color: var(--ui-text-muted); }
.product-scope span { color: var(--ui-primary); }
.brand-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin-top: 24px; }
.footer-column { padding-top: 14px; }
.footer-column h2 { font-size: 11px; font-weight: 650; letter-spacing: .1em; text-transform: uppercase; color: var(--ui-text-highlighted); }
.footer-column ul { margin-top: 18px; }
.footer-link { display: inline-flex; align-items: center; min-height: 44px; font-size: 13px; line-height: 1.5; color: var(--ui-text-muted); border-radius: 4px; transition: color 160ms; }
.footer-link:hover { color: var(--ui-primary); }
.footer-link:focus-visible, .brand-link:focus-visible { outline: 2px solid var(--ui-primary); outline-offset: 5px; }
.login-link { font-size: 12px; }
.account-note { margin-top: 12px; font-size: 11px; line-height: 1.7; color: var(--ui-text-muted); }
.footer-bottom { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px 24px; border-top: 1px solid var(--ui-border); padding-block: 18px; font-size: 11px; color: var(--ui-text-muted); }
.footer-signature { letter-spacing: .025em; }
@media (max-width: 1023px) { .footer-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 32px; padding-block: 48px; } .footer-brand { grid-column: 1 / -1; } .brand-description { max-width: 460px; } }
@media (max-width: 479px) { .footer-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 24px; padding-block: 40px; } .footer-column:last-child { grid-column: 1 / -1; } .footer-column:last-child ul { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; } .footer-signature { width: 100%; order: 1; } }
@media (prefers-reduced-motion: reduce) { .footer-link { transition: none; } }
</style>
