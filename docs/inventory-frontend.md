# Inventory Frontend — Routes & UI Patterns

> Design reference for the Cold Storage Inventory frontend.
> Covers recommended routes, sidebar structure, and UI component choices.

---

## 1. Routes

| Route | Purpose |
|-------|---------|
| `/inventory` | Dashboard / overview |
| `/inventory/rooms` | Room list (cards grid) |
| `/inventory/rooms/[id]` | Room detail — equipment table inside |
| `/inventory/equipment/[id]` | Equipment detail — containers tree/table |
| `/inventory/containers/[id]` | Container detail — contents table |
| `/inventory/items/[id]` | Item detail — card with audit log timeline |
| `/inventory/search` | Global search across items and containers |
| `/inventory/find-space` | "Find a spot" wizard (`suggestLocations`) |
| `/inventory/templates` | Template management |
| `/tasks` | Already exists; extend for inventory tasks |

The key idea: **drill-down navigation mirrors the physical hierarchy** — Room → Equipment → Container → Item. Each level shows its children in context.

---

## 2. Sidebar Menu

Replace the current placeholder links in `MenuInventory.vue` with:

```
Cold Storage Inventory
  ├─ Overview           /inventory
  ├─ Locations          /inventory/rooms
  ├─ Search             /inventory/search
  ├─ Find Storage Spot  /inventory/find-space
  └─ Templates          /inventory/templates
```

---

## 3. UI Component Recommendations

### 3.1 Tree View — Hierarchy Navigation

A nested, expandable tree (using `NCollapsible` or a custom tree component) is the natural fit for **Room → Equipment → Container → Item**. Users think "I open Freezer A, then Rack 2, then Box 5." A flat table cannot convey depth.

Use a **tree panel on the left + detail card on the right** (master-detail layout) on the equipment and container detail pages.

### 3.2 Tables with Expandable Rows — Sibling Lists

Use `@tanstack/vue-table` (already in the project) for listing equipment in a room, containers in an equipment unit, or items in a container. The expandable row pattern already used elsewhere is perfect for showing item details (status, QC, expiry) without navigating away.

Tables are right for: **browse, sort, filter, bulk select**.

### 3.3 Dialogs — Quick Mutations

Checkout, return, reserve, unreserve, dispose, flag — these are **single-action confirmations**, not complex forms. An `NDialog` with a short message and a confirm button is ideal:

- User clicks a row action button → dialog opens → one click to confirm.
- Also use for delete confirmations.

### 3.4 Drawers — Create/Edit Forms

Creating or editing an item, container, or equipment involves 5–15 fields. An `NDrawer` (sliding in from the right) keeps context visible — the user can still see the table behind it. This is superior to a full-page form for CRUD because:

- No navigation away from the list.
- Form state is visually "layered" on top.
- The pattern is already established (`DrawerAdminTokens`).

### 3.5 Stepper — "Find Storage Spot" Wizard

The `suggestLocations` query needs several inputs: category, quantity, minimum capacity. A stepper (following the `StepperTokenGeneration` pattern) walks the user through:

1. **What are you storing?** — category, quantity
2. **Preferred location?** — optional room/equipment filter
3. **Results** — cards showing suggested spots with availability bars

This is much better than a single form → table, because it guides non-technical lab staff through the process step by step.

### 3.6 Cards Grid — Rooms Overview

Rooms are few (typically 5–10). A responsive card grid (`grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`) with each card showing room name, equipment count, and a capacity summary badge is more scannable than a table for this use case.

### 3.7 Vertical Timeline — Audit Log

The `actionLog` embedded in items is a chronological event list. Render it as a vertical timeline (following the `StepperProjectTimeline` / `StepperSampleTimeline` pattern). Each entry shows:

- Icon by action type
- Timestamp
- User who performed the action
- Notes

Much more readable than a table for event history.

### 3.8 Breadcrumb — Persistent Location Context

Since the hierarchy is deep, show a breadcrumb bar at the top of every detail page:

```
Room A → Freezer −80°C #2 → Rack 3 → Box 12 → Sample X
```

Use `itemBreadcrumbQuery` to populate it. This gives users instant spatial context. `NBreadcrumb` is available in UnaUI.

### 3.9 Command Palette — Power User Search

A `Cmd+K` / `Ctrl+K` command palette for quick item lookup by name or barcode. Calls `searchItems` with debounced input. Lab staff with gloves may prefer keyboard shortcuts over clicking through the tree.

### 3.10 Barcode Scanner Integration

The project already has `DialogZxingReader`. Hook it into item lookup — scan a barcode → navigate to the item detail page. Consider adding a floating scan button (FAB) visible on all inventory pages for quick access.

