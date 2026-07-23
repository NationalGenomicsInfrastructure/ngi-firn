import { z } from 'zod'
import { itemTypeSchema } from './items'
import { inventoryActionSchema, inventoryFlagSchema } from './metadata'
import { documentReferenceMapSchema } from '../basic'

// ---------------------------------------------------------------------------
// Container type & classification vocabularies
// ---------------------------------------------------------------------------

// Container type classifications (physical form factor of the container).
export const containerTypeSchema = z.enum([
  'Bag',
  'Bin',
  'Block',
  'Box',
  'Cane',
  'Goblet',
  'Rack',
  'Tray',
  'Other'
])

export type ContainerType = z.infer<typeof containerTypeSchema>

// Purpose/domain classification — mirrors the InventoryClassification union in
// types/inventory.d.ts. Kept as a zod enum so container CRUD input can validate it.
export const containerClassificationSchema = z.enum([
  'Sample',
  'Reagent',
  'Control',
  'Library',
  'Consumable',
  'Equipment',
  'Other'
])

export type ContainerClassification = z.infer<typeof containerClassificationSchema>

// A child stored inside a container is itself either a container or an item, so a
// capacity entry's `type` ranges over both vocabularies.
const childCategorySchema = z.union([containerTypeSchema, itemTypeSchema])

// shortcuts for the parent/child type enums used in container CRUD input validation
const parentKindSchema = z.enum(['equipment', 'container'])
const childKindSchema = z.enum(['item', 'container'])

export type ContainerParentKindType = z.infer<typeof parentKindSchema>
export type ContainerChildKindType = z.infer<typeof childKindSchema>

// ---------------------------------------------------------------------------
// Grid position — zod counterpart of the GridPosition interface (types/inventory.d.ts)
// ---------------------------------------------------------------------------

// Slot position of a child within its parent's grid layout. `label` is a
// human-readable slot name (e.g. "A3"); the server derives it from row/column
// via deriveGridLabel() when the client omits it.
export const gridPositionSchema = z.object({
  row: z.number().int().min(1),
  column: z.number().int().min(1),
  level: z.number().int().min(1).optional(),
  label: z.string().optional()
})

export type GridPositionInput = z.infer<typeof gridPositionSchema>

// ---------------------------------------------------------------------------
// Capacity model
// ---------------------------------------------------------------------------
// A container declares capacity as an array of entries. Each entry is discriminated
// on `layout`:
//   - 'count' — a numeric cap for one child category (a bin that holds up to N of a
//     type). A container may have several 'count' entries (a mixed assortment).
//   - 'grid'  — a positional layout (rows × columns × levels) for exactly ONE child
//     category (a 3×3 rack of boxes). A grid container has exactly one entry.
// The two layouts never mix on one container (enforced by containerCapacityArraySchema).
//
// `childKind` is stored explicitly rather than derived from `type` because the
// CouchDB view map functions are plain JS with no imports and cannot classify a
// `type` against the enums — and container 'Other' vs item 'other' differ only by case.

const countCapacitySchema = z.object({
  layout: z.literal('count'),
  childKind: childKindSchema,
  type: childCategorySchema,
  capacity: z.number().int().min(0)
})

const gridCapacitySchema = z.object({
  layout: z.literal('grid'),
  childKind: childKindSchema,
  type: childCategorySchema,
  rows: z.number().int().min(1),
  columns: z.number().int().min(1),
  levels: z.number().int().min(1).default(1)
})

// Wire/form shape: how the client declares capacity. No server-owned occupancy.
export const containerCapacitySchema = z.discriminatedUnion('layout', [
  countCapacitySchema,
  gridCapacitySchema
])

export type ContainerCapacity = z.infer<typeof containerCapacitySchema>

// Stored/document shape: the wire shape plus the server-owned `stored` occupancy.
// `stored` is deliberately REQUIRED so that raw client input is NOT structurally
// assignable to the stored shape — the compiler rejects storing it unconverted.
// `stored` is never accepted from the client; only the CRUD service writes it.
//   - For 'count': `stored` = number of children of that category.
//   - For 'grid':  `stored` = number of occupied slots (0 ≤ stored ≤ rows*columns*levels).
export const containerCapacityEntrySchema = z.discriminatedUnion('layout', [
  countCapacitySchema.extend({ stored: z.number().int().min(0) }),
  gridCapacitySchema.extend({ stored: z.number().int().min(0) })
])

export type ContainerCapacityEntry = z.infer<typeof containerCapacityEntrySchema>

