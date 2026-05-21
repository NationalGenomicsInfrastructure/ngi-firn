# Inventory System

The inventory module tracks where physical items — sample plates, reagents, sequencing libraries, consumables — are stored in the lab. Its primary purpose is answering the question _"where is this thing right now?"_ and maintaining an auditable history of who handled it and when.

## High-Level Idea

Our genomics facility stores thousands of items across rooms, freezers, fridges, nitrogen tanks, shelves, boxes, racks, and bags. These form a **tree hierarchy**: rooms contain equipment, equipment contains containers, containers can nest inside other containers, and items sit at the leaves.

The system models this tree as **separate CouchDB documents linked by parent references** rather than embedding children inside their parents. Each entity is its own document with a `parentId` pointing upward. This keeps documents small, avoids write conflicts when different items in the same container are modified concurrently, and allows the hierarchy to grow without bound.

On top of the hierarchy, an **action log** records every meaningful event — checking an item out, returning it, moving it, disposing it. The same action mechanism doubles as a **task planner**: actions can be created with status `planned` and a due date, then marked `completed` or `skipped` in the lab. This powers auto-reminders (e.g., "return this plate to the freezer") and expiry-based disposal workflows.

Finally, **templates** capture frequently used configurations (e.g., "cardboard box for 96 eppendorf tubes") so users don't re-enter the same values every time they register a new container or item.

## Entity Hierarchy

```
Room                          (top-level; hierarchy root)
  └── StorageEquipment        (freezer, fridge, shelf, nitrogen tank, …)
        └── Container         (rack, box, bag, plate, …)
              ├── Container   (containers can nest arbitrarily)
              │     └── InventoryItem
              └── InventoryItem

InventoryTask                 (planned lab task; separate document for independent queries)
InventoryTemplate             (preset defaults for creating entities)

Each StorageEquipment, Container, and InventoryItem embeds an actionLog[]
for its audit trail (ActionLogEntry entries).
```

### Room

A physical location in a building — the root of every storage hierarchy. Rooms have a human-readable `roomId`, a building, and an optional floor number. Every piece of equipment must belong to exactly one room.

### StorageEquipment

A piece of storage hardware inside a room: freezers (−20 °C, −80 °C), fridges (+4 °C), liquid nitrogen tanks (−196 °C), shelves, or cabinets. Equipment records its target temperature, optional grid dimensions (rows × columns × levels), and hardware details (manufacturer, model, serial number) for maintenance tracking.

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

Items carry lab-specific fields: `quantity`, `unit`, `concentration`, `concentrationUnit`, `expiryDate`, `lotNumber`, and `barcode`. A `metadata` escape hatch (`Record<string, unknown>`) exists for truly ad-hoc data that doesn't warrant a typed field.

#### Item Status Lifecycle

| Status | Meaning |
|--------|---------|
| `available` | In storage, ready for use |
| `checked_out` | Temporarily removed from storage for handling |
| `reserved` | Claimed for upcoming work but still in storage |
| `expired` | Past its expiry date |
| `disposed` | Permanently discarded |
| `lost` | Cannot be located |
| `damaged` | Physically damaged, may need disposal |

### ActionLogEntry (embedded audit log)

Every `StorageEquipment`, `Container`, and `InventoryItem` document carries an `actionLog: ActionLogEntry[]` array — an append-only, embedded audit trail of handling events. Each entry records one action (checkout, return, move, dispose, etc.) with the user who performed it and a timestamp.

Embedding the log directly in entity documents means that fetching an item automatically returns its full history — no secondary query needed. Entries are compact (`~100–150 bytes each`) and immutable once written.

```ts
interface ActionLogEntry {
  actionType: InventoryActionType
  userId: string        // who performed the action
  timestamp: string     // ISO 8601
  notes?: string
  fromParentId?: string // for moves/checkout/return
  toParentId?: string
  linkedTaskId?: string // if triggered by a planned task
}
```

### InventoryTask (planned tasks)

Planned lab operations that need scheduling, assignment, and lifecycle management. Unlike embedded log entries, tasks are **separate CouchDB documents** so they can be independently queried — overdue tasks, tasks assigned to a specific user, pending disposal tasks, etc.

When a task is completed, an `ActionLogEntry` is appended to the target entity's embedded log and the task document is marked `completed`. This ensures the audit trail lives with the entity while tasks remain independently queryable.

Tasks have a lifecycle: `planned` → `completed` | `skipped` | `cancelled`.

#### Action Types

| Type | Purpose |
|------|---------|
| `register` | Initial registration in inventory |
| `checkout` | Remove from storage for temporary use |
| `return` | Put back in storage after checkout |
| `move` | Relocate to a different parent or position |
| `reserve` | Reserve for future use |
| `unreserve` | Release a reservation |
| `dispose` | Discard permanently |
| `modify` | Properties changed (label, quantity, etc.) |
| `flag` | Flag for attention (low quantity, issue) |
| `note` | Observation or comment (informational only) |
| `discard_expired` | Dispose due to expiry (system-suggested) |

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

### 2. Materialized `locationPath` for fast ancestry queries

Each entity below the room level stores a `locationPath` — an ordered array of `{id, type}` tuples from the root room down to the direct parent. This is a denormalized copy of the ancestry chain, trading write cost on moves for fast reads.

