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
  timezone: string
}

type PreferencesState = {
  loaded: boolean
  primary_color: string
  neutral_color: string
  color_mode: ColorModePreference
  timezone: string
}

type ThemePreset = UserPreferences

const PUBLIC_THEME: ThemePreset = {
  // Public experience should also reflect the Kortex brand identity on first load.
  primary_color: 'emerald',
  neutral_color: 'slate',
  color_mode: ColorModePreference.Dark,
  timezone: 'UTC'
}

const BRAND_THEME: ThemePreset = {
  primary_color: 'emerald',
  neutral_color: 'slate',
  color_mode: ColorModePreference.Dark,
  timezone: 'UTC'
}

export function useUserPreferences() {
  const state = useState<PreferencesState>('user-preferences', () => ({
    loaded: false,
    primary_color: BRAND_THEME.primary_color,
    neutral_color: BRAND_THEME.neutral_color,
    color_mode: BRAND_THEME.color_mode,
    timezone: BRAND_THEME.timezone
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
      state.value.timezone = data.timezone
      state.value.loaded = true
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

    applyStoredTheme()

    try {
      await $fetch('/api/settings/preferences', {
        method: 'PUT',
        body: {
          primary_color: state.value.primary_color,
          neutral_color: state.value.neutral_color,
          color_mode: state.value.color_mode,
          timezone: state.value.timezone
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
    await save({ timezone })
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
