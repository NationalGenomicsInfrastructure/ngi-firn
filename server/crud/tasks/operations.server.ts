/*
 * TaskOperationService - durable idempotency for the multi-document task workflows
 * (activation, confirm, skip, cancel, handover, reconcile).
 *
 * CouchDB offers no multi-document transaction, so every lab-work workflow is wrapped in a
 * TaskOperationDocument keyed by a caller-supplied `operationId`. A retried request with the same
 * operationId and an identical payload fingerprint returns the stored result instead of running the
 * side effects a second time; a replay with a *different* fingerprint is rejected rather than
 * silently reusing a prior result. This keeps retries from double-applying physical work.
 *
 * Per the project's concurrency guidance (~40 users, rarely overlapping) this stays deliberately
 * small: a single operation record plus the already-idempotent hold/consume/release primitives,
 * not a general job framework with elaborate fencing.
 */
import { createHash } from 'node:crypto'

import { couchDB, isCouchConflict } from '../../database/couchdb'
import type { TypedDocumentReference } from '../../../types/references'
import type {
  TaskActivationDocument,
  TaskDocument,
  TaskOperationDocument,
  TaskOperationKind,
  TaskOperationState
} from '../../../types/productivity'
import { TaskConflictError } from './common'

/* Deterministic fingerprint binding an operationId to the exact request it first ran. */
export function fingerprintPayload(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload ?? null)).digest('hex')
}

/*
 * An in-progress operation older than this is treated as abandoned (its process died mid-way) and
 * may be taken over by a retry. Every workflow body finishes well within it.
 */
const STALE_IN_PROGRESS_MS = 2 * 60 * 1000

const STILL_RUNNING = 'This operation is still running. Wait a moment and retry.'

/*
 * The operation document id is derived from the caller's operationId, so CouchDB itself guarantees
 * at most one operation document per operationId: a second create is a 409, never a duplicate.
 */
export function operationDocId(operationId: string): string {
  return `task-op:${operationId}`
}

async function findOperation(operationId: string): Promise<TaskOperationDocument | null> {
  const doc = await couchDB.getDocument<TaskOperationDocument>(operationDocId(operationId))
  return doc && doc.type === 'taskOperation' ? doc : null
}

export interface RunOperationParams<T> {
  operationId: string
  kind: TaskOperationKind
  task: TypedDocumentReference<TaskDocument>
  activation: TypedDocumentReference<TaskActivationDocument> | null
  /* The request payload; its fingerprint binds the idempotency key to this exact request. */
  payload: unknown
  /* The side-effecting body. Must be safe to resume: it only runs when no completed result exists. */
  execute: (op: TaskOperationDocument) => Promise<T>
  /*
   * Optional: whether a returned result means the work is fully done. When it returns false (e.g. a
   * batch in which one step failed) the result is still returned to the caller, but the operation is
   * stored as failed, so retrying the same operationId runs the body again instead of replaying a
   * partial result forever.
   */
  isComplete?: (result: T) => boolean
}

/*
 * Run a workflow body at most once at a time per operationId, and at most once to completion.
 *  - A completed operation replays its stored result.
 *  - An operation another request is currently running is refused (retry shortly), never run twice
 *    in parallel.
 *  - A failed operation, or one abandoned in progress, is taken over and its body runs again. The
 *    body must therefore be resume-safe, which it is because the hold and step primitives it calls
 *    are individually idempotent and physical actions are guarded by their inventory receipt.
 */
export async function runOperation<T>(params: RunOperationParams<T>): Promise<T> {
  const fingerprint = fingerprintPayload(params.payload)
  const existing = await findOperation(params.operationId)

  if (existing) {
    if (existing.payloadFingerprint !== fingerprint) {
      throw new TaskConflictError('This operation id was already used for a different request.')
    }
    if (existing.state === 'completed' && existing.result !== null) {
      return JSON.parse(existing.result) as T
    }
  }

  const op = existing ? await takeOver(existing) : await createOperation(params, fingerprint)

  let result: T
  try {
    result = await params.execute(op)
  }
  catch (error) {
    await markFailed(op, error instanceof Error ? error.message : String(error))
    throw error
  }
  if (params.isComplete && !params.isComplete(result)) {
    await persistState(op, 'failed', JSON.stringify(result ?? null))
  }
  else {
    await persistState(op, 'completed', JSON.stringify(result ?? null))
  }
  return result
}

/* Claim an existing, not-completed operation for this request, or refuse while another one runs it. */
async function takeOver(existing: TaskOperationDocument): Promise<TaskOperationDocument> {
  const age = Date.now() - new Date(existing.updatedAt).getTime()
  if (existing.state === 'in_progress' && age < STALE_IN_PROGRESS_MS) {
    throw new TaskConflictError(STILL_RUNNING)
  }
  const claimed: TaskOperationDocument = { ...existing, state: 'in_progress', updatedAt: new Date().toISOString() }
  try {
    const written = await couchDB.updateDocument(existing._id, claimed, existing._rev!)
    return { ...claimed, _rev: written.rev }
  }
  catch (error) {
    // Another retry claimed it first.
    if (isCouchConflict(error)) throw new TaskConflictError(STILL_RUNNING)
    throw error
  }
}

async function createOperation<T>(
  params: RunOperationParams<T>,
  fingerprint: string
): Promise<TaskOperationDocument> {
  const now = new Date().toISOString()
  const doc: Omit<TaskOperationDocument, '_rev'> = {
    _id: operationDocId(params.operationId),
    type: 'taskOperation',
    schema: 1,
    operationId: params.operationId,
    kind: params.kind,
    task: params.task,
    activation: params.activation,
    payloadFingerprint: fingerprint,
    state: 'in_progress',
    result: null,
    createdAt: now,
    updatedAt: now
  }
  try {
    const result = await couchDB.createDocument(doc)
    return { ...doc, _rev: result.rev }
  }
  catch (error) {
    // A concurrent request with the same operationId created the document first and is running it.
    if (isCouchConflict(error)) throw new TaskConflictError(STILL_RUNNING)
    throw error
  }
}

async function markFailed(op: TaskOperationDocument, reason: string): Promise<void> {
  await persistState(op, 'failed', JSON.stringify({ error: reason }))
}

async function persistState(
  op: TaskOperationDocument,
  state: TaskOperationState,
  result: string | null
): Promise<void> {
  const updated: TaskOperationDocument = {
    ...op,
    state,
    result,
    updatedAt: new Date().toISOString()
  }
  try {
    const written = await couchDB.updateDocument(op._id, updated, op._rev!)
    op._rev = written.rev
    op.state = state
    op.result = result
  }
  catch (error) {
    if (!isCouchConflict(error)) throw error
    // Lost the race to record terminal state; the winning writer already recorded it.
  }
}
