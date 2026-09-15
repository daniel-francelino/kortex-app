// Opt-in, local-only layout recording. Never capture DOM text, input values or API data.
export const CSS_DEBUG_ENABLED = 'kortex:css-debug:enabled'
const STORAGE_KEY = 'kortex:css-debug:report:v1'
const LIMIT = 90
const PERSISTED_LIMIT = 15
const selectors = [
  'html', 'body', '#__nuxt', '.kortex-app-shell', '.app-content-with-bottom-nav',
  '.mobile-bottom-nav', '.mobile-bottom-nav > nav', '.mobile-bottom-nav > nav > *',
  '.mobile-bottom-nav a', '.kortex-app-sidebar', '[data-slot="panel"]',
  '.app-content-with-bottom-nav [data-slot="root"]',
  '.app-content-with-bottom-nav [data-slot="body"]', '[data-scroll-body]'
]
const properties = (`display position top right bottom left width height min-height max-height
  min-width max-width box-sizing margin-top margin-bottom padding-top padding-right padding-bottom
  padding-left border-top-width border-bottom-width overflow overflow-x overflow-y overscroll-behavior
  overscroll-behavior-y scroll-padding-top scroll-padding-bottom flex flex-direction flex-shrink
  flex-grow flex-basis align-items justify-content gap row-gap transform translate scale zoom
  transform-origin perspective filter backdrop-filter contain content-visibility isolation z-index
  opacity visibility pointer-events touch-action background-color font-size line-height
  -webkit-overflow-scrolling -webkit-text-size-adjust`).split(/\s+/)
const variables = [
  '--safe-area-top', '--safe-area-bottom', '--safe-area-left', '--safe-area-right',
  '--app-visual-height', '--app-visual-offset-top', '--pwa-standalone-bottom-bleed',
  '--mobile-bottom-nav-extra-background', '--mobile-bottom-nav-bar-height',
  '--mobile-bottom-nav-safe-padding', '--mobile-bottom-nav-height',
  '--mobile-sidebar-safe-area-top', '--mobile-sidebar-safe-area-bottom', '--ui-header-height'
]

