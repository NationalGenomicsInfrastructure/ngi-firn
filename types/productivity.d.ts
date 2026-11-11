import type { BaseDocument } from '../server/database/couchdb'
import type { FirnUser } from './auth'
import type { DocumentReference, TypedDocumentReference } from './references'
import type { InventoryActionType, InventoryStatusType } from '../schemas/inventory/metadata'
import type {
  Container,
  GridPosition,
  InventoryItem,
  Room,
  SerializedEntityRef,
  SerializedUserRef,
  StorageEquipment
} from './inventory'

// =============================================================================================
// Productivity domain — Tasks, steps, activations, operations and expiry reminders
// =============================================================================================
//
// A *task* is a shareable aggregate of ordered *steps*. A step is either a free-text ToDo or a
// concrete inventory action (checkout/return/move/locate for containers and items, dispose for
// items only). Planning records intent; only explicit confirmation records physical execution in
// the inventory.
//
// Storage layout (all discriminators carry schema 1):
//   TaskDocument         (type: 'task')           — aggregate: sharing, visibility, priority, links
//   TaskStepDocument     (type: 'taskStep')       — one step, stored separately from its task
//   TaskActivationDocument (type: 'taskActivation')— a frozen, executor-owned, held work manifest
//   TaskOperationDocument  (type: 'taskOperation') — durable idempotency/recovery record
//   ExpiryReminderDocument (type: 'expiryReminder')— per-item disposal reminder state (later phase)
//
// Stored shapes always carry required server-owned fields (lifecycle state, versions, audit,
// reservation ownership) that the client wire/form shapes omit, so that raw wire-to-stored
// assignment fails typechecking. Never add a string index signature to any document type.
// =============================================================================================

// ---------------------------------------------------------------------------------------------
// Actors and provenance
// ---------------------------------------------------------------------------------------------

/*
 * The agent that created or manages a task. Human tasks carry a user reference; automated cleanup
 * tasks carry a system-source discriminator instead of a fabricated Firn user. The discriminated
 * `kind` prevents code from reading `.user` on a system actor.
 */
export type TaskActor
  = | { kind: 'user', user: TypedDocumentReference<FirnUser> }
    | { kind: 'system', source: string }

/* Client-safe projection of a TaskActor (never exposes a CouchDB _id). */
export type DisplayTaskActor
  = | { kind: 'user', user: SerializedUserRef }
    | { kind: 'system', source: string }

/* How the executor reported a step outcome. */
export type TaskExecutionSource = 'scanner' | 'paper' | 'online'

// ---------------------------------------------------------------------------------------------
// Task-level enums
// ---------------------------------------------------------------------------------------------

/* Who may read a task. `public` means every approved application user, not anonymous internet. */
export type TaskVisibility = 'private' | 'public'

/*
 * Aggregate task lifecycle. `open` covers preliminary, partly activated and partly resolved work;
 * per-step and per-activation state is tracked on the respective documents, never inferred from
 * this field. `archivedAt` is an independent axis, not a status.
 */
export type TaskStatus = 'draft' | 'open' | 'completed' | 'cancelled'

/* Task-level importance axis of the two-dimensional priority model. */
export type TaskImportance = 'important' | 'ordinary'

/* Computed urgency axis: a task is urgent when due today or overdue in Europe/Stockholm. */
export type TaskUrgency = 'urgent' | 'not_urgent'

/* The four priority quadrants derived from importance × urgency. */
export type TaskQuadrant
  = | 'important_urgent'
    | 'important_not_urgent'
    | 'ordinary_urgent'
    | 'ordinary_not_urgent'

// ---------------------------------------------------------------------------------------------
// Step lifecycle and payloads
// ---------------------------------------------------------------------------------------------

/*
 * Per-step lifecycle. A step is `planned` until an activation acquires its holds (`held`), is
 * `executing` while a confirmation operation runs, then reaches a terminal `completed`/`skipped`/
 * `cancelled`. A failed or ambiguous operation enters `needs_reconciliation` and keeps its
 * protective holds until a human resolves it.
 */
export type TaskStepState
  = | 'planned'
    | 'held'
    | 'executing'
    | 'completed'
    | 'skipped'
    | 'cancelled'
    | 'needs_reconciliation'

/* Terminal result recorded for a resolved step. */
export type TaskStepResult = 'completed' | 'skipped' | 'cancelled' | 'failed'