### 3.11 Tree Picker — Move Action

The **move** action (relocating an item or container) deserves special mention: the drawer should contain a mini tree-picker showing the hierarchy so users can click on the destination. This is far better than typing an ID or selecting from a flat dropdown.

---

## 4. Summary Matrix

| Action | UI Component | Rationale |
|--------|-------------|-----------|
| Browse hierarchy | Tree view (collapsible) | Matches physical mental model |
| List siblings | Table with expandable rows | Sort, filter, bulk select |
| Create / Edit entity | Drawer (slide-in form) | Keeps list context visible |
| Checkout / Return / Flag | Dialog (confirmation) | Single-action, no complex input |
| Delete | Dialog | Confirmation pattern |
| Find storage spot | Stepper wizard | Guided multi-step input |
| View audit log | Vertical timeline | Chronological event display |
| Navigate hierarchy | Breadcrumb | Persistent spatial context |
| Quick lookup | Command palette (`Cmd+K`) | Fast barcode/name search |
| Rooms overview | Card grid | Few items, visual scanning |
| Move item / container | Drawer with tree picker | Select destination visually |

---

## 5. Icon Assignments for Inventory Routes

| Context | Icon |
|---------|------|
| Rooms / rooms | `i-lucide-building-2` |
| Freezers / equipment | `i-lucide-thermometer-snowflake` |
| Containers / boxes | `i-lucide-box` |
| Items / samples | `i-lucide-test-tubes` |
| Search | `i-lucide-search` |
| Find storage spot | `i-lucide-map-pin` |
| Templates | `i-lucide-copy` |
| Audit log | `i-lucide-history` |
| Barcode scan | `i-lucide-scan-line` |

---

## 6. Queries & Mutations per Route

This section maps each route to the Pinia Colada queries it reads and the mutations it triggers. All imports come from `app/utils/queries/inventory/` and `app/utils/mutations/inventory/`.

### `/inventory` — Dashboard

The overview page aggregates high-level statistics and surfaces items that need attention.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `allRoomsQuery` | `queries/rooms` | — | Room count, list for capacity overview |
| `expiringItemsQuery` | `queries/items` | `beforeDate: string` (e.g. 30 days from now) | "Expiring soon" warning panel |
| `overdueTasksQuery` | `queries/tasks` | — | "Overdue tasks" warning panel |
| `itemsByStatusQuery` | `queries/items` | `status: 'checked_out'` | "Currently checked out" summary |

**Mutations:** None — the dashboard is read-only.

---

### `/inventory/rooms` — Rooms List

A card grid showing all rooms with equipment counts.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `allRoomsQuery` | `queries/rooms` | — | All rooms for the card grid |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `createRoom` | `mutations/rooms` | "Add Room" button | Drawer (form) |
| `updateRoom` | `mutations/rooms` | Edit icon on room card | Drawer (form) |
| `deleteRoom` | `mutations/rooms` | Delete icon on room card | Dialog (confirm) |

---

### `/inventory/rooms/[id]` — Room Detail

Shows room metadata and a table of equipment inside it.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `roomQuery` | `queries/rooms` | `roomId` (from route param) | Room name, building, notes |
| `equipmentByRoomQuery` | `queries/rooms` | `roomId` | Table of equipment in this room |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `updateRoom` | `mutations/rooms` | "Edit Room" button | Drawer (form) |
| `createEquipment` | `mutations/rooms` | "Add Equipment" button | Drawer (form) |
| `updateEquipment` | `mutations/rooms` | Edit action on table row | Drawer (form) |
| `moveEquipmentToRoom` | `mutations/rooms` | Move action on table row | Drawer (tree picker) |
| `deleteEquipment` | `mutations/rooms` | Delete action on table row | Dialog (confirm) |

---

### `/inventory/equipment/[id]` — Equipment Detail

Shows equipment metadata (temperature, model, serial number) and a tree/table of containers inside it. This is where the **tree view** is most useful — nested containers can be expanded inline.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `equipmentQuery` | `queries/rooms` | `equipmentId` (from route param) | Equipment metadata |
| `containersByParentQuery` | `queries/containers` | `equipmentId` | Top-level containers in this equipment |
| `itemBreadcrumbQuery` | `queries/items` | `equipmentId` | Breadcrumb (Room → Equipment) |

