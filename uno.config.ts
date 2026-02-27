import { defaultConfig } from '@una-ui/nuxt/una.config'
import { presetTypography } from '@unocss/preset-typography'
import { presetWebFonts, presetAttributify, presetWind3 } from 'unocss'
import { ngi, charcoal, coffee, burgundy, ytterby, mahogany, ocean } from './app/config/theme'

export default defaultConfig({
  /*
   * UnoCSS Configuration Options
   *
   * You can extend the default UnoCSS configuration here by adding rules,
   * themes, variants, and other options.
   *
   * @see https://unocss.dev/guide/config-file
   * @see https://unocss.dev/config/
   */

  extendTheme: (theme) => {
    theme.colors ??= {}
    theme.colors.ngi = { ...ngi }
    theme.colors.charcoal = { ...charcoal }
    theme.colors.coffee = { ...coffee }
    theme.colors.burgundy = { ...burgundy }
    theme.colors.ytterby = { ...ytterby }
    theme.colors.mahogany = { ...mahogany }
    theme.colors.ocean = { ...ocean }
  },

  presets: [
    presetAttributify(), // required if using attributify mode
    presetWind3(), // required
    presetTypography({
      selectorName: 'prose', // now use like `prose prose-slate`, `not-prose`
      // @see https://github.com/tailwindlabs/tailwindcss-typography
      // cssExtend is an object with CSS selector as key and
      // CSS declaration block as value like writing normal CSS.
      cssExtend: {
        'code': {
          color: 'var(--una-primary-hex)'
        },
        'a:hover': {
          color: 'var(--una-primary-hex)'
        },
        'a:visited': {
          color: 'var(--una-primary-gray)'
        }
      }
    }),
    presetWebFonts({
      provider: 'bunny',
      fonts: {
        // sans: 'Kanit',
        sans: 'Outfit',
        display: 'Alkatra',
        mono: 'Fira Code'
      }
    })
  ],

  safelist: [
    // Classes for styling toast notifications. Normally lazy loaded,
    // but these need to be available right away for the useAuthStatusToast composable
    'alert-border-primary',
    'alert-border-emerald',
    'alert-border-amber',
    'alert-border-red',
    'alert-border-indigo',
    'bg-base',
    // Toast icons - need to be available immediately for composables
    'i-lucide-book-open',
    'i-lucide-building-2',
    'i-lucide-calendar-range',
    'i-lucide-calendar',
    'i-lucide-calendar-off',
    'i-lucide-check-circle',
    'i-lucide-circle-check',
    'i-lucide-circle-x',
    'i-lucide-cpu',
    'i-lucide-dna',
    'i-lucide-file-badge',
    'i-lucide-file-text',
    'i-lucide-flask-conical',
    'i-lucide-folder',
    'i-lucide-info',
    'i-lucide-list-ordered',
    'i-lucide-list',
    'i-lucide-message-square',
    'i-lucide-microscope',
    'i-lucide-package-check',
    'i-lucide-pen-tool',
    'i-lucide-shopping-cart',
    'i-lucide-triangle-alert',
    'i-lucide-truck',
    'i-lucide-user'
  ],

  /*
   * Una UI Shortcuts Customization
   *
   * Shortcuts allow you to create reusable utility combinations or override
   * the default Una UI components styling.
   *
   * Two types of shortcuts:
   * 1. Static: Simple string mappings (object format)
   * 2. Dynamic: RegExp patterns with functions that return styles
   *
   * @see https://github.com/una-ui/una-ui/tree/main/packages/preset/src/_shortcuts
   * @see https://unocss.dev/config/shortcuts
   */
  shortcuts: [
    /*
     * Static Shortcuts
     *
     * Use these to create new utility combinations or override existing ones.
     *
     * @example
     * 'btn-custom': 'py-2 px-4 bg-blue-500 text-white rounded hover:bg-blue-600',
     * 'card': 'p-4 border rounded-lg shadow bg-white dark:bg-gray-800'
     */
    {
      // add here ...
    }

    /*
     * Dynamic Shortcuts
     *
     * Create pattern-based utilities with variants using RegExp.
     *
     * @example
     * [/^gradient-(\w+)$/, ([, color]) => `bg-gradient-to-r from-${color}-500 to-${color}-700`],
     * [/^shadow-(\w+)$/, ([, size]) => size === 'sm' ? 'shadow-sm' : size === 'lg' ? 'shadow-lg' : 'shadow']
     */
  ]
})
