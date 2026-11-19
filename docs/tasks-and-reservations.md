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

## Module boundaries

Server modules under `server/crud/inventory` must not import the task services (`tasks.server.ts`, `steps.server.ts`, `execution.server.ts`, and so on). They may import `server/crud/tasks/invalidation.server.ts`. That module and `stepState.server.ts` deliberately avoid importing the inventory services, which is what keeps the dependency graph free of cycles. Keep it that way when adding imports to either.

## Authorization

Task permission rules live in `server/auth/taskPolicy.ts` and throw `ForbiddenError` (or `AuthorizationError` for read access). Do not write inline `executor.id === actor._id` style checks in services; add or reuse a policy helper. Changing sharing or ownership is refused while it would leave the executor of an active activation without the right to execute it: hand the activation over or cancel it first.
