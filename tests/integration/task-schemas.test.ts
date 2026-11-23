/*
 * Unit tests for the task input schemas (schemas/tasks). No database: these only check that the
 * wire format refuses impossible requests before any service runs, and accepts every valid shape.
 */
import { describe, expect, it } from 'vitest'

import { operationIdSchema } from '../../schemas/tasks/common'
import { createTaskSchema } from '../../schemas/tasks/tasks'
import { stepPayloadInputSchema } from '../../schemas/tasks/steps'
import { confirmStepSchema, reconcileSchema } from '../../schemas/tasks/execution'
import { taskInventoryActionSchema, taskViewerRoleSchema } from '../../schemas/tasks/enums'

const item = { kind: 'item', slug: 'vial-1' } as const
const container = { kind: 'container', slug: 'box-1' } as const
const destination = { kind: 'container', slug: 'box-2', position: { row: 1, column: 2 } } as const

describe('step payload schema', () => {
  it.each([
    ['checkout of an item', { kind: 'inventory', action: 'checkout', target: item }],
    ['return of a container', { kind: 'inventory', action: 'return', target: container }],
    ['move to a grid cell', { kind: 'inventory', action: 'move', target: item, destination }],
    ['move to an equipment without a cell', { kind: 'inventory', action: 'move', target: container, destination: { kind: 'equipment', slug: 'freezer' } }],
    ['locate', { kind: 'inventory', action: 'locate', target: item, destination, expectedStatus: 'lost' }],
    ['dispose of an item', { kind: 'inventory', action: 'dispose', target: item, notes: 'expired' }],
    ['text with context', { kind: 'text', title: 'Thaw', contextRefs: [{ kind: 'project', slug: 'P12345' }, container] }]
  ])('accepts %s', (_label, payload) => {
    expect(stepPayloadInputSchema.safeParse(payload).success).toBe(true)
  })

  it.each([
    ['dispose of a container', { kind: 'inventory', action: 'dispose', target: container }],
    ['move without a destination', { kind: 'inventory', action: 'move', target: item }],
    ['locate without a destination', { kind: 'inventory', action: 'locate', target: item }],
    ['a room destination', { kind: 'inventory', action: 'move', target: item, destination: { kind: 'room', slug: 'lab' } }],
    ['an equipment target', { kind: 'inventory', action: 'checkout', target: { kind: 'equipment', slug: 'freezer' } }],
    ['an action tasks cannot plan', { kind: 'inventory', action: 'reserve', target: item }],
    ['an unknown expected status', { kind: 'inventory', action: 'checkout', target: item, expectedStatus: 'misplaced' }],
    ['a blank text title', { kind: 'text', title: '   ' }],
    ['an unknown payload kind', { kind: 'note', title: 'x' }]
  ])('rejects %s', (_label, payload) => {
    expect(stepPayloadInputSchema.safeParse(payload).success).toBe(false)
  })
})

describe('workflow schemas', () => {
  it('accepts a UUID operation id and rejects ids unsafe for a document id', () => {
    expect(operationIdSchema.safeParse(crypto.randomUUID()).success).toBe(true)
    expect(operationIdSchema.safeParse('short').success).toBe(false)
    expect(operationIdSchema.safeParse('has spaces in it').success).toBe(false)
    expect(operationIdSchema.safeParse('slash/../escape-attempt').success).toBe(false)
  })

  it('validates the execution source and the reported timestamp', () => {
    const base = { stepId: 's1', activationId: 'a1', operationId: crypto.randomUUID() }
    expect(confirmStepSchema.safeParse({ ...base, source: 'paper', reportedAt: '2026-11-19T10:00:00+01:00' }).success).toBe(true)
    expect(confirmStepSchema.safeParse({ ...base, source: 'fax' }).success).toBe(false)
    expect(confirmStepSchema.safeParse({ ...base, source: 'paper', reportedAt: 'yesterday' }).success).toBe(false)
  })

  it('only lets a reconciliation declare a step completed or skipped', () => {
    const base = { activationId: 'a1', operationId: crypto.randomUUID() }
    expect(reconcileSchema.safeParse({ ...base, resolutions: [{ stepId: 's1', result: 'skipped' }] }).success).toBe(true)
    expect(reconcileSchema.safeParse({ ...base, resolutions: [{ stepId: 's1', result: 'failed' }] }).success).toBe(false)
  })
})

describe('task schemas', () => {
  it('requires a calendar due date and a non-blank title', () => {
    expect(createTaskSchema.safeParse({ title: 'Clean freezer', dueDate: '2026-12-01' }).success).toBe(true)
    expect(createTaskSchema.safeParse({ title: 'Clean freezer', dueDate: '01/12/2026' }).success).toBe(false)
    expect(createTaskSchema.safeParse({ title: '  ' }).success).toBe(false)
  })

  it('rejects linking a project as inventory context', () => {
    expect(createTaskSchema.safeParse({ title: 'x', inventoryRefs: [{ kind: 'project', slug: 'P1' }] }).success).toBe(false)
  })
})

describe('enum schemas', () => {
  it('exposes the value lists the client renders', () => {
    expect(taskViewerRoleSchema.options).toEqual(['owner', 'responsible', 'viewer', 'public'])
    expect(taskInventoryActionSchema.options).toEqual(['checkout', 'return', 'move', 'locate', 'dispose'])
  })
})
