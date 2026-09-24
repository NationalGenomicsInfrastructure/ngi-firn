import { z } from 'zod'
// Categorical storage temperature.
//
// Single source of truth for the temperature model shared by the server (CRUD
// compatibility checks + suggestLocations) and the client (form pickers and
// display). Storage equipment, containers and items pick a category rather than
// an arbitrary number. Every non-`other` category maps to a representative °C
// (used for display and sort ordering); the `other` bucket carries a free
// numeric value in the document's existing `temperatureCelsius` field.

export const temperatureCategorySchema = z.enum([
  'liquid_nitrogen',
  'deep_freezer',
  'freezer',
  'fridge',
  'ambient',
  'incubator',
  'other'
])

export type TemperatureCategory = z.infer<typeof temperatureCategorySchema>

// Representative °C per category (excluding `other`, which stores its own numeric).
export const TEMPERATURE_CATEGORY_CELSIUS: Record<Exclude<TemperatureCategory, 'other'>, number> = {
  liquid_nitrogen: -196,
  deep_freezer: -80,
  freezer: -25,
  fridge: 4,
  ambient: 21,
  incubator: 37
}

export const TEMPERATURE_CATEGORY_LABELS: Record<TemperatureCategory, string> = {
  liquid_nitrogen: 'Liquid nitrogen (−196 °C)',
  deep_freezer: 'Deep freezer (−80 °C)',
  freezer: 'Freezer (−25 °C)',
  fridge: 'Fridge (+4 °C)',
  ambient: 'Ambient / room temp',
  incubator: 'Incubator (+37 °C)',
  other: 'Other'
}

// The effective °C for a (category, numeric) pair. `null` category yields null
// (unspecified); `other` yields its stored numeric; every other category yields
// its representative °C.
export function resolveEffectiveCelsius(
  category: TemperatureCategory | null | undefined,
  celsius: number | null | undefined
): number | null {
  if (category == null) return null
  if (category === 'other') return celsius ?? null
  return TEMPERATURE_CATEGORY_CELSIUS[category]
}

// A child (item/container) is compatible with a parent when the child has no
// explicit category (fits anywhere) or the categories match — and, for `other`,
// the free numeric values match too.
export function temperaturesCompatible(
  child: { category: TemperatureCategory | null, celsius: number | null },
  parent: { category: TemperatureCategory | null, celsius: number | null }
): boolean {
  if (child.category == null) return true
  if (child.category !== parent.category) return false
  if (child.category === 'other') return (child.celsius ?? null) === (parent.celsius ?? null)
  return true
}

// Human-readable label for display surfaces (cards, tables, dialogs).
export function formatTemperature(
  category: TemperatureCategory | null | undefined,
  celsius: number | null | undefined
): string {
  if (category == null) return '—'
  if (category === 'other') {
    return celsius == null ? 'Other' : `Other (${celsius} °C)`
  }
  return TEMPERATURE_CATEGORY_LABELS[category]
}

// Normalizes the stored numeric so it only carries a value for the `other`
// bucket; every predefined category derives its °C from the category and stores
// `null`. Call this on write (CRUD create/update) before persisting.
export function normalizeStoredCelsius(
  category: TemperatureCategory | null | undefined,
  celsius: number | null | undefined
): number | null {
  if (category === 'other') return celsius ?? null
  return null
}