// Container-level guard for the whole capacity array:
//   - grid and count layouts must not mix; a grid container has exactly one entry (XOR).
//   - 'count' entries must not repeat a category.
export const containerCapacityArraySchema = z
  .array(containerCapacitySchema)
  .superRefine((entries, ctx) => {
    const hasGrid = entries.some(entry => entry.layout === 'grid')

    if (hasGrid && entries.length !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'A grid container must declare exactly one capacity entry and cannot mix grid and count layouts.'
      })
    }

    const seenCountTypes = new Set<string>()
    for (const entry of entries) {
      if (entry.layout === 'count') {
        if (seenCountTypes.has(entry.type)) {
          ctx.addIssue({
            code: 'custom',
            message: `Duplicate capacity entry for category "${entry.type}".`
          })
        }
        seenCountTypes.add(entry.type)
      }
    }
  })

// ---------------------------------------------------------------------------
// Container CRUD input schemas
// ---------------------------------------------------------------------------
// Containers are addressed by slug on the wire, exactly like rooms and equipment:
// slugs are human-readable, unique (name + random suffix) and non-sensitive, so the
// internal CouchDB _id/_rev never leave the server. The server resolves a slug to its
// document (via the by_slug view) and stores the resulting _id in a
// TypedDocumentReference. A container's parent may be storage equipment OR another
// container, so the server resolves `parentSlug` against both types.

export const createContainerSchema = z.object({
  containerType: containerTypeSchema,
  classification: containerClassificationSchema,
  name: z.string().min(1, { message: 'Container name is required' }),
  label: z.string().nullish(),
  description: z.string().nullish(),
  parentSlug: z.string().min(1, { message: 'Parent identifier is required' }),
  parentKind: parentKindSchema,
  // Placement of THIS container within its parent's grid (if the parent is a grid).
  position: gridPositionSchema.nullish(),
  // Wire shape — no server-owned `stored`. Acceptance is derived from the entries' `type`s.
  capacity: containerCapacityArraySchema.nullish(),
  // Optional template ID (if the container was created from a template).
  templateId: z.string().nullish(),
  projectRefs: documentReferenceMapSchema.nullish()
})

// update container metadata that is not captured by dedicated endpoints (e.g. move, alter status, etc.)
export const updateContainerSchema = z.object({
  containerSlug: z.string().min(1, { message: 'Container identifier is required' }),
  containerType: containerTypeSchema.optional(),
  classification: containerClassificationSchema.optional(),
  name: z.string().min(1).optional(),
  label: z.string().nullish(),
  description: z.string().nullish(),
  position: gridPositionSchema.nullish(),
  capacity: containerCapacityArraySchema.nullish(),
  projectRefs: documentReferenceMapSchema.nullish(),
  logComment: z.string().nullish() // Optional note to append to the container's action log
})

export const deleteContainerSchema = z.object({
  containerSlug: z.string().min(1, { message: 'Container identifier is required' })
})

export const moveContainerSchema = z.object({
  containerSlug: z.string().min(1, { message: 'Container identifier is required' }),
  newParentSlug: z.string().min(1, { message: 'Target parent identifier is required' }),
  newParentKind: parentKindSchema,
  // New placement within the target parent's grid (if it is a grid).
  position: gridPositionSchema.nullish(),
  logComment: z.string().nullish() // Optional note to append to the container's action log
})

export const alterContainerSchema = z.object({
  // Batch operation: multiple containers can be updated at once, so this is an array of slugs.
  containerSlug: z.array(z.string().min(1, { message: 'Container identifier is required' })),
  performedAction: inventoryActionSchema,
  flagKind: inventoryFlagSchema.nullish(), // Optional flag category (if performedAction = 'flag')
  logComment: z.string().nullish() // Optional note to append to the container's action log
})

// Find candidate storage locations that can accept `count` children of `category`.
export const suggestLocationsSchema = z.object({
  category: z.string().min(1, { message: 'Item/container category is required' }),
  childType: childKindSchema,
  count: z.number().int().positive({ message: 'Requested slot count must be positive' }),
  classification: z.string().nullish(),
  ancestorId: z.string().nullish(),
  temperatureCelsius: z.number().nullish()
})

// Inferred types
export type CreateContainerSchemaInput = z.infer<typeof createContainerSchema>
export type UpdateContainerSchemaInput = z.infer<typeof updateContainerSchema>
export type DeleteContainerSchemaInput = z.infer<typeof deleteContainerSchema>
export type MoveContainerSchemaInput = z.infer<typeof moveContainerSchema>
export type AlterContainerSchemaInput = z.infer<typeof alterContainerSchema>
export type SuggestLocationsSchemaInput = z.infer<typeof suggestLocationsSchema>
