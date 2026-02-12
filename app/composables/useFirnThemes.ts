import { useStorage } from '@vueuse/core'
import { paletteToPrimaryCssVars, CUSTOM_PRIMARY_THEMES, CUSTOM_PRIMARY_PALETTES } from '~/config/theme'

const THEME_OVERRIDE_KEY = 'ngi-theme-override'

export type ThemeOverride = {
  primary: string | null
  gray: string | null
}

const customPrimaryCssVars = Object.fromEntries(
  (CUSTOM_PRIMARY_THEMES as readonly string[]).map(name => [
    name,
    paletteToPrimaryCssVars(CUSTOM_PRIMARY_PALETTES[name as keyof typeof CUSTOM_PRIMARY_PALETTES])
  ])
) as Record<(typeof CUSTOM_PRIMARY_THEMES)[number], Record<string, string>>

/**
 * Extends Una UI themes with NGI custom palettes and persists custom theme selection
 * separately so the library never receives custom theme names.
 */
export function useFirnThemes() {
  const { primaryThemes: unaPrimaryThemes, grayThemes, getPrimaryColors, getGrayColors } = useUnaThemes()
  const { settings, reset } = useUnaSettings()
  const { una } = useAppConfig()

  const primaryThemes: [string, Record<string, string>][] = [
    ...unaPrimaryThemes,
    ...CUSTOM_PRIMARY_THEMES.map(name => [name, customPrimaryCssVars[name]] as [string, Record<string, string>])
  ]

  const themeOverride = useStorage<ThemeOverride>(THEME_OVERRIDE_KEY, {
    primary: null,
    gray: null
  })

  const effectivePrimary = computed(() => themeOverride.value.primary ?? settings.value.primary ?? una.primary)
  const effectiveGray = computed(() => themeOverride.value.gray ?? settings.value.gray ?? una.gray)

  const effectivePrimaryThemeHex = computed(() => {
    const name = themeOverride.value.primary
    if (name && name in customPrimaryCssVars)
      return customPrimaryCssVars[name as keyof typeof customPrimaryCssVars]['--una-primary-hex']
    return settings.value.primaryColors?.['--una-primary-hex']
  })

  const effectiveGrayThemeHex = computed(() => settings.value.grayColors?.['--una-gray-hex'])

  function setPrimaryTheme(theme: string): void {
    if (CUSTOM_PRIMARY_THEMES.includes(theme as (typeof CUSTOM_PRIMARY_THEMES)[number])) {
      themeOverride.value.primary = theme
      // Leave settings.primary unchanged so useUnaSettings never calls getPrimaryColors('ngi')
    }
    else {
      themeOverride.value.primary = null
      settings.value.primary = theme
    }
  }

  function setGrayTheme(theme: string): void {
    themeOverride.value.gray = null
    settings.value.gray = theme
  }

  function clearOverride(): void {
    themeOverride.value.primary = null
    themeOverride.value.gray = null
  }

  function resetThemes(): void {
    clearOverride()
    reset()
  }

  /** CSS variable map for the current effective primary theme (for the custom theme plugin). */
  function getEffectivePrimaryCssVars(): Record<string, string> | null {
    const name = themeOverride.value.primary
    if (name && name in customPrimaryCssVars)
      return customPrimaryCssVars[name as keyof typeof customPrimaryCssVars]
    return null
  }

  return {
    primaryThemes,
    grayThemes,
    getPrimaryColors,
    getGrayColors,
    settings,
    reset,
    themeOverride,
    effectivePrimary,
    effectiveGray,
    effectivePrimaryThemeHex,
    effectiveGrayThemeHex,
    setPrimaryTheme,
    setGrayTheme,
    clearOverride,
    resetThemes,
    getEffectivePrimaryCssVars,
    customPrimaryCssVars
  }
}