On expanding a container node in the tree, lazily fetch:

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `containerContentsQuery` | `queries/containers` | `containerId` | Children of expanded container |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `updateEquipment` | `mutations/rooms` | "Edit Equipment" button | Drawer (form) |
| `createContainer` | `mutations/containers` | "Add Container" button | Drawer (form) |
| `updateContainer` | `mutations/containers` | Edit action on tree node | Drawer (form) |
| `moveContainer` | `mutations/containers` | Move action on tree node | Drawer (tree picker) |
| `deleteContainer` | `mutations/containers` | Delete action on tree node | Dialog (confirm) |
| `createItem` | `mutations/items` | "Add Item" in a leaf container | Drawer (form) |

---

### `/inventory/containers/[id]` — Container Detail

Shows container metadata (category, capacity, grid layout) and its contents — child containers and items. Uses a table with expandable rows.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `containerQuery` | `queries/containers` | `containerId` (from route param) | Container metadata, capacity |
| `containerContentsQuery` | `queries/containers` | `containerId` | Table of child containers + items |
| `itemBreadcrumbQuery` | `queries/items` | `containerId` | Breadcrumb (Room → … → Container) |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `updateContainer` | `mutations/containers` | "Edit Container" button | Drawer (form) |
| `createContainer` | `mutations/containers` | "Add Sub-Container" button | Drawer (form) |
| `createItem` | `mutations/items` | "Add Item" button | Drawer (form) |
| `updateItem` | `mutations/items` | Edit action on item row | Drawer (form) |
| `moveItem` | `mutations/items` | Move action on item row | Drawer (tree picker) |
| `moveContainer` | `mutations/containers` | Move action on child container row | Drawer (tree picker) |
| `deleteItem` | `mutations/items` | Delete action on item row | Dialog (confirm) |
| `deleteContainer` | `mutations/containers` | Delete action on child container row | Dialog (confirm) |
| `checkoutItem` | `mutations/items` | Checkout button on item row | Dialog (confirm + optional notes) |
| `returnItem` | `mutations/items` | Return button on checked-out item | Dialog (confirm) |
| `reserveItem` | `mutations/items` | Reserve button on item row | Dialog (confirm + optional notes) |
| `unreserveItem` | `mutations/items` | Unreserve button on reserved item | Dialog (confirm) |
| `disposeItem` | `mutations/items` | Dispose button on item row | Dialog (confirm + reason) |
| `flagItem` | `mutations/items` | Flag button on item row | Dialog (confirm + reason) |

---

### `/inventory/items/[id]` — Item Detail

A full detail card for a single item: metadata, lab fields, status, project associations, and an audit timeline.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `itemQuery` | `queries/items` | `itemId` (from route param) | Full item data |
| `itemBreadcrumbQuery` | `queries/items` | `itemId` | Breadcrumb (Room → … → Item) |
| `tasksForTargetQuery` | `queries/tasks` | `itemId` | Planned tasks for this item |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `updateItem` | `mutations/items` | "Edit" button | Drawer (form) |
| `moveItem` | `mutations/items` | "Move" button | Drawer (tree picker) |
| `deleteItem` | `mutations/items` | "Delete" button | Dialog (confirm) |
| `checkoutItem` | `mutations/items` | "Checkout" button | Dialog |
| `returnItem` | `mutations/items` | "Return" button | Dialog |
| `reserveItem` | `mutations/items` | "Reserve" button | Dialog |
| `unreserveItem` | `mutations/items` | "Unreserve" button | Dialog |
| `disposeItem` | `mutations/items` | "Dispose" button | Dialog |
| `flagItem` | `mutations/items` | "Flag" button | Dialog |
| `createTask` | `mutations/tasks` | "Schedule Task" button | Drawer (form) |
| `completeTask` | `mutations/tasks` | "Complete" on task row | Dialog |
| `skipTask` | `mutations/tasks` | "Skip" on task row | Dialog |
| `cancelTask` | `mutations/tasks` | "Cancel" on task row | Dialog |

The **audit log** (embedded in the item document as `actionLog`) is displayed as a vertical timeline component — not queried separately. It is part of the `itemQuery` response.

---

### `/inventory/search` — Global Search

A search page with a text input and results table. Optionally combined with the barcode scanner.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `searchItemsQuery` | `queries/items` | `query: string` (debounced user input) | Search results table |

**Mutations:** None — search is read-only. Users click a result row to navigate to the item/container detail page where mutations are available.

---

### `/inventory/find-space` — Find Storage Spot Wizard

A stepper-based wizard that helps users find available storage rooms.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `allRoomsQuery` | `queries/rooms` | — | Room picker in step 2 (optional filter) |
| `suggestLocationsQuery` | `queries/containers` | `{ category, childType, count, classification?, ancestorId?, temperatureCelsius? }` | Results in step 3 |