/*
 * A frozen human-readable reference to an inventory object. `ref` is the authoritative internal
 * link (resolved by services); `slug`/`name`/`pathLabel` are display snapshots captured at
 * planning/activation time for paper output, never treated as object identity.
 */
export interface TaskInventoryObjectRef<TDoc extends BaseDocument = BaseDocument> {
  ref: TypedDocumentReference<TDoc>
  slug: string
  name: string
  /* Full human-readable source/destination path, e.g. "Freezer A › Rack F8 › Box 3". */
  pathLabel: string
}

/*
 * Destination for a move/locate step. `position` carries the exact grid cell fixed at activation
 * for grid-layout parents, and is null for count-based (equipment) destinations.
 */
export interface TaskInventoryDestination {
  parent: TaskInventoryObjectRef<StorageEquipment | Container | Room>
  position: GridPosition | null
}

/* Fields common to every inventory step payload. */
export interface TaskInventoryStepBase {
  kind: 'inventory'
  /* Lifecycle state the planner expects the target to be in; validated at activation. */
  expectedStatus: InventoryStatusType | null
  notes: string | null
}

/* Checkout has no destination; valid for both containers and items. */
export interface TaskInventoryCheckoutPayload extends TaskInventoryStepBase {
  action: 'checkout'
  targetKind: 'container' | 'item'
  target: TaskInventoryObjectRef<Container | InventoryItem>
}

/* Return has no destination; valid for both containers and items. */
export interface TaskInventoryReturnPayload extends TaskInventoryStepBase {
  action: 'return'
  targetKind: 'container' | 'item'
  target: TaskInventoryObjectRef<Container | InventoryItem>
}

/* Move requires a destination; valid for both containers and items. */
export interface TaskInventoryMovePayload extends TaskInventoryStepBase {
  action: 'move'
  targetKind: 'container' | 'item'
  target: TaskInventoryObjectRef<Container | InventoryItem>
  destination: TaskInventoryDestination
}

/* Locate (re-place a lost object) requires a destination; valid for containers and items. */
export interface TaskInventoryLocatePayload extends TaskInventoryStepBase {
  action: 'locate'
  targetKind: 'container' | 'item'
  target: TaskInventoryObjectRef<Container | InventoryItem>
  destination: TaskInventoryDestination
}

/*
 * Dispose is item-only by construction: `targetKind` is fixed to 'item' and the target is an
 * InventoryItem, so an attempt to model container disposal fails typechecking. No destination.
 */
export interface TaskInventoryDisposePayload extends TaskInventoryStepBase {
  action: 'dispose'
  targetKind: 'item'
  target: TaskInventoryObjectRef<InventoryItem>
}

/*
 * Discriminated union of inventory step payloads. The `action` discriminant narrows both the
 * permitted target kind and whether a destination is present, so impossible action/target
 * combinations (e.g. `dispose` of a container, `move` without a destination) do not typecheck.
 */
export type TaskInventoryStepPayload
  = | TaskInventoryCheckoutPayload
    | TaskInventoryReturnPayload
    | TaskInventoryMovePayload
    | TaskInventoryLocatePayload
    | TaskInventoryDisposePayload

/* Free-text ToDo step, optionally annotated with contextual (non-reserving) references. */
export interface TaskTextStepPayload {
  kind: 'text'
  title: string
  body: string | null
  /* Optional inventory/project context; referencing an object never reserves it. */
  contextRefs: DocumentReference[] | null
}

/* A step is either a free-text ToDo or a concrete inventory action. */
export type TaskStepPayload = TaskTextStepPayload | TaskInventoryStepPayload

/*
 * Outcome recorded when a step is resolved. `performedAt` is the executor-reported occurrence time
 * (may be backdated for paper work); `recordedAt` is trusted server time of electronic
 * confirmation. `receiptLogRef` links the inventory action receipt appended to the target.
 */
export interface TaskStepOutcome {
  result: TaskStepResult
  performedBy: TypedDocumentReference<FirnUser> | null
  performedAt: string | null
  recordedAt: string
  source: TaskExecutionSource
  notes: string | null
  /* Idempotency key of the operation that produced this outcome. */
  operationId: string | null
  /* Reference to the inventory action-log receipt, when a physical change was recorded. */
  receiptLogRef: TypedDocumentReference | null
  failureReason: string | null
}

// ---------------------------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------------------------

/*
 * Automated cleanup scope. One current appendable cleanup task exists per scope; `generation`
 * advances when a scope's task is closed so overlapping workers do not reopen a finished task.
 */
