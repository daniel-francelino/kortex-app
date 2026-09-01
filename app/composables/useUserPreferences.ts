import { detectBrowserTimeZone } from '#shared/utils/dateTime'

enum ThemeContext {
  Public = 'public',
  App = 'app'
}

enum ColorModePreference {
  Light = 'light',
  Dark = 'dark'
}

type UserPreferences = {
  primary_color: string
  neutral_color: string
  color_mode: ColorModePreference
  // `null` = never explicitly chosen (see docs/timezone/ANALISE_TIMEZONE.md,
  // Regra 2) — only `GET /api/settings/preferences`'s response carries this;
  // `PreferencesState.timezone` below is always a concrete string, since the
  // app always needs *something* to display/send immediately.
  timezone: string | null
  // How many times each zone has been active for this user (auto-fill or
  // manual change) — powers "most used first" in the timezone picker
  // (docs/timezone/ANALISE_TIMEZONE.md, seção 7).
  timezone_usage: Record<string, number>
}

type PreferencesState = {
  loaded: boolean
  primary_color: string
  neutral_color: string
  color_mode: ColorModePreference
  timezone: string
  timezoneUsage: Record<string, number>
}

type ThemePreset = UserPreferences

const PUBLIC_THEME: ThemePreset = {
  // Public experience should also reflect the Kortex brand identity on first load.
  primary_color: 'emerald',
  neutral_color: 'slate',
  color_mode: ColorModePreference.Dark,
  timezone: 'UTC',
  timezone_usage: {}
}

const BRAND_THEME: ThemePreset = {
  primary_color: 'emerald',
  neutral_color: 'slate',
  color_mode: ColorModePreference.Dark,
  timezone: 'UTC',
  timezone_usage: {}
}

export function useUserPreferences() {
  const state = useState<PreferencesState>('user-preferences', () => ({
    loaded: false,
    primary_color: BRAND_THEME.primary_color,
    neutral_color: BRAND_THEME.neutral_color,
    color_mode: BRAND_THEME.color_mode,
    timezone: BRAND_THEME.timezone,
    timezoneUsage: {}
  }))

  const appConfig = useAppConfig()
  const colorMode = useColorMode()

  function applyTheme(theme: ThemePreset) {
    appConfig.ui.colors.primary = theme.primary_color
    appConfig.ui.colors.neutral = theme.neutral_color
    colorMode.preference = theme.color_mode
    // @nuxtjs/color-mode marks SSR state `unknown: true` when it couldn't read a
    // stored preference. Its `app:mounted` hook then "corrects" `unknown` state
    // by resetting preference/value from the browser's actual stored preference —
    // silently reverting the explicit brand theme we just set above. Clearing the
    // flag here tells that hook our preference is intentional, not a guess.
    colorMode.unknown = false
  }

  async function load() {
    if (state.value.loaded) return

    try {
      const data = await $fetch<UserPreferences>('/api/settings/preferences')
      state.value.primary_color = data.primary_color
      state.value.neutral_color = data.neutral_color
      state.value.color_mode = data.color_mode
      // `data.timezone` may be `null` (never explicitly chosen) — fall back
      // to 'UTC' for immediate display only; never persist that fallback
      // back automatically (see the Regra 2 block right below, which is the
      // only thing allowed to fill it in on the user's behalf).
      state.value.timezone = data.timezone ?? 'UTC'
      state.value.timezoneUsage = data.timezone_usage ?? {}
      state.value.loaded = true

      // Regra 2 (docs/timezone/ANALISE_TIMEZONE.md): the very first time
      // this account is ever seen with no timezone preference at all, seed
      // it from the browser's detected zone — once. From then on the column
      // is never null again, so this block never runs again for this user;
      // any later change only happens if they explicitly pick one in
      // Configurações. Never do this for the public/unauthenticated theme
      // context, where there's no real user preference to seed.
      if (data.timezone === null) {
        const browserTz = detectBrowserTimeZone()
        if (browserTz) void setTimezone(browserTz)
      }
    } catch {
      // Keep brand defaults silently when preferences cannot be loaded.
      state.value.loaded = true
    }
  }

  function applyStoredTheme() {
    applyTheme({
      primary_color: state.value.primary_color,
      neutral_color: state.value.neutral_color,
      color_mode: state.value.color_mode,
      timezone: state.value.timezone
    })
  }

  function applyContextTheme(context: ThemeContext) {
    if (context === ThemeContext.Public) {
      applyTheme(PUBLIC_THEME)
      return
    }

    if (!state.value.loaded) {
      applyTheme(BRAND_THEME)
      return
    }

    applyStoredTheme()
  }

  async function save(prefs: Partial<UserPreferences>) {
    if (prefs.primary_color) state.value.primary_color = prefs.primary_color
    if (prefs.neutral_color) state.value.neutral_color = prefs.neutral_color
    if (prefs.color_mode) state.value.color_mode = prefs.color_mode
    if (prefs.timezone) state.value.timezone = prefs.timezone
    if (prefs.timezone_usage) state.value.timezoneUsage = prefs.timezone_usage

    applyStoredTheme()

    try {
      await $fetch('/api/settings/preferences', {
        method: 'PUT',
        body: {
          primary_color: state.value.primary_color,
          neutral_color: state.value.neutral_color,
          color_mode: state.value.color_mode,
          timezone: state.value.timezone,
          // Only sent when this save is actually changing usage counts
          // (see setTimezone) — omitting it otherwise lets the PUT endpoint
          // leave the stored map untouched instead of resetting it.
          ...(prefs.timezone_usage ? { timezone_usage: prefs.timezone_usage } : {})
        }
      })
    } catch {
      // Silently fail — local state already updated
    }
  }

  async function setPrimaryColor(color: string) {
    await save({ primary_color: color })
  }

  async function setNeutralColor(color: string) {
    await save({ neutral_color: color })
  }

  async function setColorMode(mode: string) {
    await save({ color_mode: mode as ColorModePreference })
  }

  async function setTimezone(timezone: string) {
    // Covers both paths that are allowed to change the timezone (seção 7):
    // the Regra 2 one-time auto-fill and an explicit change in
    // Configurações — both call this same function, so counting usage here
    // catches both without duplicating the increment logic at each call site.
    const nextUsage = {
      ...state.value.timezoneUsage,
      [timezone]: (state.value.timezoneUsage[timezone] ?? 0) + 1
    }
    await save({ timezone, timezone_usage: nextUsage })
  }

  return {
    state: readonly(state),
    applyBrandTheme: () => applyContextTheme(ThemeContext.App),
    applyPublicTheme: () => applyContextTheme(ThemeContext.Public),
    applyStoredTheme,
    load,
    setPrimaryColor,
    setNeutralColor,
    setColorMode,
    setTimezone
  }
}
