import type { TemperatureCategory } from '~~/schemas/inventory/temperature'
import { temperatureCategorySchema, TEMPERATURE_CATEGORY_LABELS } from '~~/schemas/inventory/temperature'
import type { SelectOption } from './equipment'

// Re-export the canonical helpers so components can import everything
// temperature-related from a single client-side module.
export { TEMPERATURE_CATEGORY_LABELS, formatTemperature, resolveEffectiveCelsius } from '~~/schemas/inventory/temperature'
export type { TemperatureCategory } from '~~/schemas/inventory/temperature'

export const TEMPERATURE_CATEGORY_OPTIONS: SelectOption<TemperatureCategory>[] =
  temperatureCategorySchema.options.map(value => ({
    value,
    label: TEMPERATURE_CATEGORY_LABELS[value]
  }))

export function resolveTemperatureCategoryFromSelect(value: unknown): TemperatureCategory | null {
  if (typeof value === 'string') {
    const parsed = temperatureCategorySchema.safeParse(value)
    if (parsed.success) return parsed.data
  }

  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (typeof inner === 'string') {
      const parsed = temperatureCategorySchema.safeParse(inner)
      if (parsed.success) return parsed.data
    }
  }

  return null
}