**Parameters explained:**

- `category` — what kind of container to search for (e.g. `'96-well plate'`, `'box'`)
- `childType` — `'item'` or `'container'` (are you storing items or sub-containers?)
- `count` — how many slots you need
- `classification?` — filter by classification label (e.g. `'DNA'`, `'RNA'`)
- `ancestorId?` — restrict search to a specific room or equipment
- `temperatureCelsius?` — match equipment operating temperature

**Mutations:** None — this page only recommends spots. The user navigates to the suggested container to place items there.

---

### `/inventory/templates` — Template Management

A table of reusable defaults for creating equipment, containers, and items.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `templatesQuery` | `queries/templates` | `templateFor?: 'storageEquipment' \| 'container' \| 'inventoryItem'` | Filtered template list |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `createTemplate` | `mutations/templates` | "Add Template" button | Drawer (form) |
| `updateTemplate` | `mutations/templates` | Edit action on table row | Drawer (form) |
| `deleteTemplate` | `mutations/templates` | Delete action on table row | Dialog (confirm) |

---

### `/tasks` — Task Management (extend existing page)

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `plannedTasksQuery` | `queries/tasks` | `{ assignedTo?, targetId?, actionType?, overdueBefore? }` | Filtered task table |
| `overdueTasksQuery` | `queries/tasks` | — | Overdue highlight section |

**Mutations:**

| Mutation | Source file | Trigger | UI component |
|----------|-----------|---------|--------------|
| `createTask` | `mutations/tasks` | "New Task" button | Drawer (form) |
| `completeTask` | `mutations/tasks` | "Complete" action on row | Dialog |
| `skipTask` | `mutations/tasks` | "Skip" action on row | Dialog |
| `cancelTask` | `mutations/tasks` | "Cancel" action on row | Dialog |
| `createExpiryTasks` | `mutations/tasks` | "Generate Expiry Tasks" button (admin) | Dialog (confirm) |

---

### Cross-Cutting: Command Palette (`Cmd+K`)

Available from any inventory page. Not a route, but a global keyboard-triggered overlay.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `searchItemsQuery` | `queries/items` | `query: string` (debounced keystroke) | Live search results |

---

### Cross-Cutting: Barcode Scanner

Triggered from a floating action button or the search page. Uses `DialogZxingReader`.

**Queries:**

| Query | Source file | Parameters | Purpose |
|-------|-----------|------------|---------|
| `itemQuery` | `queries/items` | scanned barcode value as `itemId` | Navigate to item on successful scan |

---

## 7. Import Cheat Sheet

All query and mutation files live under `app/utils/`:

```
queries/inventory/
  ├─ rooms.ts    → allRoomsQuery, roomQuery, equipmentQuery, equipmentByRoomQuery
  ├─ containers.ts   → containerQuery, containersByParentQuery, containerContentsQuery,
  │                    containerDescendantsQuery, suggestLocationsQuery, containersByProjectQuery
  ├─ items.ts        → itemQuery, itemsByParentQuery, itemsByStatusQuery,
  │                    expiringItemsQuery, searchItemsQuery, itemBreadcrumbQuery
  ├─ tasks.ts        → taskQuery, tasksForTargetQuery, plannedTasksQuery, overdueTasksQuery
  └─ templates.ts    → templateQuery, templatesQuery

mutations/inventory/
  ├─ rooms.ts    → createRoom, updateRoom, deleteRoom,
  │                    createEquipment, updateEquipment, moveEquipmentToRoom, deleteEquipment
  ├─ containers.ts   → createContainer, updateContainer, moveContainer, deleteContainer
  ├─ items.ts        → createItem, updateItem, moveItem, deleteItem,
  │                    checkoutItem, returnItem, reserveItem, unreserveItem, disposeItem, flagItem
  ├─ tasks.ts        → createTask, completeTask, skipTask, cancelTask, createExpiryTasks
  └─ templates.ts    → createTemplate, updateTemplate, deleteTemplate
```

Since this is a Nuxt 4 project with auto-imports, these are available without explicit `import` statements in components and pages. However, for clarity and editor support, explicit named imports are recommended:

```ts
// In a .vue component <script setup>
import { useQuery as useQueryColada } from '@pinia/colada'
import { containerQuery, containerContentsQuery } from '~/utils/queries/inventory/containers'
import { createContainer, deleteContainer } from '~/utils/mutations/inventory/containers'
```

> **Reminder:** Always alias Pinia Colada's `useQuery` to avoid the naming clash with tRPC's `useQuery`. See section on "Naming collision" in the project's custom instructions.
