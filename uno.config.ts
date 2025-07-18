import { defaultConfig } from '@una-ui/nuxt/una.config'

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

  presets: [],

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
