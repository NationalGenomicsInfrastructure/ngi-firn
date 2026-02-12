import { useStorage } from '@vueuse/core'
import { CUSTOM_PRIMARY_PALETTES, paletteToPrimaryCssVars } from '~/config/theme'

const THEME_OVERRIDE_KEY = 'ngi-theme-override'

export default defineNuxtPlugin(() => {
  const themeOverride = useStorage<{ primary: string | null, gray: string | null }>(THEME_OVERRIDE_KEY, {
    primary: null,
    gray: null
  })

  const styleEl = document.createElement('style')
  styleEl.id = 'una-ui-theme-custom'
  document.head.appendChild(styleEl)

  watchEffect(() => {
    const name = themeOverride.value.primary
    const palette = name && name in CUSTOM_PRIMARY_PALETTES ? CUSTOM_PRIMARY_PALETTES[name as keyof typeof CUSTOM_PRIMARY_PALETTES] : null
    if (palette) {
      const vars = paletteToPrimaryCssVars(palette)
      const declarations = Object.entries(vars)
        .map(([k, v]) => `${k}: ${v};`)
        .join('\n')
      styleEl.textContent = `:root {\n${declarations}\n}`
    }
    else {
      styleEl.textContent = ''
    }
  })
})
