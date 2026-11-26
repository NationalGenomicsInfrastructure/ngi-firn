# Tasks and Reservations: Pitfalls

Tasks (`server/crud/tasks`) plan inventory work as steps. Activating a task places holds on the inventory objects the steps touch, and an executor then confirms the steps one by one. The reservation state lives on the inventory documents (`server/crud/inventory/reservations.server.ts`, `reservationState.ts`). These rules keep the two sides consistent. Each one exists because a review found a bug when it was ignored.

## One owner of step state

The step document is the only source of step state. An activation's state is derived from its step documents via `refreshActivationState`, and its manifest is an immutable snapshot taken at activation. Never write step state anywhere else, and never edit the manifest to reflect progress. A second copy of the state will drift from the first after the first failed write.

## Claim identity is (activation, step)

Parent-side claims (a grid cell, a capacity unit) are excluded from occupancy checks only for the exact step that owns them. Another step of the same activation must still see them as taken, otherwise two steps can end up in one cell. A target hold is the exception: it is shared by all steps of one activation via `stepIds`, because they act on the same object.

## Placement must be hold-aware

Any code that places inventory (create, move, locate, batch moves, auto-placement) must respect holds. Use `findFirstFreeUnheldGridSlot`, `allocatableCount` and `allocatableGridSlots`, and pass `executionAllowance(execution)` through the occupancy adjusters so a step can use its own claim. Never release a reservation before the write it protects has committed, or another request can take the slot in between.

## Deleting is never blocked by task state

Deleting inventory is not refused because a task refers to it. Every delete path calls `invalidateStepsAfterDelete`, which cancels the steps that refer to the deleted object and the steps depending on them, and releases their holds. Claims only block occupying a slot, not removing the object.

## Operations and resumability

Operation documents have the deterministic id `task-op:<operationId>`, which makes a retried request find the earlier run. A workflow body therefore has to be resume-safe: it can be entered again after a partial failure and must not repeat completed work. Physical actions are deduplicated by the inventory action receipt (activation + step), not by operation id.

An operation document has only three states: `completed` (a retry replays the stored result), `failed` (a retry runs the body again) and `in_progress` (a retry is refused until the run goes stale). It does not record progress markers. A resumed body works out how far it got from the documents it changes (receipt, hold ledger, step state), because each of those is written together with its change. A marker written in a separate step can fall behind after a crash. Reconciliation belongs to the activation and its steps, not to the operation.

## Schemas, wire format and the router

Task enums and procedure inputs are defined once, as Zod schemas in `schemas/tasks/`. TypeScript types are derived with `z.infer` and re-exported from `types/productivity.ts`, so never add a parallel union or input interface there. Stored documents, the `Display*` projections and enums the client never sees (operation, reservation and reminder states) remain static types, because nothing validates them.

The wire format uses public identifiers only: inventory by kind + slug, projects by LIMS project id, tasks by slug. `server/crud/tasks/references.server.ts` is the one place that resolves them to stored references and captures the display snapshot (name, path) of a planned step. Services take the inferred schema types. System callers that already hold stored payloads use `TaskStepService.insertSteps`.

The `tasks` tRPC router (`server/trpc/routers/tasks/`) builds on `taskProcedure`. It requires a signed-in Firn user and maps domain errors to tRPC codes by their `name`:

| Error | Code |
|---|---|
| `TaskNotFoundError` | `NOT_FOUND` |
| `AuthorizationError` | `NOT_FOUND`, so a private task never reveals that it exists |
| `ForbiddenError` | `FORBIDDEN` |
| `TaskValidationError` | `BAD_REQUEST` |
| `TaskConflictError`, `ReservationConflictError` | `CONFLICT` |

A new domain error class needs a `name` and an entry in that map, or it reaches the client as a 500.

## Client cache (Pinia Colada)

Task queries live in `app/utils/queries/tasks/` and task mutations in `app/utils/mutations/tasks/`. They mirror the router split and share one key factory, `TASKS_QUERY_KEYS`. All listings sit under `['tasks', 'list']`, and a task's steps and activations sit under its `detail(slug)` key. Invalidating a key refreshes the keys below it, but not the keys above it. A step or activation mutation must therefore invalidate `detail(slug)` and `lists()` itself (`invalidateTaskWork`), because a task's progress and status are derived from its steps.

Task work changes the inventory, so the workflow mutations refresh inventory caches through the helpers in `app/utils/mutations/tasks/cache.ts`:

- **Activate and skip** change holds only. `invalidateHoldSensitive` refreshes capacity, grid occupancy, move targets and accepted children, all of which subtract held claims. Inventory details stay as they are, because the inventory `Display*` types do not show holds.
- **Confirm, batch confirm, cancel and reconcile** record physical work. `invalidatePhysical` also refreshes item and container lists, details, action logs and the counts. A move's source parent is not in the step payload, so the item and container roots are refreshed whole.
- **Inventory deletes** go the other way. They cancel task steps on the server (`invalidateStepsAfterDelete`), so the item, container and equipment delete mutations invalidate `TASKS_QUERY_KEYS.root`.

Workflow mutations are not optimistic, unlike the general mutation rule. Showing a step as done before the server confirms it would mislead the person at the bench if the call then fails, for example with a reservation conflict. The cache is written from the response, and every workflow mutation refreshes in `onSettled`, even after an error, because a failed run may have completed part of its work. Only cheap planning edits are optimistic: task metadata, removing a planned step and reordering.

The mutation wrapper generates the `operationId` before calling `mutate`, so the id is part of the mutation `variables`. To retry after a network failure, resend the same variables with the same id. The server then replays the stored result instead of doing the work twice. Generating a new id on retry turns the retry into a new operation.

## Priority is computed, never stored

Importance is stored; urgency and the quadrant are derived on every read by `computeUrgency` / `computeQuadrant` in `server/crud/tasks/common.ts`. A task is urgent when its due date is overdue or within `TASK_URGENCY_HORIZON_WORKDAYS` (3, weekends skipped), or when an important task without a due date has gone `TASK_AGING_DAYS` (14) without an update (`updatedAt`, so touching a task resets the clock), so it cannot be overlooked (`urgencyReason: 'aged'`). Do not use step count as effort: one physical move is one step, so a 40-step cleanup can take minutes. The viewer role never changes the quadrant; it decides which list a task appears in.

## Module boundaries

Server modules under `server/crud/inventory` must not import the task services (`tasks.server.ts`, `steps.server.ts`, `execution.server.ts`, and so on). They may import `server/crud/tasks/invalidation.server.ts`. That module and `stepState.server.ts` deliberately avoid importing the inventory services, which is what keeps the dependency graph free of cycles. Keep it that way when adding imports to either, and never import `references.server.ts` from them, because it reads the inventory services.

## Authorization

Task permission rules live in `server/auth/taskPolicy.ts` and throw `ForbiddenError` (or `AuthorizationError` for read access). That includes what a task's state still allows: only a draft that is not archived can be published; a completed or archived task cannot be cancelled; and responsibility cannot be released on a closed (completed or cancelled) or archived task. Repeating a transition the task has already made (publishing an open task, cancelling a cancelled one) returns it unchanged. The server is the only authority: the client (`app/utils/tasks/actions.ts`) hides or disables buttons to match, and must never restrict something the server accepts. Do not write inline `executor.id === actor._id` style checks in services; add or reuse a policy helper. Changing sharing or ownership is refused while it would leave the executor of an active activation without the right to execute it: hand the activation over or cancel it first.
