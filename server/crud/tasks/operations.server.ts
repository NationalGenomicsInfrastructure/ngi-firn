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

import { couchDB, generateCouchDocId } from '../../database/couchdb'
import type { TypedDocumentReference } from '../../../types/references'
import type {
  TaskActivationDocument,
  TaskDocument,
  TaskOperationDocument,
  TaskOperationKind,
  TaskOperationState
} from '../../../types/productivity'
import { TaskConflictError, isCouchConflict } from './common'

/* Deterministic fingerprint binding an operationId to the exact request it first ran. */
export function fingerprintPayload(payload: unknown): string {
  return createHash('sha1').update(JSON.stringify(payload ?? null)).digest('hex')
}

async function findOperation(operationId: string): Promise<TaskOperationDocument | null> {
  const rows = (await couchDB.queryView<string, null, TaskOperationDocument>('firn-tasks', 'operations_by_key', {
    key: operationId,
    include_docs: true
  })).rows
  const doc = rows.map(r => r.doc).find((d): d is TaskOperationDocument => !!d && d.type === 'taskOperation')
  return doc ?? null
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
}

/*
 * Run a workflow body exactly once per operationId. Returns the stored result on an idempotent
 * replay. The body itself must be resume-safe (it re-runs on a prior in-progress/failed attempt),
 * which it is because the hold and step primitives it calls are individually idempotent.
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

  const op = existing ?? await createOperation(params, fingerprint)

  try {
    const result = await execute(op, params.execute)
    await completeOperation(op, result)
    return result
  }
  catch (error) {
    await markFailed(op, error instanceof Error ? error.message : String(error))
    throw error
  }
}

async function createOperation<T>(
  params: RunOperationParams<T>,
  fingerprint: string
): Promise<TaskOperationDocument> {
  const now = new Date().toISOString()
  const doc: TaskOperationDocument = {
    _id: generateCouchDocId('task-op'),
    type: 'taskOperation',
    schema: 1,
    operationId: params.operationId,
    kind: params.kind,
    task: params.task,
    activation: params.activation,
    payloadFingerprint: fingerprint,
    state: 'in_progress',
    progress: [],
    result: null,
    createdAt: now,
    updatedAt: now
  }
  try {
    const result = await couchDB.createDocument(doc)
    return { ...doc, _id: result.id, _rev: result.rev }
  }
  catch (error) {
    // A concurrent request created the same operation first; adopt it rather than double-running.
    if (isCouchConflict(error)) {
      const adopted = await findOperation(params.operationId)
      if (adopted) return adopted
    }
    throw error
  }
}

async function execute<T>(
  op: TaskOperationDocument,
  body: (op: TaskOperationDocument) => Promise<T>
): Promise<T> {
  return body(op)
}

/* Append a recovery milestone to an operation (best-effort, never blocks the workflow). */
export async function recordMarker(op: TaskOperationDocument, marker: string): Promise<void> {
  const updated: TaskOperationDocument = {
    ...op,
    progress: [...op.progress, { marker, recordedAt: new Date().toISOString() }],
    updatedAt: new Date().toISOString()
  }
  try {
    const result = await couchDB.updateDocument(op._id, updated, op._rev!)
    op._rev = result.rev
    op.progress = updated.progress
    op.updatedAt = updated.updatedAt
  }
  catch {
    // Progress markers are advisory; a lost marker does not affect correctness.
  }
}

async function completeOperation<T>(op: TaskOperationDocument, result: T): Promise<void> {
  await persistState(op, 'completed', JSON.stringify(result ?? null))
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
