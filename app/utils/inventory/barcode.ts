import type { SelectOption } from './equipment'

/*
 * Barcode assignment mode for the inventory create steppers.
 * ********************************************************
 *
 * A UI-only choice, never stored: it decides whether the create request supplies an
 * existing label or omits the barcode so the server issues a fresh one. Kept here so
 * the item, container and equipment steppers share one option list and resolver.
 */
export type BarcodeMode = 'generate' | 'existing'

export const BARCODE_MODE_OPTIONS: SelectOption<BarcodeMode>[] = [
  { value: 'generate', label: 'Generate barcode' },
  { value: 'existing', label: 'Use existing' }
]

export function resolveBarcodeModeFromSelect(value: unknown): BarcodeMode | null {
  if (value === 'generate' || value === 'existing') return value

  if (value && typeof value === 'object' && 'value' in value) {
    const inner = (value as { value?: unknown }).value
    if (inner === 'generate' || inner === 'existing') return inner
  }

  return null
}
