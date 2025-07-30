import { defaultConfig } from '@una-ui/nuxt/una.config'
import { presetTypography } from '@unocss/preset-typography'
import { presetWebFonts, presetAttributify, presetWind3 } from 'unocss'

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
          color: 'var(--una-primary-hex)',
        },
        'a:hover': {
          color: 'var(--una-primary-hex)',
        },
        'a:visited': {
          color: 'var(--una-primary-gray)',
        },
      },
    }),
    presetWebFonts({
      provider: 'bunny',
      fonts: {
        sans: 'Red Hat Display',
        mono: 'Fira Code',
      },
    }),
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
