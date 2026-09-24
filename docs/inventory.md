# Inventory System

The inventory module tracks where physical items — sample plates, reagents, sequencing libraries, consumables — are stored in the lab. Its primary purpose is answering the question _"where is this thing right now?"_ and maintaining an auditable history of who handled it and when.

## High-Level Idea

Our genomics facility stores thousands of items across rooms, freezers, fridges, nitrogen tanks, shelves, boxes, racks, and bags. These form a **tree hierarchy**: rooms contain equipment, equipment contains containers, containers can nest inside other containers, and items sit at the leaves.

The system models this tree as **separate CouchDB documents linked by typed `parent` references** rather than embedding children inside their parents. Each non-root entity stores its direct parent document ID and type in a `TypedDocumentReference`. This keeps documents small, avoids write conflicts when different items in the same container are modified concurrently, and allows the hierarchy to grow without bound.

On top of the hierarchy, an **action log** records every meaningful event — checking an item out, returning it, moving it, disposing it. The same action mechanism doubles as a **task planner**: actions can be created with status `planned` and a due date, then marked `completed` or `skipped` in the lab. This powers auto-reminders (e.g., "return this plate to the freezer") and expiry-based disposal workflows.

Finally, **templates** capture frequently used configurations (e.g., "cardboard box for 96 eppendorf tubes") so users don't re-enter the same values every time they register a new container or item.

## Entity Hierarchy

```console
Room                          (top-level; hierarchy root)
  └── StorageEquipment        (freezer, fridge, shelf, nitrogen tank, …)
        └── Container         (rack, box, bag, tray, …)
              ├── Container   (containers can nest arbitrarily)
              │     └── InventoryItem
              └── InventoryItem

InventoryTask                 (planned lab task; separate document for independent queries)
InventoryTemplate             (preset defaults for creating entities)

Each Container and InventoryItem embeds an actionLog[]
for its audit trail (`InventoryActionLogEntry` entries).
```

### Room

A physical location in a building — the root of every storage hierarchy. Rooms have a human-readable `slug`, a building, and an optional floor number. Every piece of equipment stores a typed `parent` reference to exactly one room.

### StorageEquipment

