import { useStorage } from '@vueuse/core'
import { ngi, paletteToPrimaryCssVars } from '~/config/theme'

const THEME_OVERRIDE_KEY = 'ngi-theme-override'

export default defineNuxtPlugin(() => {
  const themeOverride = useStorage<{ primary: string | null; gray: string | null }>(THEME_OVERRIDE_KEY, {
    primary: null,
    gray: null
  })

  const styleEl = document.createElement('style')
  styleEl.id = 'una-ui-theme-custom'
  document.head.appendChild(styleEl)

  watchEffect(() => {
    if (themeOverride.value.primary === 'ngi') {
      const vars = paletteToPrimaryCssVars(ngi)
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
