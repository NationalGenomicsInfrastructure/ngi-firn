/*
 * Shared class strings of the Firn visual language. See docs/ui-style.md.
 *
 * They are plain strings (not UnoCSS shortcuts) so they can be passed straight to Una's `:una`
 * slot overrides. UnoCSS extracts the classes from this file like from any other source file.
 */

/* Small uppercase caption: form labels, filter group names, read-only field labels. */
export const UI_LABEL_STYLE = 'text-xs uppercase tracking-wider font-semibold text-muted'

/* Signature left edge of cards and surfaces that carry results or filters. */
export const UI_ACCENT_EDGE = 'border-l-8 border-l-primary-700 dark:border-l-primary-500'

/* Slimmer variant for small, repeated cards (e.g. room cards in a grid). */
export const UI_ACCENT_EDGE_SM = 'border-l-6 border-l-primary-700 dark:border-l-primary-500'