function label(element: Element | null): string | null {
  if (!element) return null
  return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}${Array.from(element.classList).map(c => `.${c}`).join('')}`.slice(0, 700)
}

function rect(element: Element) {
  const r = element.getBoundingClientRect()
  return { x: r.x, y: r.y, top: r.top, right: r.right, bottom: r.bottom, left: r.left, width: r.width, height: r.height }
}

function styles(element: Element, pseudo?: string, full = false) {
  const css = getComputedStyle(element, pseudo)
  const names = pseudo
    ? ['display', 'position', 'top', 'bottom', 'left', 'right', 'width', 'height', 'padding-bottom', 'margin-bottom', 'transform', 'background-color', 'z-index', 'pointer-events']
    : full ? Array.from(new Set([...Array.from(css), ...variables])) : [...properties, ...variables]
  // Exclude URL-valued styles (e.g. profile/background images).
  return Object.fromEntries(names.map(name => [name, css.getPropertyValue(name)]).filter(([, value]) => !value?.includes('url(')))
}

function measure(element: Element, full = false) {
  return {
    element: label(element), parent: label(element.parentElement), rect: rect(element),
    inlineStyle: element.getAttribute('style')?.replace(/url\([^)]*\)/g, 'url([omitted])') ?? null,
    clientHeight: element.clientHeight, clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight, scrollWidth: element.scrollWidth,
    scrollTop: element.scrollTop, scrollLeft: element.scrollLeft,
    offsetHeight: element instanceof HTMLElement ? element.offsetHeight : null,
    offsetTop: element instanceof HTMLElement ? element.offsetTop : null,
    offsetParent: element instanceof HTMLElement ? label(element.offsetParent) : null,
    styles: styles(element, undefined, full),
    before: styles(element, '::before'), after: styles(element, '::after')
  }
}

function targets() {
  const found = new Set<Element>()
  for (const selector of selectors) {
    for (const element of Array.from(document.querySelectorAll(selector)).slice(0, 12)) {
      if (!element.closest('[data-css-debug]')) found.add(element)
    }
  }
  let parent = document.querySelector('.mobile-bottom-nav')?.parentElement
  while (parent) {
    found.add(parent)
    parent = parent.parentElement
  }
  return Array.from(found).slice(0, 45)
}

function environment() {
  const nav = navigator as Navigator & { standalone?: boolean }
  return {
    userAgent: nav.userAgent, platform: nav.platform, maxTouchPoints: nav.maxTouchPoints,
    standalone: nav.standalone ?? null, devicePixelRatio: devicePixelRatio,
    screen: { width: screen.width, height: screen.height, availWidth: screen.availWidth, availHeight: screen.availHeight,
      orientation: screen.orientation?.type, angle: screen.orientation?.angle },
    media: Object.fromEntries([
      '(display-mode: standalone)', '(display-mode: fullscreen)', '(display-mode: browser)',
      '(max-width: 1023px)', '(orientation: portrait)', '(pointer: coarse)', '(prefers-reduced-motion: reduce)'
    ].map(query => [query, matchMedia(query).matches])),
    supports: Object.fromEntries(['height: 100dvh', 'height: 100svh', 'height: 100lvh',
      'padding-bottom: env(safe-area-inset-bottom)', '-webkit-touch-callout: none'].map(rule => [rule, CSS.supports(rule)])),
    meta: Array.from(document.querySelectorAll('meta[name="viewport"], meta[name^="apple-mobile-web-app"], meta[name="theme-color"]'))
      .map(element => ({ name: element.getAttribute('name'), content: element.getAttribute('content') })),
    serviceWorker: navigator.serviceWorker?.controller ? {
      script: new URL(navigator.serviceWorker.controller.scriptURL).pathname,
      state: navigator.serviceWorker.controller.state
    } : null,
    stylesheets: Array.from(document.styleSheets).map(sheet => ({
      href: sheet.href ? new URL(sheet.href).pathname : 'inline', disabled: sheet.disabled, media: sheet.media.mediaText
    })),
    scripts: Array.from(document.scripts).filter(script => script.src).map(script => new URL(script.src).pathname),
    timeOrigin: performance.timeOrigin
  }
}

export function startCssDiagnostics(onUpdate: (count: number) => void) {
  const probes = document.createElement('div')
  probes.dataset.cssDebug = 'probes'
  probes.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;contain:strict;'
  const units = ['100vh', '100dvh', '100svh', '100lvh']
  for (const unit of units) {
    const probe = document.createElement('div')
    probe.style.cssText = `position:fixed;top:0;left:0;width:0;height:${unit};pointer-events:none;`
    probes.append(probe)
  }
  const safe = document.createElement('div')
  safe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;box-sizing:content-box;padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px);'
  probes.append(safe)
  document.body.append(probes)

  function snapshot(reason: string) {
    const vv = window.visualViewport
    const nav = document.querySelector('.mobile-bottom-nav')
    const navRect = nav?.getBoundingClientRect()
    const innerNav = nav?.querySelector('nav')?.getBoundingClientRect()
    const visualBottom = (vv?.offsetTop ?? 0) + (vv?.height ?? innerHeight)
    return {
      time: new Date().toISOString(), elapsedMs: Math.round(performance.now()), reason,
      path: location.pathname, visibility: document.visibilityState, focus: label(document.activeElement),
      orientation: screen.orientation?.type ?? null,
      standalone: matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
      fontStatus: document.fonts?.status,
      window: { innerWidth, innerHeight, outerWidth, outerHeight, scrollX, scrollY },
      visualViewport: vv ? { width: vv.width, height: vv.height, offsetTop: vv.offsetTop,
        offsetLeft: vv.offsetLeft, pageTop: vv.pageTop, pageLeft: vv.pageLeft, scale: vv.scale } : null,
      viewportUnits: Object.fromEntries(units.map((unit, i) => [unit, rect(probes.children[i]!)])),
      safeArea: styles(safe),
      gaps: navRect ? {
        windowBottomMinusNavBottom: innerHeight - navRect.bottom,
        visualBottomMinusNavBottom: visualBottom - navRect.bottom,
        documentClientBottomMinusNavBottom: document.documentElement.clientHeight - navRect.bottom,
        navBottomMinusInnerNavBottom: innerNav ? navRect.bottom - innerNav.bottom : null,
        navHeightMinusInnerNavHeight: innerNav ? navRect.height - innerNav.height : null,
        documentScrollHeightMinusClientHeight: document.documentElement.scrollHeight - document.documentElement.clientHeight
      } : null,
      elements: targets().map(element => measure(element))
    }
  }

  type Snapshot = ReturnType<typeof snapshot>
  const history: Snapshot[] = []
  const events: { time: string, reason: string, target: string | null, detail?: unknown }[] = []
  const marks: Snapshot[] = []
  let restored: unknown = null
  let storageError: string | null = null
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) restored = JSON.parse(saved)
  } catch { storageError = 'Não foi possível recuperar a captura anterior.' }
  const initial = snapshot('start')
  const initialEnvironment = environment()
  let totalCaptures = 0
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined
  const reasons = new Set<string>()
  const cleanups: (() => void)[] = []

  function capture(reason: string) {
    if (stopped) return
    history.push(snapshot(reason))
    totalCaptures++
    if (history.length > LIMIT) history.shift()
    onUpdate(history.length)
  }

  function schedule(reason: string, target: EventTarget | null = null, detail?: unknown) {
    if (target instanceof Element && target.closest('[data-css-debug]')) return
    events.push({ time: new Date().toISOString(), reason, target: target instanceof Element ? label(target) : null, detail })
    if (events.length > 300) events.shift()
    reasons.add(reason)
    if (timer) return
    timer = setTimeout(() => {
      timer = undefined
      capture(Array.from(reasons).join(', '))
      reasons.clear()
    }, 500)
  }

  function listen(target: EventTarget, name: string, prefix: string) {
    const handler = (event: Event) => {
      schedule(`${prefix}.${name}`, event.target, {
        persisted: 'persisted' in event ? event.persisted : undefined,
        scrollTop: event.target instanceof Element ? event.target.scrollTop : undefined,
        scrollLeft: event.target instanceof Element ? event.target.scrollLeft : undefined,
        touches: typeof TouchEvent !== 'undefined' && event instanceof TouchEvent
          ? Array.from(event.changedTouches).map(touch => ({ clientX: touch.clientX, clientY: touch.clientY, pageX: touch.pageX, pageY: touch.pageY })) : undefined
      })
      if (name === 'pagehide' || (name === 'visibilitychange' && document.hidden)) {
        capture(`${prefix}.${name}:immediate`)
        persist()
      }
    }
    target.addEventListener(name, handler, { passive: true, capture: true })
    cleanups.push(() => target.removeEventListener(name, handler, true))
  }
  for (const name of ['resize', 'orientationchange', 'pageshow', 'pagehide', 'focus', 'blur']) listen(window, name, 'window')
  for (const name of ['scroll', 'scrollend', 'focusin', 'focusout', 'visibilitychange', 'touchend', 'click']) listen(document, name, 'document')
  if (document.fonts) listen(document.fonts, 'loadingdone', 'fonts')
  if (window.visualViewport) {
    for (const name of ['resize', 'scroll', 'scrollend']) listen(window.visualViewport, name, 'visualViewport')
  }
  const mode = matchMedia('(display-mode: standalone)')
  listen(mode, 'change', 'displayMode')
  const observer = new MutationObserver(records => {
    if (records.some(record => !(record.target instanceof Element) || !record.target.closest('[data-css-debug]'))) schedule('layout-mutation')
  })
  for (const element of [document.documentElement, document.body]) {
    observer.observe(element, { attributes: true, attributeFilter: ['class', 'style'] })
  }
  const resize = new ResizeObserver(() => schedule('ResizeObserver'))
  const observed = new WeakSet<Element>()
  function observeTargets() {
    for (const element of targets()) {
      if (!observed.has(element)) {
        observed.add(element)
        resize.observe(element)
      }
    }
  }
  observeTargets()
  const interval = setInterval(() => {
    if (document.hidden) return
    observeTargets()
    capture('interval:3s')
  }, 3000)

  function persist() {
    try {
      // Do not recursively store earlier sessions; keep the latest session only.
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ initialEnvironment, initial, history: history.slice(-PERSISTED_LIMIT), marks, events: events.slice(-100) }))
    } catch { storageError = 'Armazenamento local indisponível ou cheio; exporte antes de fechar.' }
  }
  const saveInterval = setInterval(persist, 10000)

  function details() {
    const elements = targets()
    const rules: { sheet: string, context: string[], selector: string, css: string, matches: (string | null)[] }[] = []
    const inaccessible: string[] = []
    let rulesVisited = 0
    function walk(list: CSSRuleList, sheet: string, context: string[] = []) {
      for (const rule of Array.from(list)) {
        rulesVisited++
        if (rule instanceof CSSStyleRule) {
          const selector = rule.selectorText
          const matches = elements.filter(element => {
            try { return element.matches(selector.replace(/::(before|after)/g, '')) } catch { return false }
          })
          if (matches.length && rules.length < 600) {
            rules.push({ sheet, context, selector, css: rule.style.cssText.replace(/url\([^)]*\)/g, 'url([omitted])'), matches: matches.map(label) })
          }
        }
        const group = rule as CSSRule & { cssRules?: CSSRuleList, conditionText?: string, styleSheet?: CSSStyleSheet }
        const condition = group.conditionText
        let description = rule.cssText.split('{')[0]?.slice(0, 250) ?? ''
        if (rule instanceof CSSMediaRule) description += ` [matches=${matchMedia(rule.conditionText).matches}]`
        else if (typeof CSSSupportsRule !== 'undefined' && rule instanceof CSSSupportsRule && condition) description += ` [supports=${CSS.supports(condition)}]`
        try {
          if (group.cssRules) walk(group.cssRules, sheet, [...context, description])
          else if (group.styleSheet) walk(group.styleSheet.cssRules, sheet, [...context, description])
        } catch { inaccessible.push(`${sheet}: ${description}`) }
      }
    }
    for (const sheet of Array.from(document.styleSheets)) {
      const name = sheet.href ? new URL(sheet.href).pathname : 'inline'
      try { walk(sheet.cssRules, name, [`sheet media=${sheet.media.mediaText || 'all'} disabled=${sheet.disabled}`]) } catch { inaccessible.push(name) }
    }
    const all = Array.from(document.body.querySelectorAll('*')).filter(element => !element.closest('[data-css-debug]'))
    const overflow = all.slice(0, 2000).flatMap(element => {
      const r = element.getBoundingClientRect()
      if (!r.width || !r.height) return []
      const css = getComputedStyle(element)
      if (r.bottom > innerHeight + 1 || r.right > innerWidth + 1 || element.scrollHeight > element.clientHeight + 1 || css.position === 'fixed') {
        return [{ element: label(element), rect: rect(element), position: css.position, overflowY: css.overflowY,
          scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, scrollTop: element.scrollTop }]
      }
      return []
    }).slice(0, 180)
    const hitTests = [innerHeight, window.visualViewport?.height ?? innerHeight].flatMap(height =>
      [1, 8, 20, 34, 50, 80, 120, 160].flatMap(inset => [0.1, 0.5, 0.9].map(fraction => {
        const x = innerWidth * fraction
        const y = height - inset
        return { x, y, stack: document.elementsFromPoint(x, y).filter(element => !element.closest('[data-css-debug]')).slice(0, 8).map(label) }
      })))
    return { elements: elements.map(element => measure(element, true)), rules, rulesVisited,
      rulesLimit: 600, inaccessible, overflow, scannedElements: Math.min(all.length, 2000), totalElements: all.length,
      overflowLimit: 180, hitTests }
  }

  capture('ready')
  return {
    capture(reason = 'manual:gap-visible') {
      capture(reason)
      const latest = history.at(-1)
      if (latest) marks.push(latest)
      if (marks.length > 10) marks.shift()
      persist()
    },
    routeChanged() { schedule('route-change') },
    export() {
      capture('export')
      persist()
      return JSON.stringify({
        schema: 'kortex-css-diagnostics-v1', exportedAt: new Date().toISOString(),
        units: 'CSS pixels; positive bottom gap means the measured viewport extends below the nav.',
        limits: { snapshots: LIMIT, events: 300, marks: 10, persistedSnapshots: PERSISTED_LIMIT },
        environment: environment(), initialEnvironment, initial, history, marks, events, totalCaptures, previousSession: restored,
        details: details(), storageError
      }, null, 2)
    },
    stop() {
      capture('stop')
      persist()
      stopped = true
      clearTimeout(timer)
      clearInterval(interval)
      clearInterval(saveInterval)
      observer.disconnect()
      resize.disconnect()
      cleanups.forEach(cleanup => cleanup())
      probes.remove()
    }
  }
}
