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

/** Custom primary palette: NGI blue */
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

/** Charcoal (dark gray) */
export const charcoal: ThemeShades = {
  50: '#f7f7f7',
  100: '#e3e3e3',
  200: '#c8c8c8',
  300: '#a4a4a4',
  400: '#818181',
  500: '#666666',
  600: '#515151',
  700: '#434343',
  800: '#383838',
  900: '#1a1a1a',
  950: '#0d0d0d'
}

/** Coffee (brown) */
export const coffee: ThemeShades = {
  50: '#faf6f2',
  100: '#f0e6dc',
  200: '#e0ccb8',
  300: '#c9ab8f',
  400: '#b08d66',
  500: '#96704a',
  600: '#7a5a3c',
  700: '#5e4630',
  800: '#423124',
  900: '#261d18',
  950: '#0f0c0a'
}

/** Burgundy (wine red) */
export const burgundy: ThemeShades = {
  50: '#fdf2f3',
  100: '#fce4e6',
  200: '#f9c9ce',
  300: '#f4a2ab',
  400: '#ec6b7a',
  500: '#dc3d50',
  600: '#b82d3e',
  700: '#962636',
  800: '#7c2230',
  900: '#6a202c',
  950: '#3b0f14'
}

/** Ytterby (dark blue)*/
export const ytterby: ThemeShades = {
  50: '#f2f5f8',
  100: '#e4e9f0',
  200: '#c9d3e1',
  300: '#9fb4c9',
  400: '#6e8fac',
  500: '#4d6f91',
  600: '#3c5874',
  700: '#33485f',
  800: '#2d3d50',
  900: '#293544',
  950: '#18202b'
}

export const CUSTOM_PRIMARY_THEMES = ['burgundy', 'coffee', 'charcoal', 'ytterby', 'ngi'] as const
export type CustomPrimaryThemeName = (typeof CUSTOM_PRIMARY_THEMES)[number]

/** Map of custom primary theme names to palettes (for plugin and composable). */
export const CUSTOM_PRIMARY_PALETTES: Record<CustomPrimaryThemeName, ThemeShades> = {
  ngi,
  charcoal,
  coffee,
  burgundy,
  ytterby
}