export interface TaskCleanupScope {
  kind: 'equipment' | 'room' | 'unlocated'
  /* The storage equipment or room the scope groups by; null for the unlocated fallback. */
  ref: TypedDocumentReference<StorageEquipment | Room> | null
  generation: number
}

/*
 * Aggregate task document. Sharing, visibility, priority, due date and links live here; steps are
 * stored separately as TaskStepDocument so one colleague's edit or an appended expiry reminder
 * never rewrites the whole task. Derived counters (see DisplayTask.progress) are display data and
 * are never the source of execution truth.
 */
export interface TaskDocument extends BaseDocument {
  type: 'task'
  schema: 1
  /* Stable URL slug (public identity), not the CouchDB _id. */
  slug: string
  title: string
  description: string | null
  creator: TaskActor
  /* The sole agent permitted to manage sharing, visibility, ownership and structural edits. */
  managingOwner: TaskActor
  /* Colleagues who may claim, activate and execute eligible work. */
  responsibleUsers: TypedDocumentReference<FirnUser>[]
  /* Read-only members. */
  viewers: TypedDocumentReference<FirnUser>[]
  visibility: TaskVisibility
  status: TaskStatus
  importance: TaskImportance
  /* Optional calendar due date (ISO 8601 date, Europe/Stockholm interpreted). */
  dueDate: string | null
  /* Task-level project links, keyed by the external project document _id (deduplicated). */
  projectRefs: DocumentReference[] | null
  /* Task-level inventory context links; contextual only, they do not acquire holds. */
  inventoryRefs: TypedDocumentReference<Container | InventoryItem | StorageEquipment | Room>[] | null
  /* Present only for system-generated cleanup tasks. */
  cleanupScope: TaskCleanupScope | null
  /* Optimistic-concurrency counter for metadata/structural edits (distinct from _rev). */
  editVersion: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
  /* Independent archival axis; an archived task may be in any status. */
  archivedAt: string | null
}

/*
 * One step of a task, stored as its own document. A step belongs to exactly one task and carries
 * no sharing fields. `definitionVersion` increments on every edit to the planned definition so an
 * activation can detect a stale checklist; active executable definitions are never edited in place.
 */
export interface TaskStepDocument extends BaseDocument {
  type: 'taskStep'
  schema: 1
  /* Public stable step identifier, unique within its task. */
  stepId: string
  task: TypedDocumentReference<TaskDocument>
  /* Stable checklist display order; does not by itself enforce execution order. */
  order: number
  /* stepIds of prerequisites within the same task (validated acyclic). */
  dependsOn: string[]
  payload: TaskStepPayload
  state: TaskStepState
  definitionVersion: number
  outcome: TaskStepOutcome | null
  createdAt: string
  updatedAt: string
}

/* Lifecycle of an activation (a frozen, held unit of selected executable work). */
export type TaskActivationState
  = | 'preparing'
    | 'active'
    | 'finished'
    | 'cancelling'
    | 'cancelled'
    | 'needs_reconciliation'

/* Kind of task-owned reservation claim recorded against an inventory resource document. */
export type TaskReservationKind = 'target' | 'capacity' | 'gridCell' | 'structural'

/* Durable lifecycle of a single reservation claim; supports idempotent consume/release. */
export type TaskReservationState = 'pending' | 'held' | 'consumed' | 'released'

/*
 * One task-owned hold recorded in an activation's reservation manifest. The authoritative
 * enforcement lives on the referenced resource document (arbitrated by its _rev via CAS); this
 * entry is the activation-side record used for recovery and release.
 */
export interface TaskReservationClaim {
  stepId: string
  /* The held resource. Never a room: rooms carry no capacity and are never a step target. */
  resource: TypedDocumentReference<Container | InventoryItem | StorageEquipment>
  claimKind: TaskReservationKind
  /* Exact cell for a gridCell claim; null otherwise. */
  position: GridPosition | null
  /* Fencing generation; a stale recovery worker cannot overwrite a newer generation. */
  generation: number
  state: TaskReservationState
}

/*
 * A step frozen into an activation. `snapshot` is the immutable executable payload at activation
 * time; `definitionVersion` pins which step definition it was taken from.
 */
export interface TaskActivationManifestEntry {
  stepId: string
  definitionVersion: number
  snapshot: TaskStepPayload
  state: TaskStepState
}