A piece of storage hardware inside a room: freezers (−25 °C, −80 °C), fridges (+4 °C), liquid nitrogen tanks (−196 °C), shelves, or cabinets. Equipment records its target temperature as a **category** (see [decision 12](#12-categorical-storage-temperature)), optional grid dimensions (rows × columns × levels), and hardware details (manufacturer, model, serial number) for maintenance tracking.

Equipment can optionally restrict how many containers of each type it holds via its `capacity` field. Note that the stored document shape differs from the form/API shape — see [decision 11](#11-equipment-capacity-wire-shape-vs-stored-shape).

### Container

A nested storage unit: racks, boxes, bags, plates, bottles, jars. Containers can live inside equipment or inside other containers, enabling arbitrary nesting depth. Each container may define:

- **Grid layout** (`rows`, `columns`, `levels`) for structured positioning of children.
- **Capacity** — maximum number of direct children.
- **Acceptance rules** — `acceptedItemCategories` and `acceptedContainerCategories` restrict what can be placed inside. A rack might only accept boxes; a sample box might only accept eppendorf tubes. When set to `null`, any child is accepted.
- **Classification** — whether the container holds samples, reagents, consumables, or mixed contents.

### InventoryItem

The trackable unit at the leaves of the tree. Items have two orthogonal categorisation axes:

- **`category`** describes the physical form factor — _what the item IS_: eppendorf tube, falcon tube, cryovial, 96-well plate, 384-well plate, microscopy slide, etc.
- **`classification`** describes the domain purpose — _what the item is FOR_: sample, reagent, sequencing library, consumable, or equipment.

This separation matters because the same physical container type (e.g., an eppendorf tube) can hold very different things (a DNA sample vs. a buffer reagent), and the system needs to reason about both dimensions independently.

Items carry lab-specific fields: `quantity`, `unit`, `concentration`, `concentrationUnit`, `arrivalDate`, `openingDate`, `expiryDate`, `lotNumber`, and `barcode`. A `metadata` escape hatch (`Record<string, unknown>`) exists for truly ad-hoc data that doesn't warrant a typed field.

An item may be placed directly in storage equipment or in a container. Container parents enforce their declared item acceptance and count/grid capacity; storage equipment currently does not declare item capacity and therefore accepts direct items without occupancy bookkeeping. Items are leaves and cannot contain child inventory.

#### Item Status Lifecycle

| Status | Meaning |
| -------- | --------- |
| `available` | In storage, ready for use |
| `in_use` | Temporarily removed from storage for handling |
| `reserved` | Claimed for upcoming work but still in storage |
| `expired` | Past its expiry date |
| `disposed` | Permanently discarded |
| `lost` | Cannot be located |

### InventoryActionLogEntry (embedded audit log)

Every `Container` and `InventoryItem` document carries an `actionLog: InventoryActionLogEntry[]` array — an append-only, embedded audit trail of handling events. Each entry records one action (checkout, return, move, dispose, etc.) with the user who performed it and a timestamp.

Embedding the log directly in entity documents means that fetching an item automatically returns its full history — no secondary query needed. Entries are compact (`~100–150 bytes each`) and immutable once written.

```ts
interface InventoryActionLogEntry {
  actionType: InventoryActionType
  firnUser: TypedDocumentReference<FirnUser>
  timestamp: string     // ISO 8601
  notes?: string
  flag?: InventoryFlagType
  changes?: InventoryActionChangeRecord[]
  linkedTaskId?: string // if triggered by a planned task
}
```

### InventoryTask (planned tasks)

Planned lab operations that need scheduling, assignment, and lifecycle management. Unlike embedded log entries, tasks are **separate CouchDB documents** so they can be independently queried — overdue tasks, tasks assigned to a specific user, pending disposal tasks, etc.

When a task is completed, an `InventoryActionLogEntry` is appended to the target entity's embedded log and the task document is marked `completed`. This ensures the audit trail lives with the entity while tasks remain independently queryable.

Tasks have a lifecycle: `planned` → `completed` | `skipped` | `cancelled`.

#### Action Types

| Type | Purpose |
| ------ | --------- |
| `register` | Initial registration in inventory |
| `checkout` | Remove from storage for temporary use |
| `return` | Put back in storage after checkout |
| `move` | Relocate to a different parent or position |
| `reserve` | Reserve for future use |
| `unreserve` | Release a reservation |
| `dispose` | Discard permanently |
| `mark_expired` | Mark an item as expired |
| `post_missing` | Mark an item as lost and remove it from storage |
| `modify` | Properties changed (label, quantity, etc.) |
| `locate` | Re-place a lost item into storage |
| `flag` | Flag for attention (low quantity, issue) |
| `unflag` | Remove a flag category |
| `note` | Observation or comment (informational only) |

#### Linked Tasks

Some tasks come in pairs. When an item is checked out, the system automatically creates a `planned` return task linked via `linkedTaskId`. If the user disposes the item instead of returning it, the pending return task is skipped. This pairing ensures nothing is forgotten.

### InventoryTemplate

Reusable presets for creating containers, equipment, or items. A template like "Cardboard box for 96 eppendorfs" pre-fills grid dimensions (8 × 12), capacity (96), and acceptance rules (eppendorf tubes only). Templates store defaults — once an entity is created from a template, it is independent. Changing the template does not retroactively affect existing entities.

## Key Design Decisions

### 1. Separate documents, not embedded arrays

The first draft of the inventory system embedded children as arrays inside their parent document (e.g., a freezer document contained a `StorageUnit[]` array). This was replaced with reference-based documents for three reasons:

- **Unbounded growth** — A freezer with hundreds of items would produce a single enormous document.
- **Write conflicts** — CouchDB uses optimistic concurrency. If two users modify different items in the same freezer simultaneously, both would need to update the same parent document, causing revision conflicts.
- **Independent updates** — Moving an item only requires updating the item document, not the source and destination parent documents.

### 2. Direct typed parent references

Each entity below the room level stores only a typed reference to its immediate parent: `{ db: 'firn', id, type }`. The reference’s `id` drives the `by_parent` and `children_count` views, while `type` distinguishes room, equipment, and container parents without trusting client input.

**Why this matters**: Direct-child queries such as _"show this freezer’s contents"_ are answered with one indexed view request. A breadcrumb or complete ancestry chain is resolved by following parent references, avoiding denormalized paths that would need cascade updates whenever a container moves.

**Trade-off**: Descendant-wide queries are not materialized. They require traversal of the parent references or a future, explicitly maintained ancestry index.

### 3. CouchDB views, not Mango indexes

The project prefers MapReduce views over Mango indexes for inventory queries. View definitions live as design-document JSON files in `server/database/couchdb-views/` and are bootstrapped into the database by `ensureViews()` in `server/crud/views.ts` at startup. Two design documents are used:

- **`_design/firn-inventory`** — Hierarchy queries: `by_type`, `by_slug`, `by_parent`, `by_status`, `by_expiry`, `by_barcode`, `by_category`, `templates_by_kind`, `children_count`, `grid_occupancy`, `capacity_by_accepted_category`, `by_project`.
- **`_design/firn-inventory-actions`** — Action queries: `by_target`, `by_status`, `by_assignee`, `planned_for_target`.

### 4. Typed `parent` references

The codebase uses `TypedDocumentReference` (from `types/references.d.ts`) for inventory hierarchy edges. It stores the parent’s database, document ID, and document type in one compact shape:

```ts
parent: { db: 'firn', id: parent._id, type: parent.type }
```

All inventory documents currently live in the `firn` database, but using the typed form keeps runtime parent validation explicit and lets CouchDB views index `parent.id` and `parent.type` directly. The server derives these references from fetched parent documents; clients supply a public slug and expected parent kind rather than CouchDB IDs.

### 5. Hybrid action model: embedded log + separate tasks

Rather than using a single document type for both audit logging and task planning (which leads to document proliferation) or embedding everything (which makes cross-entity task queries impossible), the system uses a **hybrid approach**:

- **Completed events** are stored as compact `InventoryActionLogEntry` entries embedded in the entity's `actionLog` array. This means fetching an item returns its complete history — no secondary query needed.
- **Planned tasks** are separate `InventoryTask` documents with their own lifecycle. This enables independent queries: "show me all overdue tasks", "tasks assigned to me", "pending disposal tasks for expiring reagents."

When a planned task is completed, an `InventoryActionLogEntry` is appended to the target entity and the task document is marked `completed`. This ensures the audit trail always lives with the entity while tasks remain independently queryable.

The `status` lifecycle for tasks is: `planned` → `completed` | `skipped` | `cancelled`. Completed tasks are effectively frozen.

### 6. Grid-based positioning

Storage equipment and containers can optionally define a grid layout (`rows` × `columns` × `levels`). Children placed inside specify their `GridPosition` — a `{row, column, level?, label?}` tuple. The system validates that positions are within bounds and unoccupied before placement.

This models real-world lab storage accurately: a 96-tube box is an 8 × 12 grid, a rack with 5 shelves is a 1 × 1 × 5 grid, a nitrogen tank with 6 canisters arranged in 2 levels of 3 is a 1 × 3 × 2 grid. The optional `label` field allows human-readable names like "A3" or "Slot 7".

When a grid is not defined (`rows`/`columns` are `null`), children are unstructured — they belong to the parent but have no specific position.

### 7. Templates as snapshot defaults

Templates store default values (grid dimensions, acceptance rules, category, classification) that are applied at creation time. The created entity receives a copy of those defaults and a `templateId` reference for provenance. After creation, entity and template are independent — this is intentional. If templates used live inheritance, changing a template would retroactively alter the properties of hundreds of existing containers, which would be confusing and dangerous in a lab setting.

### 8. Category vs. classification (two-axis typing)

Items and containers both have a `classification` field, while items additionally have a `category` field. This two-axis approach exists because physical form and purpose are independent dimensions:

- A **cryovial** (category) might contain a **sample** or a **reagent** (classification).
- A **96-well plate** (category) might hold **samples**, **sequencing libraries**, or **reagents**.

Acceptance rules on containers can filter by either axis — a sample box might accept any category but only `sample` classification, while a plate rack might accept only `plate96` and `plate384` categories regardless of classification.

### 9. Querying free capacity (location suggestions)

A common lab task is _"I need to store 5 × 96-well plates — where is there room?"_ In a document database with a bottom-up tree (each child stores its parent, parents don't list children), answering this requires knowing both **what each container accepts** and **how full it currently is**. The system solves this with a two-query indexed approach rather than recursive traversal:

1. **`capacity_by_accepted_category` view** — Indexes every active container by the categories it accepts. A container with `acceptedItemCategories: ['plate96', 'plate384']` emits two entries. Containers and equipment with no acceptance restrictions emit under a `['any', 'any']` wildcard key. Each emitted value includes the container's declared `capacity`.

2. **`children_count` view** — A map+reduce view (`_count`) that emits every child document's `parent.id`. Queried with `group=true` and a list of candidate IDs, it returns the current occupancy of each candidate in a single round-trip.

3. **Server-side join** — `ContainerService.suggestLocations()` runs both view queries in parallel, computes `available = capacity − occupied` per candidate, and filters for `available ≥ requested count`. Results can be further narrowed by classification, ancestor subtree (e.g. "only in Freezer X"), and sorted by temperature preference (closest match first) then by most available space.

This approach is efficient because both queries hit B-tree indexes — O(log n) per key — and the join operates over a small candidate set. No recursive ancestry walking is needed.

### 10. Project references

Containers and items can be associated with projects from the read-only projects database via a `projectRefs` field of type `DocumentReferenceMap` (defined in `types/references.d.ts`). This is a `Record<string, DocumentReference | DocumentReference[]>` that allows named, typed cross-database links:

```ts
projectRefs: {
  primary: { db: 'projects', id: 'proj:P12345', type: 'project' },
  related: [
    { db: 'projects', id: 'proj:P67890', type: 'project' }
  ]
}
```

The `projectRefs` field is `null` when no project association exists. It is intentionally an outbound-only link — the projects database is read-only to the application, so references are stored on the inventory side.

**Reverse lookup**: The `by_project` CouchDB view indexes all `projectRefs` entries, emitting `[db, projectId]` as the key. Querying `key=["projects", "proj:P12345"]` returns every container and item linked to that project. Note that CouchDB does not support cross-database views — this view lives in the firn database and indexes the `projectRefs` field of inventory documents.

While the inventory hierarchy uses typed `parent` references for its dense, single-database tree (see decision 4), project references use the generic `DocumentReference` mechanism because they cross database boundaries and are sparse — most inventory entities will not be linked to a project.

### 11. Equipment capacity: wire shape vs. stored shape

Capacity restrictions on StorageEquipment exist in **two deliberately different representations**, and the conversion between them happens **exclusively server-side in the CRUD service**:

- **Wire/form shape** (`schemas/inventory/equipment.ts`, `equipmentCapacitySchema`): `{ type: ContainerType, capacity: number }[]`. This is what the capacity editor UI produces and what `createEquipment`/`updateEquipment` tRPC procedures accept. It carries no occupancy state.
- **Stored document shape** (`equipmentCapacityEntrySchema` → `EquipmentCapacityEntry[]`): the wire shape **plus a required, server-owned `stored` occupancy counter** per entry, e.g. `[{ type: 'box', stored: 3, capacity: 10 }]`. `stored` is bookkeeping maintained by `adjustStoredCount` and is never accepted from the client (the wire schema simply has no such field, and zod strips unknown keys).

`EquipmentService` converts on write (`validateAndJoinEquipmentCapacity` merges new limits with existing `stored` counts and initialises new categories with `stored: 0`); `displayCapacityToFormCapacity` in `app/utils/inventory/equipment.ts` drops `stored` again on read.

The `stored` field being **required** is what makes the split compiler-enforced: raw wire input is missing `stored`, so storing it unconverted fails typechecking. An earlier design used `Partial<Record<ContainerType, …>>` — with all keys optional, the flat wire array was structurally assignable to it, and a bug where `createEquipment` stored raw form rows compiled cleanly and crashed the frontend at render time. When adding capacity-style fields to other entities (e.g. Containers), copy this pattern: stored shape = wire shape + at least one required server-owned field, converted in the CRUD service.

> ⚠️ **Related pitfall — index signatures disable these checks.** `BaseDocument` deliberately does **not** extend `CloudantV1.Document`, whose `[propName: string]: any` index signature would leak into every document interface. `Omit<T, …>` over a type with a string index signature collapses *all* properties to `any`, so the typed document literals in the CRUD services would silently stop being checked. Keep index signatures out of document types; where an external document really is open-shaped (LIMS projects), declare `[key: string]: unknown` explicitly — `unknown` still forces narrowing.

### 12. Categorical storage temperature

StorageEquipment, Container, and InventoryItem describe their temperature with a **category** rather than an arbitrary number. The canonical model lives in `schemas/inventory/temperature.ts` (a plain-TS + Zod module shared by both `server/` and `app/`):

- **`temperatureCategory`** — a Zod enum: `liquid_nitrogen` (−196 °C), `deep_freezer` (−80 °C), `freezer` (−25 °C), `fridge` (+4 °C), `ambient` (~21 °C), `incubator` (+37 °C), and `other`. `TEMPERATURE_CATEGORY_CELSIUS` maps every non-`other` category to a representative °C used for display and sort ordering; `TEMPERATURE_CATEGORY_LABELS` supplies the UI labels.
- **`temperatureCelsius`** — the original numeric field is retained but now only carries a value for the `other` bucket (a free custom temperature). `normalizeStoredCelsius(category, celsius)` is applied on every CRUD write so that predefined categories always store `null` and derive their °C from the category.

**Compatibility** is category equality, not float equality. `temperaturesCompatible(child, parent)` returns `true` when the child has no explicit category (unspecified fits anywhere) or the categories match — and, for `other`, the free numeric values match too. `assertTemperatureCompatible` / `assertContainerTemperatureCompatible` enforce this on create and move; `updateContainer`/`updateItem` re-validate against the current parent when the temperature changes. `getMoveTargetsForItems` groups the selected items by category (a shared destination requires one distinct category, plus one numeric for `other`), filters candidate parents by `temperaturesCompatible`, and sorts by `resolveEffectiveCelsius` (coldest first) then name.

Use `formatTemperature(category, celsius)` for all display surfaces (cards, tables, dialogs) and `TEMPERATURE_CATEGORY_OPTIONS` / `resolveTemperatureCategoryFromSelect` (from `app/utils/inventory/temperature.ts`) for the form `NSelect` pickers. Equipment, container, and item creation/edit forms all expose the categorical selector plus a conditional custom-°C input for `other`.

### 13. Cloning inventory entities reuses the create path

Equipment, container, and item detail pages expose a **Clone** dialog for quickly
registering a similarly configured entity. Cloning is not a separate database
operation: `DialogCloneInventoryEntity` transforms the source display DTO into
wire/form defaults and renders the existing create stepper. The normal create
mutation remains responsible for validation, capacity reservation, document
initialization, cache invalidation, notifications, and navigation to the new
entity.

Clones are created under the source entity's current parent (equipment in the
same room; containers/items in the same equipment or container). Unplaced
containers/items do not show Clone because creation requires an explicit parent.

Reusable setup is copied:

- Equipment: type, description, container/item capacities, temperature,
  manufacturer/model, and active state.
- Container: type, classification, description, capacity, and temperature.
- Item: type, classification, description, quantity/unit, concentration/unit,
  temperature, notes, and metadata.

Identity, placement, and lifecycle data is deliberately cleared or regenerated:
name, label, barcode, serial/sensor IDs, positions, dates, lot/template/project
references, status, flags, action logs, slugs, timestamps, CouchDB IDs, and
revisions. Capacity helpers project stored entries back to their wire shapes, so
server-owned `stored` occupancy counters are never cloned. The create services
initialize the clone's occupancy counters at zero.

The three create steppers accept optional typed initial values. Container and
item creation also expose the same categorical temperature controls as their
edit forms; this is part of the normal create workflow, not clone-only UI.
Closing and reopening the clone dialog remounts the stepper and discards any
partial edits.

### 14. Scanning a set of barcodes, not one barcode at a time

The scanner workflow is built around a **set** of codes rather than a single scan.
The user gathers what they are handling — some vials, the box they came out of,
optionally an action card — and the whole set is interpreted together. The format
and the action-card table are documented in `docs/barcodesAndQRCodes.md`.

Interpretation happens in `server/crud/inventory/barcode-scan.server.ts`:

1. **Parse locally.** Each code's prefix and check character are verified before any
   database access, so misreads never reach CouchDB. Malformed, unknown and
   duplicate codes are reported but never abort the usable part of the scan.
2. **Resolve in one query.** Every entity code is looked up in a single multi-key
   query against the pre-existing `by_barcode` view. That view keys on the bare
   barcode with no document type, which is exactly what makes uniqueness global —
   and why every resolved document must be type-checked afterwards.
3. **Split into targets and context.**
4. **Derive an action per target**, validated individually.

**Equipment can never be a target.** It has no `status` and no `actionLog`, so an
`fe…` code is only ever location context. This is a structural constraint, not a
policy choice.

#### Which container is the location?

A scanned container is genuinely ambiguous: "check out this box" and "put these
tubes back in this box" produce identical scans. The two are distinguished by the
operation:

- For **lifecycle actions** (the checkout/return toggle, dispose, reserve, …) the
  context is where the entities already are, so a scanned container is the location
  exactly when it encloses something else in the set. A container that encloses
  nothing scanned is a target in its own right. Where both a container and its
  equipment are scanned, the container wins — it names the exact shelf.
- For **move and locate** the destination is by definition *not* the current parent,
  so the enclosure test cannot identify it. The destination is instead the **last
  location scanned**, which matches the physical workflow of gathering the entities
  first and scanning the shelf they are going onto last.

Because there is no materialised ancestry index, enclosure is determined by walking
the `parent` chain.

#### Relocation is never implicit

Scanning a container that is not a target's current parent produces a
`parent_mismatch` **warning**, and the checkout or return still applies where the
entity actually is. It does **not** move anything. Moving requires an explicit
`move` card.

This is deliberate. It is far too easy to keep adding to a scanned set across two
unrelated operations without resetting it, and silently relocating inventory on the
strength of a forgotten scan would be the worst possible failure mode for a freezer.

#### Move and locate bypass the status/action matrix

`STATUS_ACTION_MATRIX` describes lifecycle transitions. `move` appears in **no**
status row, because relocation is a dedicated workflow rather than a state change —
gating it on the matrix would reject every move. Relocating actions are therefore
checked against their own preconditions: `locate` requires the entity to be `lost`,
and `move` requires it to be placed somewhere at all.

#### Resolve and apply are separate, and apply re-resolves

`resolveBarcodes` is a pure query returning a reviewable plan, so the UI can
re-resolve after every additional scan. `applyBarcodeScan` accepts only the raw
codes and **re-resolves them server-side** before executing. It never trusts a
client-supplied plan: statuses can change between review and confirmation, and a
forged plan would otherwise bypass the state machine entirely.

Execution groups targets by action *and* entity kind, then delegates to the existing
`alterItem` / `alterContainer` / `moveItem` / `moveContainer` / `locateItem` /
`locateContainer` services. Grouping by kind is needed because items and containers
have separate services; grouping by action is needed because the default toggle can
legitimately yield `checkout` for one entity and `return` for another in the same
set. No new lifecycle semantics are introduced.

#### Ambiguity is surfaced, never guessed

Two different action cards, a move or locate without a destination, or a target in a
status that forbids the action each produce an explicit error or a non-executable
target carrying a human-readable reason — rather than a silently reinterpreted
operation.

#### Re-issuing a barcode orphans the printed label

Re-issue requires an explicit opt-in and is recorded in the entity's action log as a
`modify` entry naming both codes, so the history explains why a physical label
stopped working.

## CRUD Service Organisation
All database operations are implemented as service objects in `server/crud/inventory`:

| File | Service | Responsibility |
|------|---------|----------------|
| `inventory/containers.server.ts` | `ContainerService` | Container CRUD, nesting, acceptance/capacity enforcement, descendant queries, location suggestions, project lookups |
| `inventory/equipment.server.ts` | `EquipmentService` | Storage to Equipment CRUD |
| `inventory/items.server.ts` | `ItemService` | Item CRUD, status transitions (checkout/return/reserve/dispose), search, expiry queries |
| `inventory/room.server.ts` | `RoomService` | Room CRUD, equipment-to-room moves |
| `inventory/barcodes.server.ts` | `BarcodeService` | Barcode generation, cross-type uniqueness, lookup, issue/re-issue |
| `inventory/barcode-scan.server.ts` | `BarcodeScanService` | Interpreting a scanned set into a plan, and executing it via the services above |
| `inventory/tasks.server.ts` | `TaskService` | Planned task lifecycle, auto-reminders, overdue detection, expiry task generation |
| `inventory/templates.server.ts` | `TemplateService` | Template CRUD, applying defaults to create payloads |

## Automated Workflows

### Checkout → Return Reminder

1. User checks out an item → status becomes `in_use`.
2. A `checkout` entry is appended to the item's embedded `actionLog`.
3. System creates a planned `return` task (separate `InventoryTask` document) assigned to the user.
4. If the user returns the item → the planned return task is completed, and a `return` log entry is appended.
5. If the user disposes the item instead → all pending tasks for that item are skipped.

### Expiry-Based Disposal

1. `TaskService.createExpiryTasks(beforeDate)` scans for items where `expiryDate ≤ beforeDate` and `status = 'available'`.
2. Items that already have a pending disposal task are skipped (no duplicates).
3. For the rest, planned `dispose` tasks are created.
4. A user reviews the tasks and either completes them (disposing the item) or skips them (extending shelf life or ignoring).

This method can be called on-demand from a tRPC procedure or scheduled via a Nitro server task.