**Why this matters**: The primary use case is _"find everything stored in Freezer X"_ or _"show me the full path to this item."_ Without a materialized path, answering these questions in a document database requires recursive lookups — fetching the parent, then the grandparent, and so on. With `locationPath`, a single CouchDB MapReduce view (`by_ancestor`) can return all descendants of any entity in one query.

**Why only IDs, not names**: The `locationPath` deliberately stores only `{id, type}` — not `name` or `label`. Names are mutable (a room can be renamed), and duplicating mutable data across hundreds of descendant documents creates a synchronisation burden. When a display breadcrumb is needed, `resolveLocationBreadcrumb()` batch-fetches all ancestor documents by ID in a single `_all_docs` call.

**Trade-off**: When a container is moved, every descendant's `locationPath` must be updated. This is a cascade write via `bulkUpdateDocuments()`. Moves of large subtrees (e.g., moving a full rack with hundreds of items) are expensive, but they are rare compared to reads. The system is optimised for the common case.

### 3. CouchDB views, not Mango indexes

The project prefers MapReduce views over Mango indexes for inventory queries. View definitions live as reference JSON files in `docs/couchdb-views/` and are bootstrapped into the database by `ensureInventoryViews()` at startup. Two design documents are used:

- **`_design/firn-inventory`** — Hierarchy queries: `by_type`, `by_parent`, `by_ancestor`, `by_status`, `by_expiry`, `by_barcode`, `by_category`, `templates_by_kind`.
- **`_design/firn-inventory-actions`** — Action queries: `by_target`, `by_status`, `by_assignee`, `planned_for_target`.

### 4. `parentId`/`parentType` over `DocumentReference`

The codebase has a generic `DocumentReference` type (in `types/references.d.ts`) designed for sparse cross-database links — e.g., a user document pointing at a todo document, or a bookmark referencing a project in an external database. It carries a `db` field for cross-database targeting and an optional `type` discriminator.

The inventory hierarchy intentionally does **not** use this mechanism:

- All inventory documents live in the same database — the `db` field would be constant noise.
- The hierarchy relies on `parentType` being mandatory for validation, view queries, and acceptance rules. `DocumentReference.type` is optional.
- `locationPath` is a domain-specific concept (ordered ancestry array) that has no equivalent in the generic reference model.
- CouchDB views emit `parentId` as a simple string key. Wrapping it in `{db, id, type?}` objects would complicate every view for zero benefit.

The `parentId`/`parentType` pair is the right pattern for a dense, single-database tree with validation logic tied to the parent relationship.

### 5. Hybrid action model: embedded log + separate tasks

Rather than using a single document type for both audit logging and task planning (which leads to document proliferation) or embedding everything (which makes cross-entity task queries impossible), the system uses a **hybrid approach**:

- **Completed events** are stored as compact `ActionLogEntry` entries embedded in the entity's `actionLog` array. This means fetching an item returns its complete history — no secondary query needed.
- **Planned tasks** are separate `InventoryTask` documents with their own lifecycle. This enables independent queries: "show me all overdue tasks", "tasks assigned to me", "pending disposal tasks for expiring reagents."

When a planned task is completed, an `ActionLogEntry` is appended to the target entity and the task document is marked `completed`. This ensures the audit trail always lives with the entity while tasks remain independently queryable.

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

## CRUD Service Organisation

All database operations are implemented as service objects in `server/crud/`:

| File | Service | Responsibility |
|------|---------|----------------|
| `inventory-helpers.server.ts` | _(functions)_ | ID generation, `locationPath` building, cascade updates, validation, view bootstrap |
| `inventory-locations.server.ts` | `LocationService` | Room + StorageEquipment CRUD, equipment-to-room moves |
| `inventory-containers.server.ts` | `ContainerService` | Container CRUD, nesting, acceptance/capacity enforcement, descendant queries |
| `inventory-items.server.ts` | `ItemService` | Item CRUD, status transitions (checkout/return/reserve/dispose), search, expiry queries |
| `inventory-tasks.server.ts` | `TaskService` | Planned task lifecycle, auto-reminders, overdue detection, expiry task generation |
| `inventory-templates.server.ts` | `TemplateService` | Template CRUD, applying defaults to create payloads |

## Automated Workflows

### Checkout → Return Reminder

1. User checks out an item → status becomes `checked_out`.
2. A `checkout` entry is appended to the item's embedded `actionLog`.
3. System creates a planned `return` task (separate `InventoryTask` document) assigned to the user.
4. If the user returns the item → the planned return task is completed, and a `return` log entry is appended.
5. If the user disposes the item instead → all pending tasks for that item are skipped.

### Expiry-Based Disposal

1. `TaskService.createExpiryTasks(beforeDate)` scans for items where `expiryDate ≤ beforeDate` and `status = 'available'`.
2. Items that already have a pending `discard_expired` task are skipped (no duplicates).
3. For the rest, planned `discard_expired` tasks are created.
4. A user reviews the tasks and either completes them (disposing the item) or skips them (extending shelf life or ignoring).

This method can be called on-demand from a tRPC procedure or scheduled via a Nitro server task.