/* Provenance of a generated paper export; possession of paper is not electronic authorization. */
export interface TaskExportRecord {
  exportId: string
  activationVersion: number
  generatedAt: string
  generatedBy: TypedDocumentReference<FirnUser>
  format: 'pdf'
}

/*
 * A frozen, executor-owned unit of activated work. Holds begin at activation and persist until
 * completion, confirmed skip or explicit cancellation/reconciliation. Exactly one executor may
 * confirm its steps; `activationVersion` advances on handover and invalidates earlier exports.
 */
export interface TaskActivationDocument extends BaseDocument {
  type: 'taskActivation'
  schema: 1
  /* Public activation identity. */
  activationId: string
  task: TypedDocumentReference<TaskDocument>
  /* The sole colleague permitted to execute this activation's steps. */
  executor: TypedDocumentReference<FirnUser>
  state: TaskActivationState
  /* Advances on handover; earlier exports become invalid. */
  activationVersion: number
  manifest: TaskActivationManifestEntry[]
  reservationManifest: TaskReservationClaim[]
  exports: TaskExportRecord[]
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

/* The multi-document workflow an operation record coordinates. */
export type TaskOperationKind
  = | 'activation'
    | 'confirm'
    | 'skip'
    | 'release'
    | 'handover'
    | 'cancel'
    | 'reconcile'

/* Durable operation state used to make retries idempotent and recovery resumable. */
export type TaskOperationState
  = | 'claimed'
    | 'in_progress'
    | 'completed'
    | 'failed'
    | 'needs_reconciliation'

/* One recorded recovery milestone within an operation (e.g. "receipt-appended"). */
export interface TaskOperationProgressMarker {
  marker: string
  recordedAt: string
}

/*
 * Durable record for a single multi-document workflow invocation. `operationId` is the caller's
 * stable idempotency key; `payloadFingerprint` binds that key to a specific request so a replay
 * with a different payload is rejected rather than silently reusing a prior result.
 */
export interface TaskOperationDocument extends BaseDocument {
  type: 'taskOperation'
  schema: 1
  operationId: string
  kind: TaskOperationKind
  task: TypedDocumentReference<TaskDocument>
  activation: TypedDocumentReference<TaskActivationDocument> | null
  payloadFingerprint: string
  state: TaskOperationState
  progress: TaskOperationProgressMarker[]
  /* Opaque serialized result returned to idempotent replays; null until the operation resolves. */
  result: string | null
  createdAt: string
  updatedAt: string
}

/* Lifecycle of a per-item expiry reminder occurrence. */
export type ExpiryReminderState = 'eligible' | 'planned' | 'snoozed' | 'resolved' | 'reconciled'

/* A snooze decision: defer the current reminder to a future date with a required reason. */
export interface ExpiryReminderSnooze {
  until: string
  reason: string
}

/*
 * Per-item disposal reminder state (implemented in the expiry phase). Deduplicated per item +
 * occurrence; an eligible expiry date produces a reminder, never an automatic status change or
 * disposal.
 */
export interface ExpiryReminderDocument extends BaseDocument {
  type: 'expiryReminder'
  schema: 1
  reminderId: string
  item: TypedDocumentReference<InventoryItem>
  /* Stable identity of this reminder occurrence (survives scope changes). */
  occurrenceId: string
  scope: TaskCleanupScope
  /* The preliminary disposal step currently representing this reminder, when one exists. */
  currentStep: TypedDocumentReference<TaskStepDocument> | null
  state: ExpiryReminderState
  snooze: ExpiryReminderSnooze | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------------------------
// Client-safe display projections
// ---------------------------------------------------------------------------------------------

/* Aggregated step-state counters for a task; derived, never authoritative. */
export interface TaskProgressSummary {
  total: number
  planned: number
  held: number
  executing: number
  completed: number
  skipped: number
  cancelled: number
  needsReconciliation: number
}

/* Client-safe inventory object reference (no CouchDB _id). */
export interface DisplayTaskInventoryObjectRef {
  entity: SerializedEntityRef
  pathLabel: string
}

/* Client-safe move/locate destination. */
export interface DisplayTaskInventoryDestination {
  parent: DisplayTaskInventoryObjectRef
  position: GridPosition | null
}

/* Client-safe inventory step payload (references enriched to SerializedEntityRef). */
export type DisplayTaskInventoryStepPayload = {
  kind: 'inventory'
  action: InventoryActionType
  targetKind: 'container' | 'item'
  target: DisplayTaskInventoryObjectRef
  destination: DisplayTaskInventoryDestination | null
  expectedStatus: InventoryStatusType | null
  notes: string | null
}

/* Client-safe free-text step payload. */
export interface DisplayTaskTextStepPayload {
  kind: 'text'
  title: string
  body: string | null
  contextRefs: SerializedEntityRef[] | null
}

export type DisplayTaskStepPayload = DisplayTaskTextStepPayload | DisplayTaskInventoryStepPayload

/* Client-safe step outcome. */
export interface DisplayTaskStepOutcome {
  result: TaskStepResult
  performedBy: SerializedUserRef | null
  performedAt: string | null
  recordedAt: string
  source: TaskExecutionSource
  notes: string | null
  failureReason: string | null
}

/* Client-safe projection of a task step. */
export interface DisplayTaskStep {
  stepId: string
  order: number
  dependsOn: string[]
  payload: DisplayTaskStepPayload
  state: TaskStepState
  definitionVersion: number
  outcome: DisplayTaskStepOutcome | null
  createdAt: string
  updatedAt: string
}

/* Role of the requesting user relative to a task, used to drive client affordances. */
export type DisplayTaskViewerRole = 'owner' | 'responsible' | 'viewer' | 'public'

/* Client-safe projection of a task aggregate (no CouchDB _id, no raw user refs). */
export interface DisplayTask {
  slug: string
  title: string
  description: string | null
  creator: DisplayTaskActor
  managingOwner: DisplayTaskActor
  responsibleUsers: SerializedUserRef[]
  viewers: SerializedUserRef[]
  visibility: TaskVisibility
  status: TaskStatus
  importance: TaskImportance
  /* Computed, not stored: avoids a flag going stale overnight. */
  urgency: TaskUrgency
  quadrant: TaskQuadrant
  dueDate: string | null
  projectRefs: SerializedEntityRef[] | null
  inventoryRefs: SerializedEntityRef[] | null
  progress: TaskProgressSummary
  /* The requesting user's role, resolved server-side. */
  viewerRole: DisplayTaskViewerRole
  editVersion: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
  cancelledAt: string | null
  archivedAt: string | null
}

/* Client-safe projection of an activation. */
export interface DisplayTaskActivation {
  activationId: string
  taskSlug: string
  executor: SerializedUserRef
  state: TaskActivationState
  activationVersion: number
  steps: DisplayTaskStep[]
  createdAt: string
  updatedAt: string
  finishedAt: string | null
}

/*
 * Per-step disposition returned by a batch confirmation. `already_resolved` covers a step that was
 * terminal before the batch ran; `blocked` covers an unmet dependency; `failed`/`needs_reconciliation`
 * surface execution errors without aborting the remaining steps.
 */
export type TaskBatchStepStatus
  = | 'completed'
    | 'skipped'
    | 'already_resolved'
    | 'blocked'
    | 'failed'
    | 'needs_reconciliation'

export interface DisplayTaskBatchStepResult {
  stepId: string
  status: TaskBatchStepStatus
  message: string | null
}

/* Result of a batch confirmation: per-step outcomes plus the refreshed activation projection. */
export interface DisplayTaskBatchResult {
  activationId: string
  taskSlug: string
  results: DisplayTaskBatchStepResult[]
  activation: DisplayTaskActivation
}

// ---------------------------------------------------------------------------------------------
// DEPRECATED — legacy ToDo draft
// ---------------------------------------------------------------------------------------------
//
// The following types back the pre-tasks `todo_collection` draft. They remain only so existing
// consumers (`server/crud/productivity.server.ts`, legacy helpers in `server/crud/users.server.ts`
// and `FirnUser.todoDocuments`) keep compiling until they are migrated to the task model above.
// New services and APIs must not write through these shapes.

/** @deprecated Superseded by TaskStepState. */
export type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'archived'

/** @deprecated Superseded by TaskStepDocument. */
export interface TodoItem {
  id: string
  title: string
  body?: string
  tags?: string[]
  dueDate?: string
  importance?: number
  status?: TodoStatus
  order?: number
  createdAt: string
  updatedAt?: string
  completedAt?: string
}

/** @deprecated Superseded by TaskDocument + TaskStepDocument. */
export interface TodoDocument extends BaseDocument {
  type: 'todo_collection'
  schema: 1
  owners: TypedDocumentReference<FirnUser>[]
  viewers: TypedDocumentReference<FirnUser>[]
  title: string
  description?: string
  items: TodoItem[]
  createdAt: string
  updatedAt: string
}
