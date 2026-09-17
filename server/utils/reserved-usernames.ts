/**
 * A username lives at the site root (`kortex.app/{username}`) — Vue Router
 * always prefers a static route over the `/[username]` catch-all, so this
 * list isn't fixing a routing conflict, it's preventing a *silent dead end*:
 * without it, someone could register a username identical to an existing (or
 * future) top-level page and their profile would just never be reachable.
 *
 * IMPORTANT: every time a new top-level static route is added under
 * app/pages/ (e.g. a new marketing page), add its path segment here BEFORE
 * it ships — otherwise any user who already registered that username loses
 * their profile with no error, no warning. See docs/appointments/
 * PLANO_USERNAME_PERFIL_PUBLICO.md §3.2.
 */
export const RESERVED_USERNAMES = new Set([
  // Rotas estáticas reais em app/pages/ hoje
  'agendar', 'app', 'blog', 'brand', 'changelog', 'login', 'pricing', 'share', 'signup',
  // Infraestrutura do Nitro/Nuxt e do próprio domínio
  'api', 'admin', 'assets', 'static', 'public', 'cdn', 'www', 'mail', 'email',
  'favicon.ico', 'robots.txt', 'sitemap', 'sitemap.xml', 'manifest.json',
  // Páginas prováveis no roadmap (evita ter que migrar um username depois)
  'settings', 'dashboard', 'help', 'support', 'docs', 'status', 'terms', 'privacy',
  'about', 'contact', 'careers', 'security',
  // Genéricos/confusos
  'u', 'me', 'home', 'null', 'undefined', 'true', 'false', 'root', 'test', 'kortex'
])

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(value)
}
