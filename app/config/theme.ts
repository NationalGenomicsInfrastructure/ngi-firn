/**
 * Custom color palettes for Firn.
 * Shape matches Una UI extended-colors: keys 50–950, hex strings.
 * @see https://raw.githubusercontent.com/una-ui/una-ui/main/packages/preset/src/_theme/extended-colors.ts
 */

/** Convert hex to [r, g, b] for Una UI CSS variables (rgba(var(--una-primary-500) / )). */
export function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result?.[1] || !result?.[2] || !result?.[3]) throw new Error(`Invalid hex color: ${hex}`)
  return [
    Number.parseInt(result[1], 16),
    Number.parseInt(result[2], 16),
    Number.parseInt(result[3], 16)
  ]
}

/** Build Una UI primary CSS variable map from a palette (e.g. for use in theme plugin). */
export function paletteToPrimaryCssVars(palette: ThemeShades): Record<string, string> {
  const vars: Record<string, string> = {
    '--una-primary-hex': palette[600]
  }
  const shades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'] as const
  for (const shade of shades) {
    vars[`--una-primary-${shade}`] = hexToRgb(palette[shade]).join(', ')
  }
  return vars
}

export type ThemeShades = {
  50: string
  100: string
  200: string
  300: string
  400: string
  500: string
  600: string
  700: string
  800: string
  900: string
  950: string
}

/** Custom primary palette: NGI (brand-ish teal/cyan, ice/snow feel). */
export const ngi: ThemeShades = {
  50:  '#e7f1fd',
  100: `#d0e3fb`,
  200: '#a0c8f8',
  300: '#71acf4',
  400: '#4190f1',
  500: '#1275ed',
  600: '#0e5dbe',
  700: '#0b468e',
  800: '#072f5f',
  900: '#04172f',
  950: '#021021',
}

export const CUSTOM_PRIMARY_THEMES = ['ngi'] as const
export type CustomPrimaryThemeName = (typeof CUSTOM_PRIMARY_THEMES)[number]
